/**
 * ============================================================
 * HAJIMI Desktop v1.4.0 - Electron 主进程入口
 * ============================================================
 * 文件: desktop/main/electron-main.ts
 * 职责: 窗口管理、Node.js后端嵌入、IPC通道定义
 * 目标: DSK-002 冷启动时间 < 3s
 * 
 * @version 1.4.0
 * @author Hajimi Team
 */

import { app, BrowserWindow, ipcMain, nativeTheme, screen, Tray, Menu, dialog } from 'electron';
import * as path from 'path';
import { HajimiEmbed } from './hajimi-embed';

// ============================================================
// 常量定义
// ============================================================

const IS_DEV = process.env.NODE_ENV === 'development';
const APP_NAME = 'Hajimi Code';
const APP_VERSION = '1.4.0';

// 窗口配置
const WINDOW_CONFIG = {
  width: 1400,
  height: 900,
  minWidth: 1200,
  minHeight: 700,
  titleBarStyle: 'hiddenInset' as const,
  show: false, // 准备就绪后再显示
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, '../preload/preload.js'),
    webSecurity: !IS_DEV,
  },
};

// ============================================================
// 主应用类
// ============================================================

class HajimiDesktopApp {
  private mainWindow: BrowserWindow | null = null;
  private embedService: HajimiEmbed | null = null;
  private tray: Tray | null = null;
  private isQuitting = false;

  // 启动时间追踪
  private startupMetrics = {
    appStart: Date.now(),
    windowReady: 0,
    embedReady: 0,
    totalReady: 0,
  };

  constructor() {
    this.initialize();
  }

  // ============================================================
  // 初始化流程
  // ============================================================

  private initialize(): void {
    // 单实例锁
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      console.log('[Hajimi] 应用已在运行，退出...');
      app.quit();
      return;
    }

    // 多实例尝试启动时聚焦主窗口
    app.on('second-instance', () => {
      this.focusMainWindow();
    });

    // 应用就绪
    app.whenReady().then(() => this.onReady());

    // 应用生命周期
    app.on('window-all-closed', () => this.onWindowAllClosed());
    app.on('before-quit', () => this.onBeforeQuit());
    app.on('activate', () => this.onActivate());

    // 系统主题变化
    nativeTheme.on('updated', () => {
      this.mainWindow?.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
    });
  }

  private async onReady(): Promise<void> {
    console.log(`[Hajimi] v${APP_VERSION} 启动中...`);

    // 1. 启动嵌入的Node.js后端
    await this.startEmbedService();

    // 2. 创建主窗口
    await this.createMainWindow();

    // 3. 创建托盘图标
    this.createTray();

    // 4. 注册IPC通道
    this.registerIpcHandlers();

    // 5. 记录启动时间
    this.startupMetrics.totalReady = Date.now();
    const startupTime = this.startupMetrics.totalReady - this.startupMetrics.appStart;
    console.log(`[Hajimi] 启动完成，耗时: ${startupTime}ms`);

    // DSK-002: 冷启动时间 < 3s
    if (startupTime > 3000) {
      console.warn(`[Hajimi] 警告: 启动时间超过3秒目标 (${startupTime}ms)`);
    }

    // 向渲染进程发送启动完成事件
    this.mainWindow?.webContents.send('app-ready', {
      version: APP_VERSION,
      startupTime,
      isDev: IS_DEV,
    });
  }

  // ============================================================
  // 窗口管理
  // ============================================================

  private async createMainWindow(): Promise<void> {
    // 获取主显示器尺寸
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // 计算窗口位置（居中）
    const x = Math.round((screenWidth - WINDOW_CONFIG.width) / 2);
    const y = Math.round((screenHeight - WINDOW_CONFIG.height) / 2);

    this.mainWindow = new BrowserWindow({
      ...WINDOW_CONFIG,
      x,
      y,
      icon: path.join(__dirname, '../../assets/icon.png'),
    });

    // 加载应用内容
    if (IS_DEV) {
      // 开发模式: 加载Next.js dev server
      await this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      // 生产模式: 加载嵌入服务
      const embedPort = this.embedService?.getPort() || 3000;
      await this.mainWindow.loadURL(`http://localhost:${embedPort}`);
    }

    // 窗口准备就绪后显示
    this.mainWindow.once('ready-to-show', () => {
      this.startupMetrics.windowReady = Date.now();
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });

    // 窗口关闭处理
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting && process.platform === 'darwin') {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    // 窗口关闭后清理
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private focusMainWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
      this.mainWindow.show();
    }
  }

  // ============================================================
  // Node.js后端嵌入
  // ============================================================

  private async startEmbedService(): Promise<void> {
    try {
      this.embedService = new HajimiEmbed({
        port: IS_DEV ? 0 : 3000, // 开发模式自动分配端口
        devMode: IS_DEV,
      });

      await this.embedService.start();
      this.startupMetrics.embedReady = Date.now();

      const embedPort = this.embedService.getPort();
      console.log(`[Hajimi] 嵌入服务启动成功，端口: ${embedPort}`);
    } catch (error) {
      console.error('[Hajimi] 嵌入服务启动失败:', error);
      dialog.showErrorBox(
        '服务启动失败',
        '无法启动Hajimi Code后端服务，请检查端口是否被占用。'
      );
      app.quit();
    }
  }

  // ============================================================
  // 系统托盘
  // ============================================================

  private createTray(): void {
    const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
    this.tray = new Tray(iconPath);
    this.tray.setToolTip(APP_NAME);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => this.focusMainWindow(),
      },
      { type: 'separator' },
      {
        label: '七权面板',
        submenu: [
          { label: 'Orchestrator (祥)', click: () => this.switchAgent('orchestrator') },
          { label: 'Architect (睦)', click: () => this.switchAgent('architect') },
          { label: 'Engineer (音)', click: () => this.switchAgent('engineer') },
          { label: 'QA (鸭)', click: () => this.switchAgent('qa') },
          { label: 'Audit (素)', click: () => this.switchAgent('audit') },
          { label: 'PM (娘)', click: () => this.switchAgent('pm') },
          { label: 'Doctor (奶龙)', click: () => this.switchAgent('doctor') },
        ],
      },
      { type: 'separator' },
      {
        label: '检查更新',
        click: () => this.checkForUpdates(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.isQuitting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.on('click', () => this.focusMainWindow());
  }

  // ============================================================
  // IPC 通道定义
  // ============================================================

  private registerIpcHandlers(): void {
    // 应用信息
    ipcMain.handle('app:get-info', () => ({
      name: APP_NAME,
      version: APP_VERSION,
      platform: process.platform,
      arch: process.arch,
      isDev: IS_DEV,
    }));

    // 窗口控制
    ipcMain.handle('window:minimize', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('window:close', () => {
      this.mainWindow?.close();
    });

    // 获取窗口最大化状态
    ipcMain.handle('window:is-maximized', () => {
      return this.mainWindow?.isMaximized() ?? false;
    });

    // 七权Agent切换
    ipcMain.handle('agent:switch', (_event, agentId: string) => {
      return this.switchAgent(agentId);
    });

    // 获取嵌入服务状态
    ipcMain.handle('embed:get-status', () => {
      return {
        running: this.embedService?.isRunning() ?? false,
        port: this.embedService?.getPort() ?? 0,
        uptime: this.embedService?.getUptime() ?? 0,
      };
    });

    // 系统主题
    ipcMain.handle('theme:get', () => ({
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      themeSource: nativeTheme.themeSource,
    }));

    ipcMain.handle('theme:set', (_event, theme: 'system' | 'light' | 'dark') => {
      nativeTheme.themeSource = theme;
    });

    // 自动更新检查
    ipcMain.handle('update:check', async () => {
      return this.checkForUpdates();
    });

    // 显示系统通知
    ipcMain.handle('notify:show', (_event, options: { title: string; body: string }) => {
      this.showNotification(options.title, options.body);
    });

    // 打开外部链接
    ipcMain.handle('shell:open-external', (_event, url: string) => {
      const { shell } = require('electron');
      return shell.openExternal(url);
    });

    // 选择文件夹
    ipcMain.handle('dialog:select-folder', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0];
    });
  }

  // ============================================================
  // 业务方法
  // ============================================================

  private switchAgent(agentId: string): boolean {
    console.log(`[Hajimi] 切换到Agent: ${agentId}`);
    this.mainWindow?.webContents.send('agent:switched', agentId);
    return true;
  }

  private async checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string }> {
    // TODO: 实现自动更新检查
    this.mainWindow?.webContents.send('update:checking');
    
    // 模拟检查延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.mainWindow?.webContents.send('update:checked', { hasUpdate: false });
    return { hasUpdate: false };
  }

  private showNotification(title: string, body: string): void {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  }

  // ============================================================
  // 生命周期处理
  // ============================================================

  private onWindowAllClosed(): void {
    // macOS: 保持应用运行直到用户明确退出
    if (process.platform !== 'darwin') {
      this.cleanup();
      app.quit();
    }
  }

  private onBeforeQuit(): void {
    this.isQuitting = true;
    this.cleanup();
  }

  private onActivate(): void {
    // macOS: 点击dock图标时恢复窗口
    if (this.mainWindow === null) {
      this.createMainWindow();
    } else {
      this.mainWindow.show();
    }
  }

  private cleanup(): void {
    console.log('[Hajimi] 正在清理资源...');
    this.embedService?.stop();
    this.tray?.destroy();
  }
}

// ============================================================
// 启动应用
// ============================================================

new HajimiDesktopApp();

// ============================================================
// 错误处理
// ============================================================

process.on('uncaughtException', (error) => {
  console.error('[Hajimi] 未捕获异常:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Hajimi] 未处理的Promise拒绝:', reason);
});
