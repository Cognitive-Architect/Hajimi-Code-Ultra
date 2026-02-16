/**
 * Electron Main Process
 * Hajimi Desktop - Phase A Implementation
 * P0-001~040: Core Features Implementation
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { FileManager } from './managers/FileManager';
import { WindowManager } from './managers/WindowManager';
import { ProjectManager } from './managers/ProjectManager';
import { DatabaseManager } from './managers/DatabaseManager';
import { UndoManager } from './managers/UndoManager';
import { registerFSHandlers, registerProjectHandlers, registerWindowHandlers, registerSystemHandlers } from './ipc/handlers';

// P0-10: 全局错误处理 - 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('[Main Process] Uncaught Exception:', error);
  logError('uncaughtException', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main Process] Unhandled Rejection at:', promise, 'reason:', reason);
  logError('unhandledRejection', reason);
});

function logError(type: string, error: any): void {
  const timestamp = new Date().toISOString();
  const errorLog = `[${timestamp}] ${type}: ${error?.message || error}\n${error?.stack || ''}\n\n`;
  console.error(errorLog);
}

class HajimiDesktop {
  private windowManager!: WindowManager;
  private fileManager!: FileManager;
  private projectManager!: ProjectManager;
  private dbManager!: DatabaseManager;
  private undoManager!: UndoManager;

  async initialize(): Promise<void> {
    console.log('[Hajimi Desktop] Starting initialization...');
    
    // P0-01: Electron 启动 - 等待应用就绪
    await app.whenReady();
    console.log('[Hajimi Desktop] App ready');

    try {
      // P0-011~020: 存储系统初始化
      const dbPath = path.join(app.getPath('userData'), 'hajimi.db');
      this.dbManager = new DatabaseManager(dbPath);
      await this.dbManager.initialize();
      console.log('[Hajimi Desktop] Database initialized');

      // P0-021~030: 文件系统初始化
      this.fileManager = new FileManager();
      await this.fileManager.initialize();
      console.log('[Hajimi Desktop] FileManager initialized');

      // 项目管理器初始化
      this.projectManager = new ProjectManager(this.dbManager);
      console.log('[Hajimi Desktop] ProjectManager initialized');

      // P0-031~040: Undo/Redo 系统初始化
      this.undoManager = new UndoManager(this.dbManager);
      console.log('[Hajimi Desktop] UndoManager initialized');

      // 窗口管理器初始化
      this.windowManager = new WindowManager();
      console.log('[Hajimi Desktop] WindowManager initialized');

      // P0-02: Next.js 渲染 - 创建主窗口
      await this.windowManager.createMainWindow();
      console.log('[Hajimi Desktop] Main window created');

      // P0-04: IPC 通信初始化
      this.setupIpcHandlers();

      // 应用生命周期事件
      this.setupAppEvents();

      console.log('[Hajimi Desktop] Initialized successfully');
    } catch (error) {
      console.error('[Hajimi Desktop] Initialization failed:', error);
      dialog.showErrorBox(
        'Initialization Error',
        `Failed to start Hajimi Desktop: ${(error as Error).message}`
      );
      app.quit();
    }
  }

  private setupIpcHandlers(): void {
    // P0-04: IPC 通信 - 注册所有 handlers
    registerFSHandlers(this.fileManager);
    registerProjectHandlers(this.projectManager);
    registerWindowHandlers(this.windowManager);
    registerSystemHandlers();

    console.log('[IPC] All handlers registered');
  }

  private setupAppEvents(): void {
    // P0-03: 进程隔离 - Main Process 与 Renderer Process 分离确认
    console.log(`[Process] Main Process ID: ${process.pid}`);
    console.log(`[Process] Process type: ${process.type || 'main'}`);

    // 应用激活处理（macOS）
    app.on('activate', async () => {
      console.log('[App] Activated');
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.windowManager.createMainWindow();
      }
    });

    // 所有窗口关闭时退出（Windows/Linux）
    app.on('window-all-closed', () => {
      console.log('[App] All windows closed');
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // P0-10: 错误处理 - 应用即将退出
    app.on('before-quit', async () => {
      console.log('[App] Before quit - cleaning up...');
      if (this.dbManager) {
        await this.dbManager.close();
      }
    });

    // 渲染进程崩溃处理
    app.on('render-process-gone', (event, webContents, details) => {
      console.error('[App] Renderer process crashed:', details);
      dialog.showErrorBox(
        'Renderer Process Crashed',
        `Reason: ${details.reason}\nExit Code: ${details.exitCode}`
      );
    });

    // GPU 进程崩溃处理
    app.on('gpu-process-crashed', (event, killed) => {
      console.error('[App] GPU process crashed, killed:', killed);
    });
  }
}

// P0-01: 启动应用
const hajimi = new HajimiDesktop();
hajimi.initialize().catch((error) => {
  console.error('[Hajimi Desktop] Fatal error during initialization:', error);
  process.exit(1);
});
