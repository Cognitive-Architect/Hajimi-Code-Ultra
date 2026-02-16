"use strict";
/**
 * Electron Preload Script
 * 安全地暴露主进程API给渲染进程
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// IPC 通道定义
const IPC_CHANNELS = {
    // 文件系统
    FS_READ: 'fs:read',
    FS_WRITE: 'fs:write',
    FS_DELETE: 'fs:delete',
    FS_READDIR: 'fs:readdir',
    // 项目
    PROJECT_OPEN: 'project:open',
    PROJECT_LIST: 'project:list',
    // 系统
    SYSTEM_TRASH: 'system:trash',
};
// 暴露给渲染进程的API
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // 文件系统
    fs: {
        read: (filePath) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.FS_READ, filePath),
        write: (filePath, content) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE, filePath, content),
        delete: (filePath) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.FS_DELETE, filePath),
        readdir: (dirPath) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.FS_READDIR, dirPath),
    },
    // 项目
    project: {
        open: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN),
        list: () => electron_1.ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    },
    // 系统
    system: {
        trash: (filePath) => electron_1.ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_TRASH, filePath),
    },
});
console.log('[Preload] Electron API exposed');
//# sourceMappingURL=preload.js.map