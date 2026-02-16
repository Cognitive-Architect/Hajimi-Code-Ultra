/**
 * Window IPC Handlers
 */

import { ipcMain } from 'electron';
import { WindowManager } from '../../managers/WindowManager';
import { IPC_CHANNELS, createSuccessResponse } from '../protocol';

export function registerWindowHandlers(windowManager: WindowManager): void {
  // 创建新窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_CREATE, async (_, projectPath?: string) => {
    const window = await windowManager.createMainWindow(projectPath);
    return createSuccessResponse({ windowId: window.id });
  });

  // 关闭窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async (_, windowId: number) => {
    windowManager.closeWindow(windowId);
    return createSuccessResponse(null);
  });

  // 聚焦窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_FOCUS, async (_, windowId: number) => {
    windowManager.focusWindow(windowId);
    return createSuccessResponse(null);
  });

  // 最小化窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async (_, windowId: number) => {
    windowManager.minimizeWindow(windowId);
    return createSuccessResponse(null);
  });

  // 最大化窗口
  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, async (_, windowId: number) => {
    const isMaximized = windowManager.maximizeWindow(windowId);
    return createSuccessResponse({ isMaximized });
  });

  // 获取所有窗口
  ipcMain.handle('window:getAll', async () => {
    const windows = windowManager.getAllWindows().map(w => ({
      id: w.id,
      title: w.getTitle(),
      isFocused: w.isFocused(),
    }));
    return createSuccessResponse(windows);
  });

  console.log('[IPC] Window handlers registered');
}
