"use strict";
/**
 * Electron Main Process
 * Hajimi Desktop - Phase A Implementation
 * P0-001~040: Core Features Implementation
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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const FileManager_1 = require("./managers/FileManager");
const WindowManager_1 = require("./managers/WindowManager");
const ProjectManager_1 = require("./managers/ProjectManager");
const DatabaseManager_1 = require("./managers/DatabaseManager");
const UndoManager_1 = require("./managers/UndoManager");
const handlers_1 = require("./ipc/handlers");
// P0-10: 全局错误处理 - 未捕获异常处理
process.on('uncaughtException', (error) => {
    console.error('[Main Process] Uncaught Exception:', error);
    logError('uncaughtException', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main Process] Unhandled Rejection at:', promise, 'reason:', reason);
    logError('unhandledRejection', reason);
});
function logError(type, error) {
    const timestamp = new Date().toISOString();
    const errorLog = `[${timestamp}] ${type}: ${error?.message || error}\n${error?.stack || ''}\n\n`;
    console.error(errorLog);
}
class HajimiDesktop {
    async initialize() {
        console.log('[Hajimi Desktop] Starting initialization...');
        // P0-01: Electron 启动 - 等待应用就绪
        await electron_1.app.whenReady();
        console.log('[Hajimi Desktop] App ready');
        try {
            // P0-011~020: 存储系统初始化
            const dbPath = path.join(electron_1.app.getPath('userData'), 'hajimi.db');
            this.dbManager = new DatabaseManager_1.DatabaseManager(dbPath);
            await this.dbManager.initialize();
            console.log('[Hajimi Desktop] Database initialized');
            // P0-021~030: 文件系统初始化
            this.fileManager = new FileManager_1.FileManager();
            await this.fileManager.initialize();
            console.log('[Hajimi Desktop] FileManager initialized');
            // 项目管理器初始化
            this.projectManager = new ProjectManager_1.ProjectManager(this.dbManager);
            console.log('[Hajimi Desktop] ProjectManager initialized');
            // P0-031~040: Undo/Redo 系统初始化
            this.undoManager = new UndoManager_1.UndoManager(this.dbManager);
            console.log('[Hajimi Desktop] UndoManager initialized');
            // 窗口管理器初始化
            this.windowManager = new WindowManager_1.WindowManager();
            console.log('[Hajimi Desktop] WindowManager initialized');
            // P0-02: Next.js 渲染 - 创建主窗口
            await this.windowManager.createMainWindow();
            console.log('[Hajimi Desktop] Main window created');
            // P0-04: IPC 通信初始化
            this.setupIpcHandlers();
            // 应用生命周期事件
            this.setupAppEvents();
            console.log('[Hajimi Desktop] Initialized successfully');
        }
        catch (error) {
            console.error('[Hajimi Desktop] Initialization failed:', error);
            electron_1.dialog.showErrorBox('Initialization Error', `Failed to start Hajimi Desktop: ${error.message}`);
            electron_1.app.quit();
        }
    }
    setupIpcHandlers() {
        // P0-04: IPC 通信 - 注册所有 handlers
        (0, handlers_1.registerFSHandlers)(this.fileManager);
        (0, handlers_1.registerProjectHandlers)(this.projectManager);
        (0, handlers_1.registerWindowHandlers)(this.windowManager);
        (0, handlers_1.registerSystemHandlers)();
        console.log('[IPC] All handlers registered');
    }
    setupAppEvents() {
        // P0-03: 进程隔离 - Main Process 与 Renderer Process 分离确认
        console.log(`[Process] Main Process ID: ${process.pid}`);
        console.log(`[Process] Process type: ${process.type || 'main'}`);
        // 应用激活处理（macOS）
        electron_1.app.on('activate', async () => {
            console.log('[App] Activated');
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                await this.windowManager.createMainWindow();
            }
        });
        // 所有窗口关闭时退出（Windows/Linux）
        electron_1.app.on('window-all-closed', () => {
            console.log('[App] All windows closed');
            if (process.platform !== 'darwin') {
                electron_1.app.quit();
            }
        });
        // P0-10: 错误处理 - 应用即将退出
        electron_1.app.on('before-quit', async () => {
            console.log('[App] Before quit - cleaning up...');
            if (this.dbManager) {
                await this.dbManager.close();
            }
        });
        // 渲染进程崩溃处理
        electron_1.app.on('render-process-gone', (event, webContents, details) => {
            console.error('[App] Renderer process crashed:', details);
            electron_1.dialog.showErrorBox('Renderer Process Crashed', `Reason: ${details.reason}\nExit Code: ${details.exitCode}`);
        });
        // GPU 进程崩溃处理
        electron_1.app.on('gpu-process-crashed', (event, killed) => {
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
//# sourceMappingURL=main.js.map