const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kitchenOS', {
  platform: process.platform,
  swiggy: {
    getSettings: () => ipcRenderer.invoke('swiggy:get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('swiggy:save-settings', settings),
    importNow: (options) => ipcRenderer.invoke('swiggy:import-now', options),
    testLogin: () => ipcRenderer.invoke('swiggy:test-login'),
    openExportFolder: () => ipcRenderer.invoke('swiggy:open-export-folder'),
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('swiggy:progress', listener);
      return () => ipcRenderer.removeListener('swiggy:progress', listener);
    }
  },
  logToFile: (msg) => ipcRenderer.send('log-to-file', msg),
  printer: {
    list: () => ipcRenderer.invoke('printer:list'),
    printOrderCopies: (order, printers) => ipcRenderer.invoke('printer:print-order-copies', order, printers)
  }
});
