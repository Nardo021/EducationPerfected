const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  cleanString,
  normalizeKey,
  findAnswer,
  mergeWordLists,
  learnAnswer,
  loadDictionary,
  saveDictionary,
} = require('../lib/dictionary');
const { loadConfig } = require('../lib/config');

test('cleanString strips alternates and parentheses', () => {
  assert.equal(cleanString('hello (formal); hi | hey, yo'), 'hello');
});

test('findAnswer prefers exact then cleaned matches', () => {
  const fullDict = {
    'Bonjour (formal)': 'Hello',
    Hello: 'Bonjour',
  };
  const cutDict = {
    bonjour: 'Hello',
  };

  assert.equal(findAnswer('Bonjour (formal)', fullDict, cutDict), 'Hello');
  assert.equal(findAnswer('bonjour', fullDict, cutDict), 'Hello');
  assert.equal(findAnswer('unknown', fullDict, cutDict), null);
});

test('mergeWordLists builds bidirectional maps', () => {
  const merged = mergeWordLists({}, {}, ['cat', 'dog'], ['chat', 'chien']);
  assert.equal(merged.fullDict.chat, 'cat');
  assert.equal(merged.fullDict.cat, 'chat');
  assert.equal(merged.cutDict.chien, 'dog');
});

test('learnAnswer updates dictionaries', () => {
  const learned = learnAnswer({}, {}, 'pomme', 'apple; fruit');
  assert.equal(learned.fullDict.pomme, 'apple');
  assert.equal(learned.cutDict.pomme, 'apple');
});

test('dictionary persists to disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dict-'));
  saveDictionary(dir, { a: 'b' }, { a: 'b' });
  const loaded = loadDictionary(dir);
  assert.equal(loaded.fullDict.a, 'b');
  assert.equal(normalizeKey('  Foo  Bar '), 'foo bar');
});

test('loadConfig reports missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-cfg-'));
  const cfg = loadConfig(dir);
  assert.equal(cfg._missing, true);
  assert.ok(cfg._path.endsWith('config.json'));
});

test('loadConfig merges defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-cfg-'));
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ email: 'a@b.c', password: 'x', delayMs: 120 }),
    'utf8'
  );
  const cfg = loadConfig(dir);
  assert.equal(cfg._missing, false);
  assert.equal(cfg.email, 'a@b.c');
  assert.equal(cfg.delayMs, 120);
  assert.equal(cfg.autoSubmit, true);
});
