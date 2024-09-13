const electron = require('electron');
const is = require('electron-is');
const path = require('path');
const { EventEmitter } = require('events');
const BrowserWindow = electron.BrowserWindow;

class Notifier {
  constructor() {
    // 全局配置
    this.options = {
      // 至多展示通知个数
      limit: 4,
      width: 345,
      height: 65,
      // 右边外边距
      marginRight: 20,
      // 上下间距
      spaceHeight: 10,
      icon: '',
      autoClose: true,
      silent: true,
      // 通知展示时间
      duration: 4000,
      bigPopup: false,
      packagedLibRendererDirectory: 'electron-notifications-win/lib/renderer',
    };
    // 暂存待展示的通知队列
    this.queue = [];
    // 已展示的通知队列
    this.activeNotifications = [];
    this.listenRendererMessage();
    this.windowsMap = new Map();
    this.emitterMap = new Map();
    this.resolveHtmlPath = this.getHtmlPath();
  }

  config(options) {
    this.options = Object.assign(this.options, options);
  }

  listenRendererMessage() {
    electron.ipcMain.on('notifier.notify', async (event, ...args) => {
      const option = args[0];
      this.notify(option);
      event.returnValue = true;
    });
    electron.ipcMain.on('notifier.beep', async (event, ...args) => {
      const option = args[0];
      this.beep(option);
      event.returnValue = true;
    });
    electron.ipcMain.on('notifier.click', async (event, ...args) => {
      const id = args[0];
      const notificationWindow = this.windowsMap.get(id);
      const notificationEmitter = this.emitterMap.get(id);
      if (notificationWindow) {
        notificationWindow.close();
      }
      if (notificationEmitter) {
        notificationEmitter.emit('click', id);
      }
      event.returnValue = true;
    });
    electron.ipcMain.on('notifier.close', async (event, ...args) => {
      const id = args[0];
      const notificationWindow = this.windowsMap.get(id);
      const notificationEmitter = this.emitterMap.get(id);
      if (notificationWindow) {
        notificationWindow.close();
      }
      if (notificationEmitter) {
        notificationEmitter.emit('close', id);
      }
      event.returnValue = true;
    });
  }

  getHtmlPath() {
    if (electron.app.isPackaged) {
      return `file://${path.resolve(__dirname, this.options.packagedLibRendererDirectory, 'notification.html')}`;
    }
    return `file://${path.resolve(__dirname, '../renderer/notification.html')}`;
  }


  mergeOption(options) {
    const notifyOptions = Object.assign({}, options);
    function ensureNotUndefined(a, b) {
      if ( typeof a === 'undefined') {
        return b;
      }
      return a;
    }
    ['icon', 'autoClose', 'duration', 'silent', 'bigPopup'].forEach((prop) => {
      notifyOptions[prop] = ensureNotUndefined(notifyOptions[prop], this.options[prop]);
    })
    Object.assign(this.options, notifyOptions.bigPopup ? { width: 450, height: 85 } : { width: 345, height: 65 }); 
    return notifyOptions;
  }

  /**
   *
   * @param {*} options
   * @param {*} options.title
   * @param {*} options.body
   * @param {*} options.icon
   * @param {*} options.autoClose
   * @param {*} options.duration
   * @param {*} options.silent
   * @returns
   */
  notify(options) {
    const notifyOptions = this.mergeOption(options);
    this.primaryDisplay = electron.screen.getPrimaryDisplay();
    let windowOptions = {
      title: 'notification',
      width: this.options.width,
      height: this.options.height,
      x: this.primaryDisplay.workArea.width + this.primaryDisplay.workArea.x - this.options.width - this.options.marginRight,
      y: 200,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        devTools: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      focusable: false,
      // 一开始不显示窗口，等加载并移动到目的位置后再显示，否则会闪烁
      show: false,
    };
    if (!is.macOS()) {
      // this causes close/resize buttons to show on macOS
      windowOptions.titleBarStyle = 'hidden';
    }
    const notificationWindow = new BrowserWindow(windowOptions);
    this.windowsMap.set(notificationWindow.id, notificationWindow);
    this.queue.push({
      window: notificationWindow,
      notifyOptions: notifyOptions,
    });
    this.showNext();
    const emitter = new EventEmitter();
    this.emitterMap.set(notificationWindow.id, emitter);
    return emitter;
  }

  beep() {
    let windowOptions = {
      title: 'notification',
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      frame: false,
      resizable: false,
      webPreferences: {
        devTools: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      focusable: false,
      // 隐藏窗口
      show: false,
    };
    if (!this.beepWindow) {
      this.beepWindow = new BrowserWindow(windowOptions);
      this.beepWindow.loadURL(this.resolveHtmlPath);
      this.beepWindow.webContents.on('did-finish-load', () => {
        this.beepWindow.webContents.send('notifier.beep');
      });
    }
    this.beepWindow.webContents.send('notifier.beep')
  }

  showNext() {
    if (this.queue.length === 0) {
      return;
    }
    if ( this.checkAvailableHeight() ) {
      return;
    }
    const notification = this.queue.shift();
    this.checkAvailableLimit();
    this.activeNotifications.push(notification);
    this.showCurrent(notification);
  }

  checkAvailableHeight() {
    let availableHeight = this.primaryDisplay.workArea.height;
    for (let j = 0; j < this.activeNotifications.length; j++) {
      availableHeight -= this.activeNotifications[j].window.getBounds().height;
      availableHeight -= this.options.spaceHeight;
    }
    return availableHeight < this.queue[0].window.getBounds().height;
  }

  checkAvailableLimit() {
    // 超出限制个数后，先关闭早先的通知窗口
    while (this.activeNotifications.length >= this.options.limit) {
      const prevNotification = this.activeNotifications.shift();
      prevNotification.window.close();
    }
  }

  showCurrent(notification) {
    let notifyOptions = notification.notifyOptions;
    let notificationWindow = notification.window;

    let notificationY = this.primaryDisplay.workArea.height + this.primaryDisplay.workArea.y;

    for (let i = 0; i < this.activeNotifications.length; i++) {
      let item = this.activeNotifications[i];
      const spaceHeight = i === 0 ? 5 : this.options.spaceHeight;
      notificationY -= this.options.spaceHeight;
      notificationY -= item.window.getBounds().height;
    }

    notificationWindow.loadURL(this.resolveHtmlPath);

    notificationWindow.webContents.on('did-finish-load', () => {
      // 不抢焦点
      notificationWindow.showInactive();
      notificationWindow.webContents.send('notifier.setup', notificationWindow.id, notifyOptions);
    });

    notificationWindow.setPosition(notificationWindow.getPosition()[0], notificationY);

    let timeout = null;
    if (notifyOptions.autoClose) {
      // 定时关闭
      timeout = setTimeout(() => {
        // console.log("[notification] setTimeout closing notification window!")
        // console.log("[notification] Is notification window gone? ", notificationWindow.isDestroyed())
        if (!notificationWindow.isDestroyed()) {
          notificationWindow.close();
        }
      }, notifyOptions.duration);
    }

    if (notificationWindow) {
      // 窗口关闭后重新计算位置
      notificationWindow.on('close', () => {
        // console.log("[notification] immediately closing notification window!")
        this.onNotificationClose(notification);
        this.showNext();
      });
    }
    this.showNext();
    notificationWindow.on('closed', () => {
      // console.log("[notification] notification window closed!")
      if (notifyOptions.autoClose) {
        clearTimeout(timeout);
      }
      notificationWindow.removeAllListeners();
      notificationWindow = null;
      notifyOptions = null;
      notificationY = null;
    });
  }

  onNotificationClose(notification) {
    this.nextY = this.primaryDisplay.workArea.height + this.primaryDisplay.workArea.y;
    let loc = this.activeNotifications.indexOf(notification);
    // 窗口关闭后从 activeNotifications 中移除
    if (loc > -1) {
      this.activeNotifications = this.activeNotifications.filter(
        function (item) {
          return item.window != this.window;
        }.bind(notification),
      );
    }
    if (notification.window) {
      this.windowsMap.delete(notification.window.id);
      this.emitterMap.delete(notification.window.id);
      notification.notifyOptions = null;
      notification.window = null;
      notification = null;
    }
    for (let i = 0; i < this.activeNotifications.length; i++) {
      let item = this.activeNotifications[i];
      let canMove = true;
      try {
        item.window.getPosition();
      } catch (e) {
        canMove = false;
      }
      if (canMove) {
        // console.log('window at index ' + [1] + ' is moving to position ' + this.nextY);
        const spaceHeight = i === 0 ? 5 : this.options.spaceHeight;
        this.nextY -= this.options.spaceHeight;
        this.nextY -= item.window.getBounds().height;
        item.window.setPosition(item.window.getPosition()[0], this.nextY);
      }
    }
  }
}

module.exports = Notifier;
