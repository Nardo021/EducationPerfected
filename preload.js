const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendCommand: (command) => ipcRenderer.send('bot-command', command),
  restartBot: () => ipcRenderer.send('bot-restart'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('bot-status', listener);
    return () => ipcRenderer.removeListener('bot-status', listener);
  },
  onLog: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on('bot-log', listener);
    return () => ipcRenderer.removeListener('bot-log', listener);
  },
});
