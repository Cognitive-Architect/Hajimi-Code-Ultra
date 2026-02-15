# R-05/09 多窗口架构与 IPC 通信研究

> **研究工单**: R-05/09  
> **主题**: 窗口管理专家 → 多窗口架构与 IPC 通信  
> **研究深度**: 实现级（含 Electron 主进程代码架构、IPC 信道命名规范、内存泄漏防护）  
> **日期**: 2026-02-14

---

## 目录

1. [多窗口架构决策](#1-多窗口架构决策)
2. [Window Manager 类设计](#2-window-manager-类设计)
3. [IPC 通信协议表](#3-ipc-通信协议表)
4. [跨窗口拖拽实现方案](#4-跨窗口拖拽实现方案)
5. [快捷键管理](#5-快捷键管理)
6. [状态管理策略](#6-状态管理策略)

---

## 1. 多窗口架构决策

### 1.1 单项目单窗口 vs 多标签页单窗口对比

| 维度 | 单项目单窗口 (SPSW) | 多标签页单窗口 (MTSW) |
|------|-------------------|---------------------|
| **内存隔离** | ✅ 完全隔离，一个窗口崩溃不影响其他项目 | ⚠️ 共享进程，一个崩溃全崩 |
| **资源占用** | ⚠️ 每个窗口独立 Chromium (50-100MB/窗口) | ✅ 共享 Chromium 实例 |
| **多屏支持** | ✅ 天然支持多显示器独立工作 | ❌ 需要复杂的多窗口模拟 |
| **拖拽体验** | ✅ 跨窗口拖拽原生支持 | ⚠️ 标签页间拖拽有限制 |
| **快捷键冲突** | ✅ 独立处理，无冲突 | ❌ 需解决标签页间快捷键路由 |
| **状态管理** | ⚠️ 需要跨进程同步 | ✅ 单进程内状态共享 |
| **开发复杂度** | ⚠️ 高（IPC 管理） | ✅ 低（传统 Web 模式） |
| **部署灵活性** | ✅ 可单独更新/重启单个项目窗口 | ❌ 整体重启 |

### 1.2 内存策略（LRU 卸载策略）

```typescript
// 内存管理配置
interface MemoryConfig {
  maxWindows: number;           // 最大窗口数 (默认: 10)
  maxMemoryPerWindow: number;   // 单个窗口内存上限 (默认: 500MB)
  lruThreshold: number;         // LRU 触发阈值 (默认: 80%)
  idleTimeout: number;          // 空闲超时 (默认: 30min)
}

// LRU 窗口状态机
enum WindowState {
  ACTIVE = 'active',           // 当前焦点窗口
  BACKGROUND = 'background',   // 后台运行
  SUSPENDED = 'suspended',     // 暂停渲染（内存保留）
  DISCARDED = 'discarded'      // 已卸载（仅保留元数据）
}
```

**LRU 淘汰策略流程**:

```
内存压力检测
      ↓
[检查所有窗口状态]
      ↓
有 SUSPENDED? → 按 LRU 顺序 DISCARD
      ↓ 否
有 BACKGROUND? → 按 LRU 顺序 SUSPEND
      ↓ 否
拒绝新窗口创建 或 强制关闭最老的 BACKGROUND
```

### 1.3 推荐方案

**推荐: 单项目单窗口 + 智能 LRU 管理**

**理由**:
1. **崩溃隔离**: IDE 扩展可能不稳定，隔离保证核心功能
2. **多屏刚需**: 开发者常需要多屏并排对比代码
3. **资源可控**: 通过 LRU 策略，在 16GB 机器上可支持 8-10 个项目同时打开
4. **渐进降级**: 后台窗口自动降级为低资源占用状态

**内存优化技巧**:
- 后台窗口暂停 requestAnimationFrame
- 非活动窗口禁用 WebSocket 实时同步
- 使用 `webPreferences.backgroundThrottling = true`

---

## 2. Window Manager 类设计

### 2.1 核心类实现

```typescript
// types.ts
interface WindowMetadata {
  id: string;
  projectId: string;
  state: WindowState;
  createdAt: number;
  lastActivatedAt: number;
  memoryUsage: number;
  url: string;
}

interface WindowCreateOptions {
  projectId: string;
  title?: string;
  bounds?: Rectangle;
  state?: WindowState;
}

// window-manager.ts
import { BrowserWindow, ipcMain, screen, Rectangle } from 'electron';
import { EventEmitter } from 'events';
import { LRUCache } from 'lru-cache';

export class WindowManager extends EventEmitter {
  private static instance: WindowManager;
  private windows: Map<string, BrowserWindow> = new Map();
  private metadata: Map<string, WindowMetadata> = new Map();
  private lruCache: LRUCache<string, WindowMetadata>;
  
  // 配置
  private readonly config = {
    maxWindows: 10,
    maxMemoryMB: 500,
    idleTimeoutMs: 30 * 60 * 1000, // 30分钟
    suspendCheckIntervalMs: 60 * 1000, // 1分钟检查一次
  };

  private constructor() {
    super();
    this.lruCache = new LRUCache({
      max: this.config.maxWindows,
      dispose: (key, value) => {
        this.handleLRUDispose(key, value);
      }
    });
    this.startIdleMonitor();
    this.setupIPC();
  }

  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  /**
   * 创建新窗口
   */
  async createWindow(options: WindowCreateOptions): Promise<BrowserWindow> {
    // 检查是否已存在
    const existingId = this.findWindowByProject(options.projectId);
    if (existingId) {
      const win = this.windows.get(existingId);
      if (win) {
        win.focus();
        return win;
      }
    }

    // LRU 检查
    if (this.windows.size >= this.config.maxWindows) {
      await this.enforceLRULimit();
    }

    const windowId = `win-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 计算窗口位置（级联）
    const bounds = this.calculateWindowBounds(options.bounds);
    
    const win = new BrowserWindow({
      ...bounds,
      title: options.title || `Hajimi - ${options.projectId}`,
      titleBarStyle: 'hiddenInset',
      show: false, // 先隐藏，加载完成后再显示
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: this.getPreloadPath(),
        additionalArguments: [`--window-id=${windowId}`, `--project-id=${options.projectId}`],
        backgroundThrottling: true,
        spellcheck: false,
        // 内存优化
        v8CacheOptions: 'code',
        enableWebSQL: false,
      },
    });

    // 保存元数据
    const meta: WindowMetadata = {
      id: windowId,
      projectId: options.projectId,
      state: WindowState.BACKGROUND,
      createdAt: Date.now(),
      lastActivatedAt: Date.now(),
      memoryUsage: 0,
      url: this.getWindowURL(options.projectId),
    };

    this.windows.set(windowId, win);
    this.metadata.set(windowId, meta);
    this.lruCache.set(windowId, meta);

    // 绑定事件
    this.bindWindowEvents(win, windowId);

    // 加载 URL
    await win.loadURL(meta.url);
    win.show();
    
    this.emit('window-created', { windowId, projectId: options.projectId });
    return win;
  }

  /**
   * 绑定窗口事件（内存泄漏防护）
   */
  private bindWindowEvents(win: BrowserWindow, windowId: string): void {
    // 焦点事件
    win.on('focus', () => {
      this.updateWindowState(windowId, WindowState.ACTIVE);
      this.emit('window-activated', { windowId });
    });

    win.on('blur', () => {
      this.updateWindowState(windowId, WindowState.BACKGROUND);
      this.emit('window-deactivated', { windowId });
    });

    // 关闭事件
    win.on('close', (event) => {
      const meta = this.metadata.get(windowId);
      if (meta?.state === WindowState.SUSPENDED) {
        // 确认恢复还是关闭
        const choice = this.showCloseSuspendedDialog();
        if (choice === 'cancel') {
          event.preventDefault();
          return;
        }
      }
      this.emit('window-closing', { windowId });
    });

    win.on('closed', () => {
      this.cleanupWindow(windowId);
      this.emit('window-closed', { windowId });
    });

    // 内存监控
    win.webContents.on('dom-ready', () => {
      this.startMemoryMonitoring(windowId);
    });

    // 崩溃处理
    win.webContents.on('crashed', () => {
      this.emit('window-crashed', { windowId });
      this.handleWindowCrash(windowId);
    });

    win.webContents.on('unresponsive', () => {
      this.emit('window-unresponsive', { windowId });
      this.handleWindowUnresponsive(windowId);
    });
  }

  /**
   * LRU 限制强制执行
   */
  private async enforceLRULimit(): Promise<void> {
    // 1. 尝试暂停非活动窗口
    for (const [id, meta] of this.metadata) {
      if (meta.state === WindowState.BACKGROUND) {
        await this.suspendWindow(id);
      }
    }

    // 2. 如果还是不够，丢弃最老的暂停窗口
    if (this.windows.size >= this.config.maxWindows) {
      const oldestSuspended = this.findOldestSuspended();
      if (oldestSuspended) {
        await this.discardWindow(oldestSuspended);
      }
    }

    // 3. 如果仍然不够，拒绝创建
    if (this.windows.size >= this.config.maxWindows) {
      throw new Error(`Maximum window limit (${this.config.maxWindows}) reached. Please close some windows.`);
    }
  }

  /**
   * 暂停窗口（保留进程，停止渲染）
   */
  private async suspendWindow(windowId: string): Promise<void> {
    const win = this.windows.get(windowId);
    if (!win) return;

    // 发送暂停信号给渲染进程
    win.webContents.send('app:suspend');
    
    // 暂停 WebContents
    win.webContents.setBackgroundThrottling(true);
    
    this.updateWindowState(windowId, WindowState.SUSPENDED);
    this.emit('window-suspended', { windowId });
  }

  /**
   * 恢复窗口
   */
  async resumeWindow(windowId: string): Promise<void> {
    const win = this.windows.get(windowId);
    if (!win) {
      // 如果窗口已被丢弃，需要重新创建
      const meta = this.metadata.get(windowId);
      if (meta) {
        await this.createWindow({ projectId: meta.projectId });
      }
      return;
    }

    win.webContents.send('app:resume');
    this.updateWindowState(windowId, WindowState.ACTIVE);
    win.focus();
    this.emit('window-resumed', { windowId });
  }

  /**
   * 丢弃窗口（完全关闭，保留元数据）
   */
  private async discardWindow(windowId: string): Promise<void> {
    const win = this.windows.get(windowId);
    if (win) {
      // 保存窗口状态
      await this.saveWindowState(windowId);
      win.destroy();
    }
    this.windows.delete(windowId);
    this.updateWindowState(windowId, WindowState.DISCARDED);
    this.emit('window-discarded', { windowId });
  }

  /**
   * 清理窗口资源（防止内存泄漏）
   */
  private cleanupWindow(windowId: string): void {
    const win = this.windows.get(windowId);
    if (win) {
      // 移除所有监听器
      win.removeAllListeners();
      win.webContents.removeAllListeners();
    }
    this.windows.delete(windowId);
    this.lruCache.delete(windowId);
    // 注意：metadata 保留用于会话恢复
  }

  /**
   * 空闲监控
   */
  private startIdleMonitor(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, meta] of this.metadata) {
        if (meta.state === WindowState.BACKGROUND) {
          const idleTime = now - meta.lastActivatedAt;
          if (idleTime > this.config.idleTimeoutMs) {
            this.suspendWindow(id);
          }
        }
      }
    }, this.config.suspendCheckIntervalMs);
  }

  /**
   * 内存监控
   */
  private startMemoryMonitoring(windowId: string): void {
    const win = this.windows.get(windowId);
    if (!win) return;

    setInterval(() => {
      const memInfo = win.webContents.getProcessMemoryInfo();
      const meta = this.metadata.get(windowId);
      if (meta) {
        meta.memoryUsage = memInfo.privateBytes / 1024 / 1024; // MB
        
        // 内存超限检查
        if (meta.memoryUsage > this.config.maxMemoryMB) {
          this.emit('window-memory-limit', { windowId, usage: meta.memoryUsage });
          win.webContents.send('app:memory-warning', { usage: meta.memoryUsage });
        }
      }
    }, 30000); // 每30秒检查一次
  }

  /**
   * 处理窗口崩溃
   */
  private handleWindowCrash(windowId: string): void {
    const meta = this.metadata.get(windowId);
    if (meta) {
      // 尝试重新加载
      const win = this.windows.get(windowId);
      if (win) {
        win.reload();
      }
    }
  }

  /**
   * 处理窗口无响应
   */
  private handleWindowUnresponsive(windowId: string): void {
    // 显示等待或强制关闭对话框
    const win = this.windows.get(windowId);
    if (win) {
      // 可选：自动重启
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.reload();
        }
      }, 5000);
    }
  }

  // ============ 工具方法 ============

  private calculateWindowBounds(preferred?: Rectangle): Rectangle {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    const offset = (this.windows.size % 5) * 30; // 级联偏移
    
    return {
      x: preferred?.x ?? (100 + offset),
      y: preferred?.y ?? (50 + offset),
      width: preferred?.width ?? 1400,
      height: preferred?.height ?? 900,
    };
  }

  private findWindowByProject(projectId: string): string | undefined {
    for (const [id, meta] of this.metadata) {
      if (meta.projectId === projectId) {
        return id;
      }
    }
    return undefined;
  }

  private findOldestSuspended(): string | undefined {
    let oldest: { id: string; time: number } | undefined;
    
    for (const [id, meta] of this.metadata) {
      if (meta.state === WindowState.SUSPENDED) {
        if (!oldest || meta.lastActivatedAt < oldest.time) {
          oldest = { id, time: meta.lastActivatedAt };
        }
      }
    }
    
    return oldest?.id;
  }

  private updateWindowState(windowId: string, state: WindowState): void {
    const meta = this.metadata.get(windowId);
    if (meta) {
      meta.state = state;
      if (state === WindowState.ACTIVE) {
        meta.lastActivatedAt = Date.now();
      }
      this.lruCache.set(windowId, meta); // 更新 LRU
    }
  }

  private async saveWindowState(windowId: string): Promise<void> {
    const win = this.windows.get(windowId);
    const meta = this.metadata.get(windowId);
    if (win && meta) {
      // 通知渲染进程保存状态
      win.webContents.send('app:save-state');
      // 等待保存完成
      await new Promise<void>((resolve) => {
        ipcMain.once(`state-saved:${windowId}`, () => resolve());
        setTimeout(resolve, 1000); // 超时保护
      });
    }
  }

  private getWindowURL(projectId: string): string {
    return process.env.NODE_ENV === 'development'
      ? `http://localhost:3000/editor?project=${projectId}`
      : `app://./editor?project=${projectId}`;
  }

  private getPreloadPath(): string {
    return require('path').join(__dirname, 'preload.js');
  }

  private showCloseSuspendedDialog(): string {
    // 实际实现使用 dialog.showMessageBox
    return 'close';
  }

  private handleLRUDispose(key: string, value: WindowMetadata): void {
    // LRU 自动淘汰处理
    if (value.state !== WindowState.DISCARDED) {
      this.discardWindow(key);
    }
  }

  // ============ IPC 处理 ============

  private setupIPC(): void {
    // 获取所有窗口
    ipcMain.handle('wm:get-all-windows', () => {
      return Array.from(this.metadata.values());
    });

    // 激活窗口
    ipcMain.handle('wm:activate-window', (_, windowId: string) => {
      const win = this.windows.get(windowId);
      if (win) {
        win.focus();
        return { success: true };
      }
      return { success: false, error: 'Window not found' };
    });

    // 关闭窗口
    ipcMain.handle('wm:close-window', (_, windowId: string) => {
      const win = this.windows.get(windowId);
      if (win) {
        win.close();
        return { success: true };
      }
      return { success: false, error: 'Window not found' };
    });
  }

  // ============ 公共 API ============

  getAllWindows(): WindowMetadata[] {
    return Array.from(this.metadata.values());
  }

  getActiveWindow(): BrowserWindow | undefined {
    for (const [id, win] of this.windows) {
      if (win.isFocused()) {
        return win;
      }
    }
    return undefined;
  }

  broadcast(channel: string, ...args: any[]): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    }
  }

  sendToWindow(windowId: string, channel: string, ...args: any[]): boolean {
    const win = this.windows.get(windowId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
      return true;
    }
    return false;
  }

  async closeAllWindows(): Promise<void> {
    const promises = Array.from(this.windows.entries()).map(async ([id]) => {
      await this.saveWindowState(id);
    });
    await Promise.all(promises);
    
    for (const win of this.windows.values()) {
      win.destroy();
    }
    this.windows.clear();
    this.metadata.clear();
    this.lruCache.clear();
  }
}

export default WindowManager.getInstance();
```

### 2.2 Preload 脚本

```typescript
// preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface WindowAPI {
  // 窗口管理
  getAllWindows: () => Promise<any[]>;
  activateWindow: (windowId: string) => Promise<{ success: boolean; error?: string }>;
  closeWindow: (windowId: string) => Promise<{ success: boolean; error?: string }>;
  
  // 生命周期
  onSuspend: (callback: () => void) => () => void;
  onResume: (callback: () => void) => () => void;
  onSaveState: (callback: () => void) => () => void;
  onMemoryWarning: (callback: (data: { usage: number }) => void) => () => void;
  
  // 状态保存确认
  stateSaved: () => void;
  
  // 窗口信息
  getWindowInfo: () => { windowId: string; projectId: string };
  
  // 跨窗口通信
  broadcast: (channel: string, data: any) => void;
  onBroadcast: (channel: string, callback: (data: any, sourceWindowId: string) => void) => () => void;
}

const windowAPI: WindowAPI = {
  getAllWindows: () => ipcRenderer.invoke('wm:get-all-windows'),
  activateWindow: (windowId: string) => ipcRenderer.invoke('wm:activate-window', windowId),
  closeWindow: (windowId: string) => ipcRenderer.invoke('wm:close-window', windowId),

  onSuspend: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:suspend', handler);
    return () => ipcRenderer.removeListener('app:suspend', handler);
  },

  onResume: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:resume', handler);
    return () => ipcRenderer.removeListener('app:resume', handler);
  },

  onSaveState: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:save-state', handler);
    return () => ipcRenderer.removeListener('app:save-state', handler);
  },

  onMemoryWarning: (callback) => {
    const handler = (_: IpcRendererEvent, data: { usage: number }) => callback(data);
    ipcRenderer.on('app:memory-warning', handler);
    return () => ipcRenderer.removeListener('app:memory-warning', handler);
  },

  stateSaved: () => {
    const windowId = new URLSearchParams(window.location.search).get('window-id');
    ipcRenderer.send(`state-saved:${windowId}`);
  },

  getWindowInfo: () => {
    const params = new URLSearchParams(window.location.search);
    return {
      windowId: params.get('window-id') || '',
      projectId: params.get('project-id') || '',
    };
  },

  broadcast: (channel: string, data: any) => {
    ipcRenderer.send('wm:broadcast', { channel, data });
  },

  onBroadcast: (channel: string, callback) => {
    const handler = (_: IpcRendererEvent, data: any, sourceWindowId: string) => {
      callback(data, sourceWindowId);
    };
    ipcRenderer.on(`broadcast:${channel}`, handler);
    return () => ipcRenderer.removeListener(`broadcast:${channel}`, handler);
  },
};

contextBridge.exposeInMainWorld('electronWindow', windowAPI);
```

---

## 3. IPC 通信协议表

### 3.1 信道定义

| 信道名称 | 方向 | 类型 | 用途 | 参数 | 返回值 |
|---------|-----|-----|-----|------|--------|
| `file:read` | R→M | 同步 | 读取文件内容 | `{ path: string, encoding?: string }` | `{ content: string, size: number }` |
| `file:read-buffer` | R→M | 同步 | 读取二进制文件 | `{ path: string }` | `Buffer` |
| `file:write` | R→M | 异步 | 写入文件 | `{ path: string, content: string \| Buffer }` | `{ success: boolean, bytesWritten: number }` |
| `file:write-stream` | R→M | 异步流 | 流式写入大文件 | `{ path: string, streamId: string }` | 通过 `stream:data` 传输 |
| `file:exists` | R→M | 同步 | 检查文件存在 | `{ path: string }` | `{ exists: boolean, isFile: boolean, isDir: boolean }` |
| `file:stat` | R→M | 同步 | 获取文件信息 | `{ path: string }` | `Stats` |
| `file:delete` | R→M | 异步 | 删除文件 | `{ path: string, recursive?: boolean }` | `{ success: boolean }` |
| `file:copy` | R→M | 异步 | 复制文件 | `{ source: string, dest: string }` | `{ success: boolean }` |
| `file:move` | R→M | 异步 | 移动文件 | `{ source: string, dest: string }` | `{ success: boolean }` |
| `file:watch` | R→M | 异步 | 监听文件变化 | `{ path: string, recursive?: boolean }` | `{ watchId: string }` |
| `file:unwatch` | R→M | 同步 | 取消监听 | `{ watchId: string }` | `{ success: boolean }` |
| `dir:list` | R→M | 同步 | 列出目录内容 | `{ path: string }` | `{ entries: DirEntry[] }` |
| `dir:create` | R→M | 异步 | 创建目录 | `{ path: string, recursive?: boolean }` | `{ success: boolean }` |
| `dialog:open` | R→M | 异步 | 打开文件对话框 | `OpenDialogOptions` | `{ canceled: boolean, filePaths: string[] }` |
| `dialog:save` | R→M | 异步 | 保存文件对话框 | `SaveDialogOptions` | `{ canceled: boolean, filePath: string }` |
| `dialog:message` | R→M | 同步 | 显示消息框 | `MessageBoxOptions` | `number` (按钮索引) |
| `shell:open` | R→M | 异步 | 用系统默认应用打开 | `{ path: string }` | `{ success: boolean }` |
| `shell:open-external` | R→M | 异步 | 用浏览器打开URL | `{ url: string }` | `{ success: boolean }` |
| `clipboard:write` | R→M | 同步 | 写入剪贴板 | `{ text?: string, html?: string, image?: Buffer }` | `void` |
| `clipboard:read` | R→M | 同步 | 读取剪贴板 | `{ format: 'text' \| 'html' \| 'image' }` | `string \| Buffer` |
| `wm:create` | R→M | 异步 | 创建新窗口 | `WindowCreateOptions` | `{ windowId: string, success: boolean }` |
| `wm:activate` | R→M | 同步 | 激活窗口 | `{ windowId: string }` | `{ success: boolean }` |
| `wm:close` | R→M | 同步 | 关闭窗口 | `{ windowId: string }` | `{ success: boolean }` |
| `wm:get-all` | R→M | 同步 | 获取所有窗口 | - | `WindowMetadata[]` |
| `wm:broadcast` | R→M/R | 异步 | 广播消息 | `{ channel: string, data: any }` | `void` |
| `cross-window:copy` | R→M | 异步 | 跨窗口复制文件 | `{ sourceProject, targetProject, filePath }` | `{ success: boolean, error?: string }` |
| `cross-window:move` | R→M | 异步 | 跨窗口移动文件 | `{ sourceProject, targetProject, filePath }` | `{ success: boolean, error?: string }` |
| `app:version` | R→M | 同步 | 获取应用版本 | - | `{ version: string }` |
| `app:platform` | R→M | 同步 | 获取平台信息 | - | `{ platform: string, arch: string }` |
| `app:restart` | R→M | 异步 | 重启应用 | - | `void` |
| `app:quit` | R→M | 异步 | 退出应用 | - | `void` |
| `git:exec` | R→M | 异步 | 执行Git命令 | `{ args: string[], cwd: string }` | `{ stdout: string, stderr: string, exitCode: number }` |
| `store:get` | R→M | 同步 | 获取持久化存储 | `{ key: string }` | `any` |
| `store:set` | R→M | 同步 | 设置持久化存储 | `{ key: string, value: any }` | `void` |
| `stream:data` | M→R | 流 | 流传输数据块 | `{ streamId: string, chunk: Buffer, done: boolean }` | - |
| `stream:error` | M→R | 流 | 流错误 | `{ streamId: string, error: string }` | - |
| `file:changed` | M→R | 事件 | 文件变化通知 | `{ path: string, type: 'change' \| 'rename' }` | - |
| `app:suspend` | M→R | 事件 | 窗口暂停通知 | - | - |
| `app:resume` | M→R | 事件 | 窗口恢复通知 | - | - |
| `app:memory-warning` | M→R | 事件 | 内存警告 | `{ usage: number }` | - |

**方向说明**: R=Renderer(渲染进程), M=Main(主进程), R↔M=双向

### 3.2 同步 vs 异步选择标准

```typescript
// 决策树
function chooseIPCTtype(operation: FileOperation): IPCType {
  if (operation.isBlocking || operation.isSmallData) {
    // 读取小文件、检查存在性、获取版本等
    return IPCType.SYNC;
  }
  
  if (operation.isLongRunning || operation.hasProgress) {
    // 大文件读写、Git 操作、复制移动
    return IPCType.ASYNC_STREAM;
  }
  
  // 默认异步
  return IPCType.ASYNC;
}
```

| 类型 | 适用场景 | 超时设置 | 错误处理 |
|-----|---------|---------|---------|
| **同步** | 配置读取、版本查询、小文件读取(<1MB)、状态检查 | 5秒 | 抛异常 |
| **异步** | 文件写入、Git 操作、对话框、窗口操作 | 60秒 | Promise reject |
| **异步流** | 大文件传输(>10MB)、批量操作、日志流 | 无 | 通过 error 事件 |

### 3.3 流式传输实现

```typescript
// ipc-stream-handler.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';

class IPCStreamHandler {
  private activeStreams: Map<string, any> = new Map();

  setup() {
    // 创建读流
    ipcMain.handle('stream:read-file', async (event, { filePath, chunkSize = 64 * 1024 }) => {
      const streamId = uuidv4();
      const stream = createReadStream(filePath, { highWaterMark: chunkSize });
      
      this.activeStreams.set(streamId, stream);
      
      const sender = event.sender;
      
      stream.on('data', (chunk) => {
        sender.send('stream:data', {
          streamId,
          chunk: Buffer.from(chunk).toString('base64'),
          done: false,
        });
      });
      
      stream.on('end', () => {
        sender.send('stream:data', { streamId, chunk: null, done: true });
        this.activeStreams.delete(streamId);
      });
      
      stream.on('error', (err) => {
        sender.send('stream:error', { streamId, error: err.message });
        this.activeStreams.delete(streamId);
      });
      
      return { streamId, success: true };
    });

    // 创建写流
    ipcMain.handle('stream:write-file', async (event, { filePath }) => {
      const streamId = uuidv4();
      const stream = createWriteStream(filePath);
      
      this.activeStreams.set(streamId, stream);
      
      return { streamId, success: true };
    });

    // 接收数据块
    ipcMain.on('stream:write-chunk', (event, { streamId, chunk, done }) => {
      const stream = this.activeStreams.get(streamId);
      if (!stream) return;
      
      if (done) {
        stream.end();
        this.activeStreams.delete(streamId);
      } else {
        const buffer = Buffer.from(chunk, 'base64');
        stream.write(buffer);
      }
    });

    // 取消流
    ipcMain.handle('stream:cancel', (_, { streamId }) => {
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        stream.destroy();
        this.activeStreams.delete(streamId);
      }
      return { success: true };
    });
  }
}

// Preload 端流式 API
const streamAPI = {
  readFile: async (filePath: string, onChunk: (chunk: Uint8Array) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const { streamId } = await ipcRenderer.invoke('stream:read-file', { filePath });
      
      const dataHandler = (_: any, data: any) => {
        if (data.streamId !== streamId) return;
        
        if (data.done) {
          cleanup();
          resolve();
        } else {
          onChunk(Buffer.from(data.chunk, 'base64'));
        }
      };
      
      const errorHandler = (_: any, data: any) => {
        if (data.streamId !== streamId) return;
        cleanup();
        reject(new Error(data.error));
      };
      
      const cleanup = () => {
        ipcRenderer.removeListener('stream:data', dataHandler);
        ipcRenderer.removeListener('stream:error', errorHandler);
      };
      
      ipcRenderer.on('stream:data', dataHandler);
      ipcRenderer.on('stream:error', errorHandler);
    });
  },
};
```

### 3.4 错误码定义

```typescript
// ipc-error-codes.ts
export enum IPCErrorCode {
  // 通用错误 (1000-1099)
  UNKNOWN_ERROR = 1000,
  INVALID_ARGUMENT = 1001,
  TIMEOUT = 1002,
  CANCELLED = 1003,
  PERMISSION_DENIED = 1004,
  
  // 文件操作错误 (1100-1199)
  FILE_NOT_FOUND = 1100,
  FILE_EXISTS = 1101,
  FILE_TOO_LARGE = 1102,
  FILE_LOCKED = 1103,
  FILE_READ_ERROR = 1104,
  FILE_WRITE_ERROR = 1105,
  PATH_INVALID = 1106,
  PATH_OUTSIDE_WORKSPACE = 1107,
  
  // 窗口管理错误 (1200-1299)
  WINDOW_NOT_FOUND = 1200,
  WINDOW_CREATE_FAILED = 1201,
  WINDOW_LIMIT_REACHED = 1202,
  WINDOW_CRASHED = 1203,
  
  // Git 错误 (1300-1399)
  GIT_NOT_INITIALIZED = 1300,
  GIT_COMMAND_FAILED = 1301,
  GIT_CONFLICT = 1302,
  
  // 网络错误 (1400-1499)
  NETWORK_ERROR = 1400,
  REQUEST_TIMEOUT = 1401,
}

export class IPCError extends Error {
  constructor(
    message: string,
    public code: IPCErrorCode,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'IPCError';
  }
}

// 错误处理辅助函数
export function handleIPCError(error: any): { success: false; error: { code: number; message: string; details?: any } } {
  if (error instanceof IPCError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
  
  return {
    success: false,
    error: {
      code: IPCErrorCode.UNKNOWN_ERROR,
      message: error?.message || 'Unknown error',
    },
  };
}
```

---

## 4. 跨窗口拖拽实现方案

### 4.1 HTML5 Drag & Drop API 方案

```typescript
// renderer: drag-source.tsx
import React, { useCallback } from 'react';
import { useDrag } from 'react-dnd';

interface FileDragItem {
  type: 'file';
  filePath: string;
  projectId: string;
  fileName: string;
}

export function DraggableFile({ filePath, fileName, projectId }: { 
  filePath: string; 
  fileName: string; 
  projectId: string;
}) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'file',
    item: { type: 'file', filePath, projectId, fileName } as FileDragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const handleNativeDragStart = useCallback((e: React.DragEvent) => {
    // 设置原生拖拽数据，支持拖拽到外部应用
    e.dataTransfer.setData('text/plain', filePath);
    e.dataTransfer.setData('application/x-hajimi-file', JSON.stringify({
      filePath,
      projectId,
      fileName,
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
    
    // Windows: 设置拖拽图标
    if (window.electronWindow) {
      window.electronWindow.setDragImage(filePath);
    }
  }, [filePath, projectId, fileName]);

  return (
    <div
      ref={drag}
      draggable
      onDragStart={handleNativeDragStart}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className="draggable-file"
    >
      📄 {fileName}
    </div>
  );
}
```

```typescript
// renderer: drop-target.tsx
import React, { useCallback } from 'react';
import { useDrop } from 'react-dnd';

interface DropTargetProps {
  projectId: string;
  currentPath: string;
  onFileDrop: (source: FileDragItem, targetPath: string) => void;
}

export function FileDropTarget({ projectId, currentPath, onFileDrop }: DropTargetProps) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'file',
    drop: (item: FileDragItem) => {
      if (item.projectId === projectId) {
        // 同一项目内移动
        onFileDrop(item, currentPath);
      } else {
        // 跨项目操作 - 通过 IPC 通知主进程
        handleCrossWindowDrop(item, currentPath);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const handleNativeDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 检查是否是 Hajimi 内部拖拽
    const hajimiData = e.dataTransfer.getData('application/x-hajimi-file');
    if (hajimiData) {
      const item: FileDragItem = JSON.parse(hajimiData);
      handleCrossWindowDrop(item, currentPath);
      return;
    }

    // 处理外部文件拖拽（从资源管理器）
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      // 通过 IPC 读取外部文件
      window.electronAPI.file.handleExternalDrop(file.path, currentPath);
    });
  }, [currentPath]);

  const handleCrossWindowDrop = async (item: FileDragItem, targetPath: string) => {
    const operation = await window.electronAPI.dialog.showMessageBox({
      type: 'question',
      buttons: ['复制', '移动', '取消'],
      defaultId: 0,
      title: '跨项目文件操作',
      message: `从 "${item.projectId}" 复制/移动 "${item.fileName}" 到当前项目?`,
    });

    if (operation === 2) return; // 取消

    const isMove = operation === 1;
    
    try {
      const result = await window.electronAPI.crossWindow.transfer({
        sourceProject: item.projectId,
        targetProject: projectId,
        sourcePath: item.filePath,
        targetPath: targetPath,
        operation: isMove ? 'move' : 'copy',
      });

      if (result.success) {
        onFileDrop(item, currentPath);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      window.electronAPI.dialog.showErrorBox('传输失败', error.message);
    }
  };

  return (
    <div
      ref={drop}
      onDrop={handleNativeDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`drop-target ${isOver && canDrop ? 'active' : ''}`}
    >
      {isOver && canDrop && <div className="drop-indicator">释放以移动/复制文件</div>}
      {/* 子内容 */}
    </div>
  );
}
```

### 4.2 Electron startDrag 方案（原生级）

```typescript
// main: native-drag-handler.ts
import { BrowserWindow, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class NativeDragHandler {
  setup() {
    // 设置拖拽图标
    ipcMain.handle('drag:set-image', async (event, { filePath }) => {
      try {
        // Windows: 使用系统图标或生成缩略图
        const icon = await this.getFileIcon(filePath);
        return { success: true, iconPath: icon };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 开始拖拽操作（用于拖拽到桌面/资源管理器）
    ipcMain.handle('drag:start-external', async (event, { filePath }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { success: false };

      const icon = nativeImage.createFromPath(this.getDefaultIcon());
      
      win.webContents.startDrag({
        file: filePath,
        icon: icon,
      });

      return { success: true };
    });
  }

  private async getFileIcon(filePath: string): Promise<string> {
    // Windows: 使用系统 API 获取文件图标
    const { extractFileIcon } = require('extract-file-icon');
    try {
      const buffer = await extractFileIcon(filePath);
      const tempPath = path.join(require('os').tmpdir(), `icon-${Date.now()}.png`);
      fs.writeFileSync(tempPath, buffer);
      return tempPath;
    } catch {
      return this.getDefaultIcon();
    }
  }

  private getDefaultIcon(): string {
    return path.join(__dirname, '../assets/file-icon.png');
  }
}
```

### 4.3 Windows 文件路径权限处理

```typescript
// main: path-security.ts
import * as path from 'path';
import { IPCError, IPCErrorCode } from './ipc-error-codes';

interface SecurityConfig {
  allowedBasePaths: string[];
  blockedPaths: string[];
  maxSymlinkDepth: number;
}

export class PathSecurity {
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * 验证并规范化路径
   */
  async validatePath(inputPath: string, projectRoot: string): Promise<string> {
    // 1. 解析真实路径（处理符号链接）
    const realPath = await this.resolveRealPath(inputPath);
    
    // 2. 检查是否在项目目录内
    const resolvedProjectRoot = path.resolve(projectRoot);
    const relative = path.relative(resolvedProjectRoot, realPath);
    
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new IPCError(
        'Path outside workspace',
        IPCErrorCode.PATH_OUTSIDE_WORKSPACE,
        { path: inputPath }
      );
    }

    // 3. 检查是否在黑名单中
    for (const blocked of this.config.blockedPaths) {
      if (realPath.toLowerCase().includes(blocked.toLowerCase())) {
        throw new IPCError(
          'Path in blocked list',
          IPCErrorCode.PERMISSION_DENIED,
          { path: inputPath, blocked }
        );
      }
    }

    return realPath;
  }

  /**
   * 解析真实路径（防止符号链接攻击）
   */
  private async resolveRealPath(inputPath: string, depth = 0): Promise<string> {
    if (depth > this.config.maxSymlinkDepth) {
      throw new IPCError(
        'Symlink depth exceeded',
        IPCErrorCode.PATH_INVALID
      );
    }

    const { lstat, readlink } = require('fs/promises');
    const stats = await lstat(inputPath);

    if (stats.isSymbolicLink()) {
      const target = await readlink(inputPath);
      const resolved = path.resolve(path.dirname(inputPath), target);
      return this.resolveRealPath(resolved, depth + 1);
    }

    return path.resolve(inputPath);
  }

  /**
   * Windows 特殊路径处理
   */
  normalizeWindowsPath(inputPath: string): string {
    // 处理 Windows 长路径前缀
    let normalized = inputPath;
    if (normalized.startsWith('\\\\?\\')) {
      normalized = normalized.slice(4);
    }
    
    // 处理 UNC 路径
    if (normalized.startsWith('\\\\')) {
      // 网络路径，需要额外验证
      const server = normalized.slice(2).split('\\')[0];
      if (!this.config.allowedBasePaths.some(p => 
        p.toLowerCase().includes(server.toLowerCase())
      )) {
        throw new IPCError(
          'Network path not allowed',
          IPCErrorCode.PERMISSION_DENIED
        );
      }
    }

    // 处理短文件名 (8.3 format)
    normalized = normalized.replace(/\\/g, '/');
    
    return normalized;
  }
}

// 使用示例
const pathSecurity = new PathSecurity({
  allowedBasePaths: ['F:\\Hajimi-Projects'],
  blockedPaths: ['node_modules', '.git', '..'],
  maxSymlinkDepth: 5,
});

ipcMain.handle('file:read', async (event, { path: inputPath, projectId }) => {
  try {
    const projectRoot = `F:\\Hajimi-Projects\\${projectId}`;
    const safePath = await pathSecurity.validatePath(inputPath, projectRoot);
    
    const content = await fs.promises.readFile(safePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    if (error instanceof IPCError) {
      return handleIPCError(error);
    }
    throw error;
  }
});
```

### 4.4 推荐方案：混合方案

```typescript
// 推荐方案核心代码

// 1. 渲染进程使用 HTML5 DnD + react-dnd 处理内部逻辑
// 2. 跨窗口/外部拖拽通过 IPC 协调
// 3. Windows 路径通过 PathSecurity 严格验证

// 跨窗口文件传输主进程实现
ipcMain.handle('cross-window:transfer', async (event, {
  sourceProject,
  targetProject,
  sourcePath,
  targetPath,
  operation, // 'copy' | 'move'
}) => {
  const sourceRoot = `F:\\Hajimi-Projects\\${sourceProject}`;
  const targetRoot = `F:\\Hajimi-Projects\\${targetProject}`;

  try {
    // 安全验证
    const safeSource = await pathSecurity.validatePath(sourcePath, sourceRoot);
    const safeTarget = path.join(
      await pathSecurity.validatePath(targetPath, targetRoot),
      path.basename(sourcePath)
    );

    // 检查目标是否存在
    if (await fileExists(safeTarget)) {
      const result = await dialog.showMessageBox({
        type: 'question',
        buttons: ['覆盖', '重命名', '跳过'],
        defaultId: 1,
        title: '文件已存在',
        message: `文件 "${path.basename(safeTarget)}" 已存在`,
      });

      if (result === 2) return { success: true, skipped: true }; // 跳过
      if (result === 1) {
        // 重命名
        const ext = path.extname(safeTarget);
        const base = path.basename(safeTarget, ext);
        const dir = path.dirname(safeTarget);
        let counter = 1;
        let newTarget = safeTarget;
        while (await fileExists(newTarget)) {
          newTarget = path.join(dir, `${base} (${counter})${ext}`);
          counter++;
        }
        await performTransfer(safeSource, newTarget, operation);
        return { success: true, targetPath: newTarget };
      }
    }

    await performTransfer(safeSource, safeTarget, operation);
    return { success: true, targetPath: safeTarget };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error instanceof IPCError ? error.code : IPCErrorCode.UNKNOWN_ERROR,
    };
  }
});

async function performTransfer(source: string, target: string, operation: string) {
  const fs = require('fs').promises;
  
  if (operation === 'copy') {
    await fs.copyFile(source, target);
  } else {
    await fs.rename(source, target);
  }
}
```

---

## 5. 快捷键管理

### 5.1 全局快捷键注册方案

```typescript
// main: shortcut-manager.ts
import { globalShortcut, BrowserWindow, ipcMain } from 'electron';
import { WindowManager } from './window-manager';

interface ShortcutConfig {
  accelerator: string;
  action: string;
  scope: 'global' | 'local';
  condition?: () => boolean;
}

const GLOBAL_SHORTCUTS: ShortcutConfig[] = [
  { accelerator: 'CommandOrControl+Shift+N', action: 'window:new', scope: 'global' },
  { accelerator: 'CommandOrControl+Shift+O', action: 'project:open', scope: 'global' },
  { accelerator: 'CommandOrControl+Shift+T', action: 'window:reopen-closed', scope: 'global' },
  { accelerator: 'CommandOrControl+Alt+Left', action: 'window:prev', scope: 'global' },
  { accelerator: 'CommandOrControl+Alt+Right', action: 'window:next', scope: 'global' },
  { accelerator: 'CommandOrControl+Shift+D', action: 'dev:toggle-tools', scope: 'global', condition: () => process.env.NODE_ENV === 'development' },
];

export class ShortcutManager {
  private registeredGlobals: Set<string> = new Set();
  private windowManager: WindowManager;

  constructor(windowManager: WindowManager) {
    this.windowManager = windowManager;
  }

  setup() {
    // 注册全局快捷键
    for (const shortcut of GLOBAL_SHORTCUTS) {
      if (shortcut.scope === 'global' && (!shortcut.condition || shortcut.condition())) {
        this.registerGlobal(shortcut);
      }
    }

    // 监听来自渲染进程的局部快捷键请求
    ipcMain.handle('shortcut:register-local', (event, shortcuts: string[]) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        // 局部快捷键由渲染进程自己处理，这里只记录
        return { success: true };
      }
      return { success: false };
    });

    ipcMain.handle('shortcut:unregister-local', () => {
      return { success: true };
    });
  }

  private registerGlobal(config: ShortcutConfig): boolean {
    if (this.registeredGlobals.has(config.accelerator)) {
      console.warn(`Shortcut ${config.accelerator} already registered`);
      return false;
    }

    const success = globalShortcut.register(config.accelerator, () => {
      this.handleGlobalShortcut(config.action);
    });

    if (success) {
      this.registeredGlobals.add(config.accelerator);
    } else {
      console.error(`Failed to register global shortcut: ${config.accelerator}`);
    }

    return success;
  }

  private handleGlobalShortcut(action: string) {
    switch (action) {
      case 'window:new':
        this.windowManager.createWindow({ 
          projectId: `new-${Date.now()}`,
          title: '新建项目' 
        });
        break;

      case 'window:reopen-closed':
        this.windowManager.emit('shortcut:reopen-closed');
        break;

      case 'window:prev':
        this.switchWindow(-1);
        break;

      case 'window:next':
        this.switchWindow(1);
        break;

      case 'project:open':
        this.windowManager.emit('shortcut:open-project');
        break;

      case 'dev:toggle-tools':
        const win = this.windowManager.getActiveWindow();
        if (win) {
          win.webContents.toggleDevTools();
        }
        break;
    }
  }

  private switchWindow(direction: number) {
    const windows = this.windowManager.getAllWindows();
    if (windows.length < 2) return;

    const activeWin = this.windowManager.getActiveWindow();
    if (!activeWin) return;

    const currentIndex = windows.findIndex(w => {
      const win = BrowserWindow.getAllWindows().find(bw => !bw.isDestroyed());
      return win?.webContents.getURL().includes(w.id);
    });

    const nextIndex = (currentIndex + direction + windows.length) % windows.length;
    const nextWindowId = windows[nextIndex].id;
    
    this.windowManager.sendToWindow(nextWindowId, 'app:activate');
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
    this.registeredGlobals.clear();
  }
}
```

### 5.2 局部快捷键冲突处理

```typescript
// renderer: shortcut-context.tsx
import React, { createContext, useContext, useEffect, useCallback } from 'react';

interface ShortcutContextType {
  register: (accelerator: string, handler: () => void, priority?: number) => () => void;
  unregister: (accelerator: string) => void;
  isRegistered: (accelerator: string) => boolean;
}

const ShortcutContext = createContext<ShortcutContextType | null>(null);

interface ShortcutHandler {
  handler: () => void;
  priority: number;
  component: string;
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const handlers = React.useRef<Map<string, ShortcutHandler[]>>(new Map());

  const register = useCallback((accelerator: string, handler: () => void, priority = 0): (() => void) => {
    const key = normalizeAccelerator(accelerator);
    const component = new Error().stack?.split('\n')[2]?.trim() || 'unknown';

    if (!handlers.current.has(key)) {
      handlers.current.set(key, []);
    }

    const list = handlers.current.get(key)!;
    const entry: ShortcutHandler = { handler, priority, component };
    list.push(entry);
    list.sort((a, b) => b.priority - a.priority);

    // 同步到主进程
    window.electronAPI.shortcut.registerLocal([key]);

    return () => {
      const idx = list.indexOf(entry);
      if (idx > -1) {
        list.splice(idx, 1);
      }
    };
  }, []);

  const unregister = useCallback((accelerator: string) => {
    const key = normalizeAccelerator(accelerator);
    handlers.current.delete(key);
  }, []);

  const isRegistered = useCallback((accelerator: string) => {
    const key = normalizeAccelerator(accelerator);
    return handlers.current.has(key) && handlers.current.get(key)!.length > 0;
  }, []);

  // 全局键盘监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const accelerator = eventToAccelerator(e);
      const handlers = handlers.current.get(accelerator);

      if (handlers && handlers.length > 0) {
        // 按优先级执行，如果高优先级处理了则停止传播
        for (const { handler } of handlers) {
          const result = handler();
          if (result === false) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return (
    <ShortcutContext.Provider value={{ register, unregister, isRegistered }}>
      {children}
    </ShortcutContext.Provider>
  );
}

// 工具函数
function normalizeAccelerator(acc: string): string {
  return acc.toLowerCase().replace(/\s/g, '');
}

function eventToAccelerator(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

// 使用 Hook
export function useShortcut(accelerator: string, handler: () => void, priority = 0) {
  const context = useContext(ShortcutContext);
  if (!context) throw new Error('useShortcut must be used within ShortcutProvider');

  useEffect(() => {
    return context.register(accelerator, handler, priority);
  }, [accelerator, handler, priority, context]);
}
```

### 5.3 与 Monaco Editor 快捷键的协调

```typescript
// renderer: monaco-keybinding-integration.ts
import { editor as MonacoEditor } from 'monaco-editor';

const MONACO_RESERVED_SHORTCUTS = [
  'ctrl+f',           // 查找
  'ctrl+h',           // 替换
  'ctrl+g',           // 转到行
  'ctrl+space',       // 触发建议
  'ctrl+shift+space', // 参数提示
  'f12',              // 转到定义
  'ctrl+f12',         // 查看定义
  'ctrl+shift+f',     // 全局查找
  'ctrl+/',           // 切换注释
  'ctrl+shift+k',     // 删除行
  'ctrl+enter',       // 在下面插入行
  'ctrl+shift+enter', // 在上面插入行
  'alt+up',           // 向上移动行
  'alt+down',         // 向下移动行
  'ctrl+d',           // 添加下一个匹配
  'ctrl+k ctrl+d',    // 跳过并添加下一个
  'ctrl+shift+l',     // 选中所有匹配
];

const APP_SHORTCUTS = [
  'ctrl+n',           // 新建文件（应用级）
  'ctrl+o',           // 打开文件（应用级）
  'ctrl+s',           // 保存（应用级，Monaco 也有）
  'ctrl+shift+s',     // 另存为
  'ctrl+w',           // 关闭标签/窗口
  'ctrl+shift+t',     // 重新打开关闭的标签
  'ctrl+tab',         // 下一个标签
  'ctrl+shift+tab',   // 上一个标签
  'ctrl+1-9',         // 切换到第 N 个标签
  'ctrl+`',           // 切换终端
];

export function setupMonacoKeybinding(editor: MonacoEditor.IStandaloneCodeEditor) {
  // 1. 添加命令前拦截
  editor.onKeyDown((e) => {
    const accelerator = monacoEventToAccelerator(e);

    // 应用级快捷键：让事件冒泡到应用层处理
    if (isAppShortcut(accelerator)) {
      // 某些操作需要编辑器先处理（如保存）
      if (accelerator === 'ctrl+s') {
        // 触发编辑器保存，然后冒泡
        return; // 不阻止，让 monaco 处理
      }
      
      // 其他应用级快捷键阻止 monaco 处理
      if (accelerator === 'ctrl+n' || accelerator === 'ctrl+o') {
        e.preventDefault();
        e.stopPropagation();
        // 触发应用级操作
        window.electronAPI.shortcut.trigger(accelerator);
        return;
      }
    }
  });

  // 2. 移除 Monaco 与冲突的快捷键
  APP_SHORTCUTS.forEach(shortcut => {
    if (!MONACO_RESERVED_SHORTCUTS.includes(shortcut)) {
      const binding = editor.getAction(findActionByShortcut(shortcut));
      if (binding) {
        // 使用 addCommand 覆盖为空操作
        editor.addCommand(
          MonacoEditor.KeyMod.CtrlCmd | parseKey(shortcut),
          () => { /* 空操作，让应用层处理 */ }
        );
      }
    }
  });

  // 3. 添加自定义上下文菜单快捷键
  editor.addAction({
    id: 'hajimi.close-tab',
    label: 'Close Tab',
    keybindings: [MonacoEditor.KeyMod.CtrlCmd | MonacoEditor.KeyCode.KeyW],
    run: () => {
      // 触发应用层的关闭标签
      window.electronAPI.tab.closeCurrent();
    },
  });
}

function monacoEventToAccelerator(e: any): string {
  // 转换 monaco 键盘事件为 accelerator 格式
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.keyCode) {
    parts.push(MonacoEditor.KeyCode[e.keyCode].toLowerCase().replace('key', ''));
  }
  return parts.join('+');
}

function isAppShortcut(accelerator: string): boolean {
  return APP_SHORTCUTS.includes(accelerator);
}

function findActionByShortcut(shortcut: string): string {
  // 映射 shortcut 到 Monaco action ID
  const map: Record<string, string> = {
    'ctrl+n': 'actions.find',
    'ctrl+o': 'editor.action.quickOutline',
  };
  return map[shortcut] || '';
}

function parseKey(shortcut: string): MonacoEditor.KeyCode {
  // 解析单个按键为 Monaco KeyCode
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1].toUpperCase();
  return (MonacoEditor.KeyCode as any)[`Key${key}`] || MonacoEditor.KeyCode[key];
}
```

### 5.4 快捷键冲突解决策略

```typescript
// 快捷键冲突矩阵
const CONFLICT_RESOLUTION_MATRIX = {
  // 当 Monaco 和应用都注册同一快捷键时的决策
  'ctrl+s': { 
    winner: 'both',           // 两者都执行
    order: ['monaco', 'app'], // Monaco 先保存内容，App 再保存文件
  },
  'ctrl+f': {
    winner: 'context',        // 根据上下文决定
    context: {
      editorFocused: 'monaco', // 编辑器聚焦时用 Monaco 查找
      default: 'app',          // 否则用应用级全局查找
    },
  },
  'ctrl+n': {
    winner: 'app',            // 应用级优先
    monacoAlternative: 'ctrl+shift+n', // Monaco 使用替代快捷键
  },
  'ctrl+w': {
    winner: 'app',
    monacoAlternative: 'ctrl+shift+w',
  },
  'ctrl+tab': {
    winner: 'app',            // 应用级标签切换
  },
  'ctrl+`': {
    winner: 'app',            // 切换终端
  },
};

// 实现
function resolveShortcutConflict(
  accelerator: string,
  context: { editorFocused: boolean; hasSelection: boolean }
): 'monaco' | 'app' | 'both' | 'none' {
  const resolution = CONFLICT_RESOLUTION_MATRIX[accelerator as keyof typeof CONFLICT_RESOLUTION_MATRIX];
  
  if (!resolution) return 'both'; // 默认两者都执行
  
  if (resolution.winner === 'context') {
    if (context.editorFocused) {
      return resolution.context?.editorFocused || 'monaco';
    }
    return resolution.context?.default || 'app';
  }
  
  return resolution.winner;
}
```

---

## 6. 状态管理策略

### 6.1 每个窗口独立 LocalStorage 方案

```typescript
// 方案 A: 隔离式 LocalStorage
// 通过 session 分区实现真正的隔离

// main.ts
const win = new BrowserWindow({
  webPreferences: {
    partition: `persist:project-${projectId}`, // 每个项目独立存储分区
  },
});

// renderer 中使用方式不变
localStorage.setItem('editor.theme', 'dark'); // 自动隔离到对应分区

// 优点：完全隔离，崩溃不影响其他窗口
// 缺点：无法在窗口间共享配置
```

### 6.2 主进程集中管理方案（推荐）

```typescript
// 方案 B: 主进程集中管理 + 分层存储
// 使用 electron-store 实现持久化

// main: store-manager.ts
import Store from 'electron-store';
import { ipcMain } from 'electron';

interface StoreSchema {
  // 全局配置（所有窗口共享）
  global: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    fontSize: number;
    fontFamily: string;
    shortcuts: Record<string, string>;
    recentProjects: string[];
    windowBounds: Record<string, Rectangle>;
  };
  
  // 项目特定配置
  projects: Record<string, {
    lastOpenFiles: string[];
    editorState: {
      cursorPosition: { line: number; column: number };
      scrollPosition: { top: number; left: number };
      selections: any[];
    };
    breakpoints: any[];
    foldedRegions: any[];
  }>;
  
  // 窗口会话状态（临时，不持久化）
  sessions: Record<string, {
    projectId: string;
    openTabs: string[];
    activeTab: string;
    terminalSessions: string[];
  }>;
}

export class StoreManager {
  private store: Store<StoreSchema>;
  private changeListeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'hajimi-config',
      defaults: {
        global: {
          theme: 'system',
          language: 'zh-CN',
          fontSize: 14,
          fontFamily: 'JetBrains Mono',
          shortcuts: {},
          recentProjects: [],
          windowBounds: {},
        },
        projects: {},
        sessions: {},
      },
      // 加密敏感数据
      encryptionKey: this.getEncryptionKey(),
    });

    this.setupIPC();
  }

  private setupIPC() {
    // 获取全局配置
    ipcMain.handle('store:get-global', (_, key: string) => {
      return this.store.get(`global.${key}`);
    });

    // 设置全局配置
    ipcMain.handle('store:set-global', (_, key: string, value: any) => {
      this.store.set(`global.${key}`, value);
      this.broadcast('global', { key, value });
      return { success: true };
    });

    // 获取项目配置
    ipcMain.handle('store:get-project', (_, projectId: string, key: string) => {
      return this.store.get(`projects.${projectId}.${key}`);
    });

    // 设置项目配置
    ipcMain.handle('store:set-project', (_, projectId: string, key: string, value: any) => {
      this.store.set(`projects.${projectId}.${key}`, value);
      this.broadcast(`project:${projectId}`, { key, value });
      return { success: true };
    });

    // 获取整个项目配置对象
    ipcMain.handle('store:get-project-all', (_, projectId: string) => {
      return this.store.get(`projects.${projectId}`) || {};
    });

    // 订阅配置变更
    ipcMain.on('store:subscribe', (event, scope: string) => {
      const sender = event.sender;
      const listener = (data: any) => {
        if (!sender.isDestroyed()) {
          sender.send('store:changed', { scope, data });
        }
      };

      if (!this.changeListeners.has(scope)) {
        this.changeListeners.set(scope, new Set());
      }
      this.changeListeners.get(scope)!.add(listener);

      // 清理时取消订阅
      sender.on('destroyed', () => {
        this.changeListeners.get(scope)?.delete(listener);
      });
    });

    // 会话管理（不持久化）
    ipcMain.handle('store:set-session', (_, windowId: string, data: any) => {
      this.store.set(`sessions.${windowId}`, data);
      return { success: true };
    });

    ipcMain.handle('store:get-session', (_, windowId: string) => {
      return this.store.get(`sessions.${windowId}`);
    });

    ipcMain.handle('store:clear-session', (_, windowId: string) => {
      this.store.delete(`sessions.${windowId}` as any);
      return { success: true };
    });
  }

  private broadcast(scope: string, data: any) {
    const listeners = this.changeListeners.get(scope);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  private getEncryptionKey(): string {
    // 从安全存储获取或生成
    const { safeStorage } = require('electron');
    if (safeStorage.isEncryptionAvailable()) {
      return 'hajimi-secure-key-v1';
    }
    return '';
  }

  // 迁移旧版本配置
  migrate(fromVersion: string): void {
    const currentVersion = this.store.get('version') as string || '0.0.0';
    
    if (currentVersion < '1.0.0') {
      // 执行 v1.0.0 迁移
      const oldConfig = this.store.store;
      // ... 迁移逻辑
      this.store.set('version', '1.0.0');
    }
  }
}

export const storeManager = new StoreManager();
```

### 6.3 渲染进程状态管理集成

```typescript
// renderer: store-hooks.ts
import { useState, useEffect, useCallback } from 'react';

// 全局配置 Hook
export function useGlobalConfig<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    // 初始加载
    window.electronAPI.store.getGlobal(key).then(setValue);

    // 订阅变更
    const unsubscribe = window.electronAPI.store.subscribe('global', (data: any) => {
      if (data.key === key) {
        setValue(data.value);
      }
    });

    return unsubscribe;
  }, [key]);

  const updateValue = useCallback((newValue: T) => {
    setValue(newValue);
    window.electronAPI.store.setGlobal(key, newValue);
  }, [key]);

  return [value, updateValue];
}

// 项目配置 Hook
export function useProjectConfig<T>(projectId: string, key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    window.electronAPI.store.getProject(projectId, key).then((val: T | undefined) => {
      if (val !== undefined) setValue(val);
    });

    const unsubscribe = window.electronAPI.store.subscribe(`project:${projectId}`, (data: any) => {
      if (data.key === key) {
        setValue(data.value);
      }
    });

    return unsubscribe;
  }, [projectId, key]);

  const updateValue = useCallback((newValue: T) => {
    setValue(newValue);
    window.electronAPI.store.setProject(projectId, key, newValue);
  }, [projectId, key]);

  return [value, updateValue];
}

// 会话状态 Hook（临时，不持久化）
export function useSessionState<T>(windowId: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    window.electronAPI.store.getSession(windowId).then((session: any) => {
      if (session?.state) {
        setValue(session.state);
      }
    });

    return () => {
      // 组件卸载时清理会话
      window.electronAPI.store.clearSession(windowId);
    };
  }, [windowId]);

  const updateValue = useCallback((newValue: T) => {
    setValue(newValue);
    window.electronAPI.store.setSession(windowId, { state: newValue });
  }, [windowId]);

  return [value, updateValue];
}
```

### 6.4 与 v1.0.0 现有状态管理的集成

```typescript
// 集成方案：Redux + Electron Store

// 1. 扩展现有 Redux store
// store/index.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// 同步到主进程状态的中间件
const electronSyncMiddleware = (storeAPI: any) => (next: any) => (action: any) => {
  const result = next(action);
  
  // 只同步特定类型的 action
  if (action.type.startsWith('config/') || action.type.startsWith('project/')) {
    const state = storeAPI.getState();
    window.electronAPI.store.syncReduxState({
      type: action.type,
      payload: action.payload,
      state: extractSyncableState(state),
    });
  }
  
  return result;
};

// 2. 处理主进程推送的状态变更
// store/electron-sync.ts
export function setupElectronSync(dispatch: any) {
  // 监听主进程推送的配置变更
  window.electronAPI.store.onExternalChange((change: any) => {
    // 避免循环更新
    if (change.source !== 'renderer') {
      dispatch({
        type: `external/${change.type}`,
        payload: change.payload,
      });
    }
  });

  // 会话恢复
  window.electronAPI.store.getInitialState().then((state: any) => {
    if (state) {
      dispatch({ type: 'session/restore', payload: state });
    }
  });
}

// 3. 分层状态管理
/*
┌─────────────────────────────────────────────────────────────┐
│  全局状态 (electron-store)                                   │
│  ├── 主题、字体等 UI 配置                                     │
│  ├── 快捷键设置                                              │
│  └── 最近打开的项目                                          │
├─────────────────────────────────────────────────────────────┤
│  项目状态 (electron-store, 按项目隔离)                        │
│  ├── 编辑器状态（光标、折叠、断点）                            │
│  ├── 打开的文件列表                                          │
│  └── 调试配置                                                │
├─────────────────────────────────────────────────────────────┤
│  会话状态 (内存/electron-store sessions)                     │
│  ├── 当前打开的标签页                                        │
│  ├── 终端会话                                                │
│  └── 临时 UI 状态                                            │
├─────────────────────────────────────────────────────────────┤
│  运行时状态 (Redux, 内存)                                    │
│  ├── 文件内容缓存                                            │
│  ├── Git 状态                                                │
│  ├── 搜索索引                                                │
│  └── 插件状态                                                │
└─────────────────────────────────────────────────────────────┘
*/

// 4. 迁移现有 localStorage 配置
export async function migrateLocalStorageToStore() {
  const keysToMigrate = [
    'hajimi.theme',
    'hajimi.fontSize',
    'hajimi.recentProjects',
  ];

  for (const key of keysToMigrate) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      const newKey = key.replace('hajimi.', '');
      await window.electronAPI.store.setGlobal(newKey, JSON.parse(value));
      localStorage.removeItem(key);
    }
  }
}
```

### 6.5 状态同步时序图

```
用户修改主题 (渲染进程 A)
        │
        ▼
┌───────────────────┐
│  Redux Action     │
│  config/setTheme  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ electronSync      │
│ Middleware        │
└───────────────────┘
        │
        ▼
┌───────────────────┐     ┌───────────────────┐
│ IPC: store:set-   │────▶│ 主进程 Store      │
│ global            │     │ electron-store    │
└───────────────────┘     └───────────────────┘
                                  │
                                  ▼
                          ┌───────────────────┐
                          │ 广播变更到所有    │
                          │ 渲染进程          │
                          └───────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
       ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
       │ 渲染进程 A  │    │ 渲染进程 B  │    │ 渲染进程 C  │
       │ (发送者,    │    │ 更新 UI     │    │ 更新 UI     │
       │ 跳过更新)   │    │             │    │             │
       └─────────────┘    └─────────────┘    └─────────────┘
```

---

## 7. 内存泄漏防护措施

### 7.1 窗口生命周期管理

```typescript
// 内存泄漏检查清单
const MEMORY_LEAK_CHECKLIST = {
  // 1. 事件监听器
  eventListeners: [
    '使用 removeAllListeners 清理',
    '避免匿名函数监听器',
    '使用 once() 代替 on() 对于一次性事件',
  ],
  
  // 2. IPC 通道
  ipcChannels: [
    '窗口关闭时取消所有 IPC 注册',
    '避免重复注册相同 handler',
    '使用 handleOnce 对于一次性处理',
  ],
  
  // 3. 定时器
  timers: [
    '窗口关闭前清除所有 setInterval',
    '使用 WeakRef 避免闭包引用',
    '限制定时器精度（backgroundThrottling）',
  ],
  
  // 4. 缓存
  caches: [
    '使用 LRU 限制缓存大小',
    '大对象使用 WeakMap/WeakSet',
    '定期清理过期缓存项',
  ],
};
```

### 7.2 调试工具

```typescript
// 内存监控面板
export class MemoryMonitor {
  private snapshots: any[] = [];

  takeSnapshot(label: string) {
    if (global.gc) {
      global.gc(); // 强制 GC
    }
    
    const snapshot = {
      label,
      timestamp: Date.now(),
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
      windowCount: BrowserWindow.getAllWindows().length,
    };
    
    this.snapshots.push(snapshot);
    
    // 检测内存增长
    if (this.snapshots.length > 1) {
      const prev = this.snapshots[this.snapshots.length - 2];
      const growth = snapshot.heapUsed - prev.heapUsed;
      const growthPercent = (growth / prev.heapUsed) * 100;
      
      if (growthPercent > 50) {
        console.warn(`Memory grew ${growthPercent.toFixed(1)}% between "${prev.label}" and "${snapshot.label}"`);
      }
    }
    
    return snapshot;
  }

  generateReport(): string {
    return this.snapshots.map(s => 
      `${s.label}: ${(s.heapUsed / 1024 / 1024).toFixed(2)}MB`
    ).join('\n');
  }
}
```

---

## 8. 总结与建议

### 8.1 架构建议

| 组件 | 推荐方案 | 理由 |
|-----|---------|-----|
| **窗口管理** | 单项目单窗口 + WindowManager LRU | 崩溃隔离、多屏支持 |
| **IPC 通信** | 异步为主 + 流式大文件 | 避免阻塞、支持进度 |
| **拖拽** | HTML5 DnD + IPC 跨窗口协调 | 跨平台、体验一致 |
| **快捷键** | 全局注册 + 局部优先级路由 | 系统级响应 |
| **状态管理** | 主进程 Store + Redux 运行时 | 持久化 + 实时性 |

### 8.2 实现优先级

1. **P0 - 核心**:
   - WindowManager 基础实现
   - 基础 IPC 协议（file:read/write）
   - 窗口隔离（独立 partition）

2. **P1 - 重要**:
   - LRU 内存管理
   - 流式文件传输
   - 全局快捷键

3. **P2 - 增强**:
   - 跨窗口拖拽
   - 状态同步优化
   - 内存监控面板

### 8.3 参考资料

- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [Electron IPC Patterns](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [React DnD](https://react-dnd.github.io/react-dnd/)

---

*文档生成时间: 2026-02-14*  
*研究工单: R-05/09*  
*作者: 窗口管理专家*
