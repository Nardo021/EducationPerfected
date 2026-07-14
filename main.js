const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let puppeteerScript = null;
let stdoutBuffer = '';

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function parseBotLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const event = JSON.parse(trimmed);
      if (event.type === 'status') {
        sendToRenderer('bot-status', event);
        return;
      }
      if (event.type === 'log') {
        sendToRenderer('bot-log', event);
        return;
      }
    } catch {
      // fall through to plain log
    }
  }

  sendToRenderer('bot-log', { level: 'info', message: trimmed, ts: Date.now() });
}

function handleStdout(chunk) {
  stdoutBuffer += chunk.toString();
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() || '';
  lines.forEach(parseBotLine);
}

function startBotProcess() {
  if (puppeteerScript) return;

  puppeteerScript = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  puppeteerScript.stdout.on('data', handleStdout);
  puppeteerScript.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (!message) return;
    console.error(`[Bot stderr] ${message}`);
    // Bot mirrors human-readable logs to stderr; keep GUI in sync.
    const plain = message.replace(/^\[(info|warn|error)\]\s*/i, '');
    const levelMatch = message.match(/^\[(info|warn|error)\]/i);
    sendToRenderer('bot-log', {
      level: levelMatch ? levelMatch[1].toLowerCase() : 'info',
      message: plain,
      ts: Date.now(),
    });
  });

  puppeteerScript.on('error', (error) => {
    console.error('Failed to start bot process:', error);
    sendToRenderer('bot-log', {
      level: 'error',
      message: `Failed to start bot: ${error.message}`,
      ts: Date.now(),
    });
    sendToRenderer('bot-status', { ready: false, state: 'error' });
    puppeteerScript = null;
  });

  puppeteerScript.on('close', (code) => {
    console.log(`[Bot] exited with code ${code}`);
    sendToRenderer('bot-log', {
      level: 'warn',
      message: `Bot process exited (${code}).`,
      ts: Date.now(),
    });
    sendToRenderer('bot-status', { ready: false, state: 'stopped' });
    puppeteerScript = null;
  });

  sendToRenderer('bot-status', { ready: false, state: 'booting' });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 640,
    minWidth: 420,
    minHeight: 520,
    title: 'Education Perfected',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendCommand(command) {
  if (!puppeteerScript || !puppeteerScript.stdin || !puppeteerScript.stdin.writable) {
    dialog.showErrorBox('Bot not ready', 'Please wait for the bot to start, or restart the app.');
    return false;
  }
  puppeteerScript.stdin.write(`${command}\n`);
  return true;
}

app.whenReady().then(() => {
  createWindow();
  startBotProcess();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (!puppeteerScript) startBotProcess();
    }
  });
});

app.on('window-all-closed', () => {
  if (puppeteerScript) {
    try {
      puppeteerScript.stdin.write('exit\n');
    } catch {
      // ignore
    }
    puppeteerScript.kill();
    puppeteerScript = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (puppeteerScript) {
    puppeteerScript.kill();
    puppeteerScript = null;
  }
});

ipcMain.on('bot-command', (_event, command) => {
  sendCommand(command);
});

ipcMain.on('bot-restart', () => {
  if (puppeteerScript) {
    puppeteerScript.kill();
    puppeteerScript = null;
  }
  startBotProcess();
});
