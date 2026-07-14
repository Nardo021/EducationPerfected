const fs = require('fs');
const path = require('path');

function cleanString(string) {
  return String(string)
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(';')[0]
    .trim()
    .split(',')[0]
    .trim()
    .split('|')[0]
    .trim();
}

function normalizeKey(string) {
  return cleanString(string).toLowerCase().replace(/\s+/g, ' ');
}

function findAnswer(question, fullDict, cutDict) {
  const cleanedQuestion = cleanString(question);
  const normalizedQuestion = normalizeKey(question);

  if (fullDict[question]) return fullDict[question];
  if (fullDict[cleanedQuestion]) return fullDict[cleanedQuestion];

  const commaReplaced = question.replace(/,/g, ';');
  if (fullDict[commaReplaced]) return fullDict[commaReplaced];

  if (cutDict[cleanedQuestion]) return cutDict[cleanedQuestion];
  if (cutDict[normalizedQuestion]) return cutDict[normalizedQuestion];

  for (const [key, value] of Object.entries(fullDict)) {
    if (normalizeKey(key) === normalizedQuestion) return value;
  }

  for (const [key, value] of Object.entries(cutDict)) {
    if (normalizeKey(key) === normalizedQuestion) return value;
  }

  return null;
}

function mergeWordLists(fullDict, cutDict, baseWords, targetWords) {
  const nextFull = { ...fullDict };
  const nextCut = { ...cutDict };
  const count = Math.min(baseWords.length, targetWords.length);

  for (let i = 0; i < count; i++) {
    const base = baseWords[i];
    const target = targetWords[i];
    const cleanBase = cleanString(base);
    const cleanTarget = cleanString(target);

    nextFull[target] = cleanBase;
    nextFull[base] = cleanTarget;
    nextCut[cleanTarget] = cleanBase;
    nextCut[cleanBase] = cleanTarget;
    nextCut[normalizeKey(cleanTarget)] = cleanBase;
    nextCut[normalizeKey(cleanBase)] = cleanTarget;
  }

  return { fullDict: nextFull, cutDict: nextCut };
}

function learnAnswer(fullDict, cutDict, question, answer) {
  const nextFull = { ...fullDict };
  const nextCut = { ...cutDict };
  const cleanAnswer = cleanString(answer);
  const cleanQuestion = cleanString(question);

  nextFull[question] = cleanAnswer;
  nextFull[cleanQuestion] = cleanAnswer;
  nextCut[cleanQuestion] = cleanAnswer;
  nextCut[normalizeKey(question)] = cleanAnswer;

  return { fullDict: nextFull, cutDict: nextCut };
}

function resolveDictPath(baseDir) {
  return path.join(baseDir, 'dict.json');
}

function loadDictionary(baseDir) {
  const dictPath = resolveDictPath(baseDir);
  if (!fs.existsSync(dictPath)) {
    return { fullDict: {}, cutDict: {}, _path: dictPath };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    return {
      fullDict: raw.fullDict || {},
      cutDict: raw.cutDict || {},
      _path: dictPath,
    };
  } catch {
    return { fullDict: {}, cutDict: {}, _path: dictPath };
  }
}

function saveDictionary(baseDir, fullDict, cutDict) {
  const dictPath = resolveDictPath(baseDir);
  fs.writeFileSync(
    dictPath,
    JSON.stringify({ fullDict, cutDict, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
  return dictPath;
}

module.exports = {
  cleanString,
  normalizeKey,
  findAnswer,
  mergeWordLists,
  learnAnswer,
  loadDictionary,
  saveDictionary,
  resolveDictPath,
};
