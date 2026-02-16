/**
 * System IPC Handlers
 */

import { ipcMain, dialog, shell, app } from 'electron';
import { IPC_CHANNELS, createSuccessResponse, createErrorResponse } from '../protocol';

export function registerSystemHandlers(): void {
  // 移动到回收站
  ipcMain.handle(IPC_CHANNELS.SYSTEM_TRASH, async (_, filePath: string) => {
    try {
      await shell.trashItem(filePath);
      return createSuccessResponse({ success: true });
    } catch (error) {
      const err = error as Error;
      return createErrorResponse('TRASH_ERROR', err.message);
    }
  });

  // 显示对话框
  ipcMain.handle(IPC_CHANNELS.SYSTEM_SHOW_DIALOG, async (_, options: any) => {
    const result = await dialog.showMessageBox(options);
    return createSuccessResponse(result);
  });

  // 确认删除对话框
  ipcMain.handle(IPC_CHANNELS.SYSTEM_CONFIRM_DELETE, async (_, action: string, details: string) => {
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Dangerous Operation Confirmation',
      message: 'This action cannot be undone. Files will be moved to system trash.',
      detail: details,
    });
    
    return createSuccessResponse({ confirmed: result === 1 });
  });

  // 获取特殊路径
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_PATH, async (_, name: string) => {
    try {
      const path = app.getPath(name as any);
      return createSuccessResponse({ path });
    } catch (error) {
      return createErrorResponse('INVALID_PATH_NAME', `Invalid path name: ${name}`);
    }
  });

  console.log('[IPC] System handlers registered');
}
