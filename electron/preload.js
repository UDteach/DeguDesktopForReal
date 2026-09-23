const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('degu', {
  onPlay: (callback) => ipcRenderer.on('play', (_, data) => callback(data)),
  ended: () => ipcRenderer.send('clip-ended'),
});
