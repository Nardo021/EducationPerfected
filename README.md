<h1 align="center">
  <img src="assets/logo.png" alt="logo" width="250" />
  </br>
  Education Perfected
</h1>
<h4 align="center">A desktop helper that automates Education Perfect list tasks for research and testing.</h4>
<p align="center">
  <img src="https://img.shields.io/github/last-commit/Nardo021/EducationPerfected?logo=GitHub" />
  <img src="https://img.shields.io/npm/v/puppeteer?label=puppeteer" />
  <img src="https://img.shields.io/github/license/Nardo021/EducationPerfected" />
</p>

<p align="center">
  <a href="#getting-started">getting started</a> •
  <a href="#installation-guide">installation guide</a> •
  <a href="#expected-behavior">expected behavior</a> •
  <a href="#hotkeys">hotkeys</a>
</p>

---

## Getting started

Education Perfected is a cross-platform Electron app that drives Puppeteer to answer Education Perfect list tasks.

> This tool is for **educational research and testing** only. Do not use it to violate academic integrity or school policies.

### Features

- Automated answer lookup, submission, and correction learning
- Persistent local dictionary (`dict.json`)
- GUI controls: start/pause, refresh, auto-submit toggle, answer delay, live logs
- Hotkeys inside the EP browser window
- Packaged builds via `electron-builder`

---

## Installation guide

### 1. Configure credentials

```bash
cp config.example.json config.json
```

Edit `config.json` with your EP email/password. Never commit this file.

### 2. Run from source

```bash
git clone https://github.com/Nardo021/EducationPerfected.git
cd EducationPerfected
npm install
npm start
```

Bot-only (no Electron GUI):

```bash
npm run bot
```

### 3. Package as executable

```bash
npm run build
```

Artifacts are written to `dist/`.

---

## Expected behavior

1. App launches a control window and a Chromium window on the EP login page.
2. If `config.json` is valid, login fields are filled automatically.
3. Open the list task you want. **Do not press Start inside EP manually.**
4. In the GUI: **Refresh** (load vocabulary) → **Start / Pause**.
5. Unknown questions pause the loop instead of submitting random text.
6. Incorrect answers update and persist the local dictionary.

---

## Hotkeys

Inside the Education Perfect browser page:

| Hotkey | Action |
|--------|--------|
| Alt+R | Refresh word lists |
| Alt+S | Start / pause answer loop |
| Alt+A | Toggle auto-submit |

Terminal / stdin commands when running the bot directly:

`refresh`, `start`, `stop`, `toggle`, `autosubmit`, `delay <ms>`, `status`, `exit`

---

## Development

```bash
npm test
```

---

## Disclaimer

This project is intended for learning, testing, and automation research only.  
The author is not responsible for misuse or policy violations.

## License

MIT License © 2025 Nardo021
