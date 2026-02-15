/**
 * Window Manager
 * 窗口管理（支持多窗口、状态恢复）
 */
import { BrowserWindow } from 'electron';
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
export declare class WindowManager {
    private windows;
    private windowStates;
    /**
     * 创建主窗口
     */
    createMainWindow(projectPath?: string): Promise<BrowserWindow>;
    /**
     * 获取所有窗口
     */
    getAllWindows(): BrowserWindow[];
    /**
     * 获取窗口数量
     */
    getWindowCount(): number;
    /**
     * 获取窗口状态
     */
    getWindowState(windowId: number): WindowState | undefined;
    /**
     * 广播消息到所有窗口
     */
    broadcast(channel: string, ...args: any[]): void;
    /**
     * 保存窗口状态
     */
    private saveWindowState;
    /**
     * 关闭窗口
     */
    closeWindow(windowId: number): void;
    /**
     * 聚焦窗口
     */
    focusWindow(windowId: number): void;
    /**
     * 最小化窗口
     */
    minimizeWindow(windowId: number): void;
    /**
     * 最大化/恢复窗口
     */
    maximizeWindow(windowId: number): boolean;
    /**
     * 恢复窗口状态（启动时调用）
     */
    restoreWindows(): Promise<void>;
}
//# sourceMappingURL=WindowManager.d.ts.map