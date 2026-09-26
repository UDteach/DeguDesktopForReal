const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('degu', {
  onPlay: (callback) => ipcRenderer.on('play', (_, data) => callback(data)),
  onStop: (callback) => ipcRenderer.on('stop', callback),
  ended: (playbackId) => ipcRenderer.send('clip-ended', playbackId),
});
