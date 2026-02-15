/**
 * Electron Preload Script
 * 安全地暴露主进程API给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

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
} as const;

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统
  fs: {
    read: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ, filePath),
    write: (filePath: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE, filePath, content),
    delete: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_DELETE, filePath),
    readdir: (dirPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_READDIR, dirPath),
  },
  
  // 项目
  project: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
  },
  
  // 系统
  system: {
    trash: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_TRASH, filePath),
  },
});

// 类型声明（供TypeScript使用）
declare global {
  interface Window {
    electronAPI: {
      fs: {
        read: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
        write: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
        delete: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        readdir: (dirPath: string) => Promise<{ success: boolean; files?: string[]; error?: string }>;
      };
      project: {
        open: () => Promise<any>;
        list: () => Promise<any[]>;
      };
      system: {
        trash: (filePath: string) => Promise<{ success: boolean }>;
      };
    };
  }
}

console.log('[Preload] Electron API exposed');
