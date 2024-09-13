const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const notifier = require('../index.js');

let mainWindow = null;

app.on('ready', () => {
  mainWindow = new BrowserWindow({ width: 980, height: 680, 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadURL('file://' + __dirname + '/playbook.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  notifier.config({
    autoClose: false,
    // 忽略 duration
    duration: 5000,
    spaceHeight: 20,
    icon: 'icon.png',
    silent: true,
    bigPopup: false,
  });
  notifier.notify({
    title: 'from main process',
    body: '你好1',
  }).on('close', (id) => {
    console.log('close', id);
  });
  notifier.notify({
    title: 'from main process',
    body: '你好2',
    autoClose: true,
  }).on('click', (id) => {
    console.log('click', id);
  });
  notifier.notify({
    title: 'from main process',
    body: '你好3',
  });
  notifier.notify({
    title: 'from main process',
    body: '你好4',
  });
  notifier.notify({
    title: 'from main process',
    body: '你好5',
  });
});
