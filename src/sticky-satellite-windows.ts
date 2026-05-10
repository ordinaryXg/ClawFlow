/**
 * 卫星便签窗口：BrowserWindow.id → 绑定的工作区根路径（主进程单例表，供 IPC 解析上下文）。
 */
export const stickySatellitePathByWindowId = new Map<number, string>();
