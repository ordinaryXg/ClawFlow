/**
 * 主进程应用菜单（系统菜单栏）与界面语言状态。
 * 从 `index.ts` 拆出，便于在超大主入口文件中定位「菜单 / i18n」职责。
 */
import { app, BrowserWindow, Menu } from 'electron';

export type AppLang = 'zh' | 'en';

let currentLang: AppLang = app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en';

const I18N: Record<AppLang, Record<string, string>> = {
  zh: {
    file: '文件',
    edit: '编辑',
    view: '视图',
    window: '窗口',
    help: '帮助',
    about: '关于',
    services: '服务',
    hide: '隐藏',
    hideOthers: '隐藏其他',
    unhide: '显示全部',
    quit: '退出',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    pasteAndMatchStyle: '粘贴并匹配样式',
    delete: '删除',
    selectAll: '全选',
    speech: '朗读',
    reload: '重新加载',
    forceReload: '强制重新加载',
    toggleDevTools: '切换开发者工具',
    resetZoom: '重置缩放',
    zoomIn: '放大',
    zoomOut: '缩小',
    togglefullscreen: '切换全屏',
    minimize: '最小化',
    zoom: '缩放',
    close: '关闭',
    front: '全部置于前台',
    learnMore: '了解更多',
    navChat: '对话',
    navSkills: '技能',
    navSettings: '全局设置',
  },
  en: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    help: 'Help',
    about: 'About',
    services: 'Services',
    hide: 'Hide',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Quit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    pasteAndMatchStyle: 'Paste and Match Style',
    delete: 'Delete',
    selectAll: 'Select All',
    speech: 'Speech',
    reload: 'Reload',
    forceReload: 'Force Reload',
    toggleDevTools: 'Toggle DevTools',
    resetZoom: 'Reset Zoom',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    togglefullscreen: 'Toggle Full Screen',
    minimize: 'Minimize',
    zoom: 'Zoom',
    close: 'Close',
    front: 'Bring All to Front',
    learnMore: 'Learn More',
    navChat: 'Chat',
    navSkills: 'Skills',
    navSettings: 'Global settings',
  },
};

export function getAppLanguage(): AppLang {
  return currentLang;
}

/** 渲染进程 `app:setLanguage` 同步后的语言与菜单刷新 */
export function setAppLanguageFromRenderer(lang: string): void {
  currentLang = String(lang).toLowerCase().startsWith('en') ? 'en' : 'zh';
  setupApplicationMenu();
}

export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const nav = (path: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.webContents.send('app:navigate', path);
  };
  const t = (k: string) => I18N[currentLang][k] ?? k;

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about', label: `${t('about')} ${app.name}` },
              { type: 'separator' },
              { role: 'services', label: t('services') },
              { type: 'separator' },
              { role: 'hide', label: `${t('hide')} ${app.name}` },
              { role: 'hideOthers', label: t('hideOthers') },
              { role: 'unhide', label: t('unhide') },
              { type: 'separator' },
              { role: 'quit', label: `${t('quit')} ${app.name}` },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: t('file'),
      submenu: [
        ...(isMac
          ? ([] as Electron.MenuItemConstructorOptions[])
          : ([
              { role: 'quit', label: t('quit') },
            ] as Electron.MenuItemConstructorOptions[])),
      ],
    },
    {
      label: t('edit'),
      submenu: [
        { role: 'undo', label: t('undo') },
        { role: 'redo', label: t('redo') },
        { type: 'separator' },
        { role: 'cut', label: t('cut') },
        { role: 'copy', label: t('copy') },
        { role: 'paste', label: t('paste') },
        ...(isMac
          ? ([
              { role: 'pasteAndMatchStyle', label: t('pasteAndMatchStyle') },
              { role: 'delete', label: t('delete') },
              { role: 'selectAll', label: t('selectAll') },
              { type: 'separator' },
              { role: 'speech', label: t('speech') },
            ] as Electron.MenuItemConstructorOptions[])
          : ([
              { role: 'delete', label: t('delete') },
              { type: 'separator' },
              { role: 'selectAll', label: t('selectAll') },
            ] as Electron.MenuItemConstructorOptions[])),
      ],
    },
    {
      label: t('view'),
      submenu: [
        { label: t('navChat'), click: () => nav('/chat') },
        { label: t('navSkills'), click: () => nav('/skills') },
        { label: t('navSettings'), click: () => nav('/settings') },
        { type: 'separator' },
        { role: 'reload', label: t('reload') },
        { role: 'forceReload', label: t('forceReload') },
        { role: 'toggleDevTools', label: t('toggleDevTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('resetZoom') },
        { role: 'zoomIn', label: t('zoomIn') },
        { role: 'zoomOut', label: t('zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('togglefullscreen') },
      ],
    },
    {
      label: t('window'),
      role: 'window',
      submenu: [
        { role: 'minimize', label: t('minimize') },
        { role: 'zoom', label: t('zoom') },
        ...(isMac
          ? ([
              { type: 'separator' },
              { role: 'front', label: t('front') },
              { type: 'separator' },
              { role: 'window', label: t('window') },
            ] as Electron.MenuItemConstructorOptions[])
          : ([
              { role: 'close', label: t('close') },
            ] as Electron.MenuItemConstructorOptions[])),
      ],
    },
    {
      label: t('help'),
      role: 'help',
      submenu: [
        {
          label: t('learnMore'),
          click: async () => {
            const { shell } = await import('electron');
            await shell.openExternal('https://electronjs.org');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
