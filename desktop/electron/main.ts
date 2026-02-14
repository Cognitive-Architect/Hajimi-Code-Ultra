/**
 * Electron Main Process
 * Hajimi Desktop - Phase A Implementation
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { FileManager } from './managers/FileManager';
import { WindowManager } from './managers/WindowManager';
import { ProjectManager } from './managers/ProjectManager';

// 启用热重载（开发环境）
if (process.env.NODE_ENV === 'development') {
  require('electron-reloader')(module);
}

class HajimiDesktop {
  private windowManager: WindowManager;
  private fileManager: FileManager;
  private projectManager: ProjectManager;

  constructor() {
    this.windowManager = new WindowManager();
    this.fileManager = new FileManager();
    this.projectManager = new ProjectManager();
  }

  async initialize(): Promise<void> {
    await app.whenReady();
    
    // 创建主窗口
    await this.windowManager.createMainWindow();
    
    // 初始化IPC处理器
    this.setupIpcHandlers();
    
    // 应用激活处理（macOS）
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.windowManager.createMainWindow();
      }
    });

    // 所有窗口关闭时退出（Windows/Linux）
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    console.log('[Hajimi Desktop] Initialized successfully');
  }

  private setupIpcHandlers(): void {
    // 文件系统 IPC
    ipcMain.handle('fs:read', async (_, filePath: string) => {
      return this.fileManager.readFile(filePath);
    });

    ipcMain.handle('fs:write', async (_, filePath: string, content: string) => {
      return this.fileManager.writeFile(filePath, content);
    });

    ipcMain.handle('fs:delete', async (_, filePath: string) => {
      return this.fileManager.deleteFile(filePath);
    });

    ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
      return this.fileManager.readDirectory(dirPath);
    });

    // 项目 IPC
    ipcMain.handle('project:open', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Open Project'
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return this.projectManager.openProject(result.filePaths[0]);
      }
      return null;
    });

    ipcMain.handle('project:list', async () => {
      return this.projectManager.getRecentProjects();
    });

    // 系统 IPC
    ipcMain.handle('system:trash', async (_, filePath: string) => {
      await shell.trashItem(filePath);
      return { success: true };
    });

    console.log('[IPC] Handlers registered');
  }
}

// 启动应用
const hajimi = new HajimiDesktop();
hajimi.initialize().catch(console.error);
