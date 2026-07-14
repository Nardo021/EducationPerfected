const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  email: '',
  password: '',
  loginUrl: 'https://app.educationperfect.com/app/login',
  delayMs: 80,
  autoSubmit: true,
};

function resolveConfigPath(baseDir) {
  return path.join(baseDir, 'config.json');
}

function loadConfig(baseDir) {
  const configPath = resolveConfigPath(baseDir);
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULTS, _missing: true, _path: configPath };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
      _missing: false,
      _path: configPath,
    };
  } catch (error) {
    return {
      ...DEFAULTS,
      _missing: true,
      _path: configPath,
      _error: error.message,
    };
  }
}

module.exports = {
  DEFAULTS,
  loadConfig,
  resolveConfigPath,
};
