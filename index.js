const puppeteer = require('puppeteer');
const readline = require('readline');
const path = require('path');

const { loadConfig } = require('./lib/config');
const {
  findAnswer,
  mergeWordLists,
  learnAnswer,
  loadDictionary,
  saveDictionary,
} = require('./lib/dictionary');
const SELECTORS = require('./lib/selectors');

const BASE_DIR = __dirname;

const State = {
  BOOTING: 'booting',
  NEED_CONFIG: 'need_config',
  LOGGING_IN: 'logging_in',
  READY: 'ready',
  REFRESHING: 'refreshing',
  ANSWERING: 'answering',
  PAUSED: 'paused',
  WAITING_UNKNOWN: 'waiting_unknown',
  ERROR: 'error',
};

function emit(type, payload = {}) {
  // Structured events for the Electron GUI (one JSON object per line).
  process.stdout.write(`${JSON.stringify({ type, ...payload, ts: Date.now() })}\n`);
}

function log(message, level = 'info') {
  emit('log', { level, message });
  if (process.stderr.isTTY) {
    console.error(`[${level}] ${message}`);
  }
}

function emitStatus(extra = {}) {
  emit('status', {
    state: runtime.state,
    ready: [State.READY, State.ANSWERING, State.PAUSED, State.WAITING_UNKNOWN, State.REFRESHING].includes(
      runtime.state
    ),
    answering: runtime.state === State.ANSWERING,
    autoSubmit: runtime.autoSubmit,
    delayMs: runtime.delayMs,
    dictSize: Object.keys(runtime.fullDict).length,
    ...extra,
  });
}

const runtime = {
  state: State.BOOTING,
  autoSubmit: true,
  delayMs: 80,
  fullDict: {},
  cutDict: {},
  page: null,
  browser: null,
  loopToken: 0,
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function persistDictionary() {
  try {
    saveDictionary(BASE_DIR, runtime.fullDict, runtime.cutDict);
  } catch (error) {
    log(`Failed to save dictionary: ${error.message}`, 'error');
  }
}

async function wordList(selector) {
  return runtime.page.$$eval(selector, (els) => els.map((el) => el.textContent));
}

async function refreshWords() {
  if (!runtime.page) throw new Error('Browser page is not ready');
  runtime.state = State.REFRESHING;
  emitStatus();

  const baseWords = await wordList(SELECTORS.baseList);
  const targetWords = await wordList(SELECTORS.targetList);
  const merged = mergeWordLists(runtime.fullDict, runtime.cutDict, baseWords, targetWords);
  runtime.fullDict = merged.fullDict;
  runtime.cutDict = merged.cutDict;
  persistDictionary();

  log(`Word lists refreshed (${Object.keys(runtime.fullDict).length} entries).`);
  runtime.state = State.READY;
  emitStatus();
}

async function getModalAnswered() {
  return runtime.page.$$eval('td#users-answer-field > *', (els) => {
    let answered = '';
    els.forEach((el) => {
      if (el.textContent !== null && el.style.color !== 'rgba(0, 0, 0, 0.25)') {
        answered += el.textContent;
      }
    });
    return answered;
  });
}

async function deleteModals() {
  await runtime.page.$$eval(SELECTORS.modal, (els) => els.forEach((el) => el.remove()));
  await runtime.page.$$eval(SELECTORS.modalBackdrop, (els) => els.forEach((el) => el.remove()));
}

async function correctAnswer(question, answer) {
  await runtime.page.waitForFunction(
    (css) => {
      const el = document.querySelector(css);
      return el && el.textContent && el.textContent !== 'blau';
    },
    { timeout: 5000 },
    SELECTORS.modalQuestion
  );

  const modalQuestion = await runtime.page.$eval(SELECTORS.modalQuestion, (el) => el.textContent);
  const modalAnswer = await runtime.page.$eval(SELECTORS.modalCorrectAnswer, (el) => el.textContent);
  const modalAnswered = await getModalAnswered();

  await runtime.page.$eval(SELECTORS.continueButton, (el) => {
    el.disabled = false;
  });
  await runtime.page.click(SELECTORS.continueButton);

  const learned = learnAnswer(runtime.fullDict, runtime.cutDict, question, modalAnswer);
  runtime.fullDict = learned.fullDict;
  runtime.cutDict = learned.cutDict;
  persistDictionary();

  log(
    `Learned correction for "${question}" => "${modalAnswer}" (typed: ${answer}; modalQ: ${modalQuestion}; detected: ${modalAnswered})`
  );
}

async function readQuestion() {
  return runtime.page.$eval(SELECTORS.question, (el) => el.textContent);
}

async function waitForQuestionChange(previous, token) {
  const started = Date.now();
  while (runtime.loopToken === token && runtime.state === State.ANSWERING) {
    const current = await readQuestion().catch(() => null);
    if (current && current !== previous) return current;
    if (Date.now() - started > 8000) return current || previous;
    await wait(40);
  }
  return null;
}

async function handleModal(question, answer) {
  const hasModal = await runtime.page.$(SELECTORS.modal);
  if (!hasModal) return 'none';

  if ((await runtime.page.$(SELECTORS.modalQuestion)) !== null) {
    await correctAnswer(question, answer);
    await deleteModals();
    return 'corrected';
  }

  if (await runtime.page.$(SELECTORS.exitButton)) {
    await runtime.page.click(SELECTORS.exitButton);
    return 'finished';
  }

  if (await runtime.page.$(SELECTORS.exitContinueButton)) {
    await runtime.page.click(SELECTORS.exitContinueButton);
    return 'finished';
  }

  await deleteModals();
  return 'dismissed';
}

async function answerLoop(token) {
  log('Answer loop started.');
  runtime.state = State.ANSWERING;
  emitStatus();

  let lastQuestion = null;

  while (runtime.loopToken === token && runtime.state === State.ANSWERING) {
    let question;
    try {
      question = await readQuestion();
    } catch {
      log('Question field not found; stopping loop.', 'warn');
      break;
    }

    if (lastQuestion && question === lastQuestion) {
      question = await waitForQuestionChange(lastQuestion, token);
      if (!question || runtime.loopToken !== token || runtime.state !== State.ANSWERING) break;
    }

    const answer = findAnswer(question, runtime.fullDict, runtime.cutDict);
    if (!answer) {
      runtime.state = State.WAITING_UNKNOWN;
      emitStatus({ lastQuestion: question });
      log(`Unknown question: "${question}". Refresh words or answer manually, then Start again.`, 'warn');
      break;
    }

    await runtime.page.click(SELECTORS.answerBox, { clickCount: 3 });
    await runtime.page.keyboard.sendCharacter(answer);

    if (runtime.autoSubmit) {
      await runtime.page.keyboard.press('Enter');
    }

    await wait(runtime.delayMs);

    const modalResult = await handleModal(question, answer);
    if (modalResult === 'finished') {
      log('Task finished.');
      break;
    }

    lastQuestion = question;
    await wait(Math.max(20, Math.floor(runtime.delayMs / 2)));
  }

  await deleteModals().catch(() => {});

  if (runtime.state === State.ANSWERING) {
    runtime.state = State.READY;
  }
  emitStatus();
  log('Answer loop exited.');
}

function startLoop() {
  if (runtime.state === State.ANSWERING) {
    log('Answer loop already running.', 'warn');
    return;
  }
  runtime.loopToken += 1;
  const token = runtime.loopToken;
  answerLoop(token).catch((error) => {
    log(`Answer loop error: ${error.message}`, 'error');
    runtime.state = State.ERROR;
    emitStatus();
    runtime.state = State.READY;
    emitStatus();
  });
}

function stopLoop() {
  if (runtime.state === State.ANSWERING || runtime.state === State.WAITING_UNKNOWN) {
    runtime.loopToken += 1;
    runtime.state = State.PAUSED;
    emitStatus();
    log('Answer loop paused.');
    runtime.state = State.READY;
    emitStatus();
  }
}

function toggleLoop() {
  if (runtime.state === State.ANSWERING) stopLoop();
  else startLoop();
}

function toggleAutoSubmit() {
  runtime.autoSubmit = !runtime.autoSubmit;
  log(runtime.autoSubmit ? 'Switched to auto-submit mode.' : 'Switched to semi-auto mode (no Enter).');
  emitStatus();
}

function setDelay(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) {
    log(`Invalid delay: ${ms}`, 'warn');
    return;
  }
  runtime.delayMs = Math.min(5000, Math.max(0, Math.round(value)));
  log(`Delay set to ${runtime.delayMs}ms.`);
  emitStatus();
}

async function handleCommand(raw) {
  const input = String(raw || '').trim();
  if (!input) return;

  const [command, ...rest] = input.split(/\s+/);
  switch (command) {
    case 'refresh':
      await refreshWords();
      break;
    case 'start':
      startLoop();
      break;
    case 'stop':
      stopLoop();
      break;
    case 'toggle':
      toggleLoop();
      break;
    case 'autosubmit':
      toggleAutoSubmit();
      break;
    case 'speed':
    case 'delay':
      setDelay(rest[0]);
      break;
    case 'status':
      emitStatus();
      break;
    case 'exit':
      if (runtime.browser) await runtime.browser.close();
      process.exit(0);
      break;
    default:
      log(`Unknown command: ${command}`, 'warn');
      break;
  }
}

async function bootstrap() {
  const config = loadConfig(BASE_DIR);
  runtime.delayMs = config.delayMs;
  runtime.autoSubmit = config.autoSubmit !== false;

  const dict = loadDictionary(BASE_DIR);
  runtime.fullDict = dict.fullDict;
  runtime.cutDict = dict.cutDict;

  if (config._missing || !config.email || !config.password || config.email.includes('YOUR_EMAIL')) {
    runtime.state = State.NEED_CONFIG;
    emitStatus({ configPath: config._path });
    log(
      `Missing config. Copy config.example.json to config.json and fill in credentials (${config._path}).`,
      'error'
    );
    if (config._error) log(`Config parse error: ${config._error}`, 'error');
  }

  log('Launching browser...');
  runtime.browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    handleSIGINT: false,
  });
  runtime.page = (await runtime.browser.pages())[0] || (await runtime.browser.newPage());

  await runtime.page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });
  await runtime.page.waitForSelector(SELECTORS.username);

  if (runtime.state !== State.NEED_CONFIG) {
    runtime.state = State.LOGGING_IN;
    emitStatus();
    log('Filling login details...');
    await runtime.page.type(SELECTORS.username, config.email);
    await runtime.page.type(SELECTORS.password, config.password);
    await runtime.page.keyboard.press('Enter');
  } else {
    log('Waiting for manual login (config incomplete).');
  }

  runtime.state = State.READY;
  emitStatus();
  log('Education Perfected ready. Open a list task, Refresh words, then Start.');
  log(`Loaded dictionary entries: ${Object.keys(runtime.fullDict).length}`);

  await runtime.page.exposeFunction('__epRefresh', () => handleCommand('refresh'));
  await runtime.page.exposeFunction('__epToggle', () => handleCommand('toggle'));
  await runtime.page.exposeFunction('__epAuto', () => handleCommand('autosubmit'));

  await runtime.page.evaluate(() => {
    document.addEventListener('keyup', async (event) => {
      const key = event.key.toLowerCase();
      if (key === 'alt') return;
      if ((event.altKey && key === 'r') || key === '®') await window.__epRefresh();
      else if ((event.altKey && key === 's') || key === 'ß') await window.__epToggle();
      else if ((event.altKey && key === 'a') || key === 'å') await window.__epAuto();
    });
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    handleCommand(line).catch((error) => log(error.message, 'error'));
  });

  runtime.browser.on('disconnected', () => {
    log('Browser closed.');
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  runtime.state = State.ERROR;
  emitStatus();
  log(`Fatal: ${error.message}`, 'error');
  process.exit(1);
});
