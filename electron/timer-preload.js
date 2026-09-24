const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deguTimer', {
  onUpdate: (callback) => ipcRenderer.on('timer:update', (_, value) => callback(value)),
});
