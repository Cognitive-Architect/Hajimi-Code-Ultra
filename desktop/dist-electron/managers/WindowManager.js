"use strict";
/**
 * Window Manager
 * 窗口管理（支持多窗口、状态恢复）
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowManager = void 0;
const electron_1 = require("electron");
const path = __importStar(require("path"));
class WindowManager {
    constructor() {
        this.windows = new Map();
        this.windowStates = new Map();
    }
    /**
     * 创建主窗口
     */
    async createMainWindow(projectPath) {
        const { width, height } = electron_1.screen.getPrimaryDisplay().workAreaSize;
        const window = new electron_1.BrowserWindow({
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
        }
        else {
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
    getAllWindows() {
        return Array.from(this.windows.values());
    }
    /**
     * 获取窗口数量
     */
    getWindowCount() {
        return this.windows.size;
    }
    /**
     * 获取窗口状态
     */
    getWindowState(windowId) {
        return this.windowStates.get(windowId);
    }
    /**
     * 广播消息到所有窗口
     */
    broadcast(channel, ...args) {
        this.windows.forEach((window) => {
            if (!window.isDestroyed()) {
                window.webContents.send(channel, ...args);
            }
        });
    }
    /**
     * 保存窗口状态
     */
    saveWindowState(window, projectPath) {
        const bounds = window.getBounds();
        const state = {
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
    async restoreWindows() {
        // TODO: 从配置文件中读取保存的窗口状态并恢复
        if (this.windows.size === 0) {
            await this.createMainWindow();
        }
    }
}
exports.WindowManager = WindowManager;
//# sourceMappingURL=WindowManager.js.map