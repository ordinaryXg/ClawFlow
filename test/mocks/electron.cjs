/**
 * Jest 下替代 `electron`，避免 `app.getPath` 等在无 Electron 运行时崩溃。
 * 通过 `jest.config.cjs` 的 `moduleNameMapper` 注入。
 */
const path = require('path');
const os = require('os');

const userData = path.join(os.tmpdir(), 'clawflow-jest-userdata');

module.exports = {
  app: {
    isPackaged: false,
    getPath: (name) => (name === 'userData' ? userData : path.join(userData, String(name))),
    getAppPath: () => process.cwd(),
    whenReady: Promise.resolve(),
    on: () => {},
    commandLine: { appendSwitch: () => {}, appendArgument: () => {} },
    requestSingleInstanceLock: () => true,
    quit: () => {},
    getVersion: () => '0.0.0-jest',
  },
  ipcMain: {
    handle: () => {},
    on: () => {},
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
  ipcRenderer: {
    invoke: async () => undefined,
    on: () => () => {},
    removeListener: () => {},
    send: () => {},
  },
  contextBridge: { exposeInMainWorld: () => {} },
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }
    constructor() {
      this.webContents = { send: () => {}, isDestroyed: () => false };
    }
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showMessageBox: async () => ({ response: 0 }),
  },
  shell: { openExternal: async () => {}, openPath: async () => 'ok' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.from(''),
    decryptString: () => '',
  },
  webUtils: { getPathForFile: () => '' },
  clipboard: { writeText: () => {}, readText: () => '' },
  screen: { getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 800, height: 600 } }) },
  Menu: { buildFromTemplate: () => ({ popup: () => {} }), setApplicationMenu: () => {} },
};
