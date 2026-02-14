"use strict";
/**
 * Electron Main Process
 * Hajimi Desktop - Phase A Implementation
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const FileManager_1 = require("./managers/FileManager");
const WindowManager_1 = require("./managers/WindowManager");
const ProjectManager_1 = require("./managers/ProjectManager");
// 启用热重载（开发环境）
if (process.env.NODE_ENV === 'development') {
    require('electron-reloader')(module);
}
class HajimiDesktop {
    constructor() {
        this.windowManager = new WindowManager_1.WindowManager();
        this.fileManager = new FileManager_1.FileManager();
        this.projectManager = new ProjectManager_1.ProjectManager();
    }
    async initialize() {
        await electron_1.app.whenReady();
        // 创建主窗口
        await this.windowManager.createMainWindow();
        // 初始化IPC处理器
        this.setupIpcHandlers();
        // 应用激活处理（macOS）
        electron_1.app.on('activate', async () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                await this.windowManager.createMainWindow();
            }
        });
        // 所有窗口关闭时退出（Windows/Linux）
        electron_1.app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                electron_1.app.quit();
            }
        });
        console.log('[Hajimi Desktop] Initialized successfully');
    }
    setupIpcHandlers() {
        // 文件系统 IPC
        electron_1.ipcMain.handle('fs:read', async (_, filePath) => {
            return this.fileManager.readFile(filePath);
        });
        electron_1.ipcMain.handle('fs:write', async (_, filePath, content) => {
            return this.fileManager.writeFile(filePath, content);
        });
        electron_1.ipcMain.handle('fs:delete', async (_, filePath) => {
            return this.fileManager.deleteFile(filePath);
        });
        electron_1.ipcMain.handle('fs:readdir', async (_, dirPath) => {
            return this.fileManager.readDirectory(dirPath);
        });
        // 项目 IPC
        electron_1.ipcMain.handle('project:open', async () => {
            const result = await electron_1.dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Open Project'
            });
            if (!result.canceled && result.filePaths.length > 0) {
                return this.projectManager.openProject(result.filePaths[0]);
            }
            return null;
        });
        electron_1.ipcMain.handle('project:list', async () => {
            return this.projectManager.getRecentProjects();
        });
        // 系统 IPC
        electron_1.ipcMain.handle('system:trash', async (_, filePath) => {
            await electron_1.shell.trashItem(filePath);
            return { success: true };
        });
        console.log('[IPC] Handlers registered');
    }
}
// 启动应用
const hajimi = new HajimiDesktop();
hajimi.initialize().catch(console.error);
//# sourceMappingURL=main.js.map