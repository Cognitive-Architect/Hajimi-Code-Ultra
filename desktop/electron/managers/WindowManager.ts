/**
 * Window Manager
 * 窗口管理（支持多窗口、状态恢复）
 */

import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

export interface WindowState {
  id: number;
  projectPath?: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMaximized: boolean;
}

export class WindowManager {
  private windows: Map<number, BrowserWindow> = new Map();
  private windowStates: Map<number, WindowState> = new Map();

  /**
   * 创建主窗口
   */
  async createMainWindow(projectPath?: string): Promise<BrowserWindow> {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const window = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: 'Hajimi Code Ultra',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload.js'),
      },
      titleBarStyle: 'hiddenInset', // macOS 风格
      show: false, // 准备好后再显示
    });

    const windowId = window.id;
    this.windows.set(windowId, window);

    // 加载渲染进程
    if (process.env.NODE_ENV === 'development') {
      await window.loadURL('http://localhost:3000');
      window.webContents.openDevTools();
    } else {
      await window.loadFile(path.join(__dirname, '../../renderer/.next/index.html'));
    }

    // 窗口准备好后显示
    window.once('ready-to-show', () => {
      window.show();
      
      if (process.env.NODE_ENV === 'development') {
        window.webContents.openDevTools();
      }
    });

    // 保存窗口状态
    this.saveWindowState(window, projectPath);

    // 窗口关闭处理
    window.on('closed', () => {
      this.windows.delete(windowId);
      this.windowStates.delete(windowId);
    });

    // 状态变化时保存
    window.on('resize', () => this.saveWindowState(window, projectPath));
    window.on('move', () => this.saveWindowState(window, projectPath));

    console.log(`[WindowManager] Created window ${windowId}`);
    return window;
  }

  /**
   * 获取所有窗口
   */
  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values());
  }

  /**
   * 获取窗口数量
   */
  getWindowCount(): number {
    return this.windows.size;
  }

  /**
   * 获取窗口状态
   */
  getWindowState(windowId: number): WindowState | undefined {
    return this.windowStates.get(windowId);
  }

  /**
   * 广播消息到所有窗口
   */
  broadcast(channel: string, ...args: any[]): void {
    this.windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, ...args);
      }
    });
  }

  /**
   * 保存窗口状态
   */
  private saveWindowState(window: BrowserWindow, projectPath?: string): void {
    const bounds = window.getBounds();
    const state: WindowState = {
      id: window.id,
      projectPath,
      bounds,
      isMaximized: window.isMaximized(),
    };
    
    this.windowStates.set(window.id, state);
  }

  /**
   * 恢复窗口状态（启动时调用）
   */
  async restoreWindows(): Promise<void> {
    // TODO: 从配置文件中读取保存的窗口状态并恢复
    if (this.windows.size === 0) {
      await this.createMainWindow();
    }
  }
}
