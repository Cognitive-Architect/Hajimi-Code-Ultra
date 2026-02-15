/**
 * File System IPC Handlers
 */

import { ipcMain } from 'electron';
import { FileManager } from '../../managers/FileManager';
import { IPC_CHANNELS, createSuccessResponse, createErrorResponse, ERROR_CODES } from '../protocol';

export function registerFSHandlers(fileManager: FileManager): void {
  // 读取文件
  ipcMain.handle(IPC_CHANNELS.FS_READ, async (_, filePath: string) => {
    try {
      const result = await fileManager.readFile(filePath);
      return createSuccessResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('ENOENT')) {
        return createErrorResponse(ERROR_CODES.FILE_NOT_FOUND, `File not found: ${filePath}`);
      }
      if (err.message.includes('EACCES')) {
        return createErrorResponse(ERROR_CODES.FILE_ACCESS_DENIED, `Access denied: ${filePath}`);
      }
      return createErrorResponse(ERROR_CODES.UNKNOWN_ERROR, err.message);
    }
  });

  // 写入文件
  ipcMain.handle(IPC_CHANNELS.FS_WRITE, async (_, filePath: string, content: string) => {
    try {
      await fileManager.writeFile(filePath, content);
      return createSuccessResponse(null);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse(ERROR_CODES.UNKNOWN_ERROR, err.message);
    }
  });

  // 删除文件
  ipcMain.handle(IPC_CHANNELS.FS_DELETE, async (_, filePath: string) => {
    try {
      await fileManager.deleteFile(filePath);
      return createSuccessResponse(null);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse(ERROR_CODES.UNKNOWN_ERROR, err.message);
    }
  });

  // 读取目录
  ipcMain.handle(IPC_CHANNELS.FS_READDIR, async (_, dirPath: string) => {
    try {
      const files = await fileManager.readDirectory(dirPath);
      return createSuccessResponse(files);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse(ERROR_CODES.UNKNOWN_ERROR, err.message);
    }
  });

  // 获取文件状态
  ipcMain.handle(IPC_CHANNELS.FS_STAT, async (_, filePath: string) => {
    try {
      const stat = await fileManager.getFileStats(filePath);
      return createSuccessResponse(stat);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse(ERROR_CODES.UNKNOWN_ERROR, err.message);
    }
  });

  // 创建目录
  ipcMain.handle(IPC_CHANNELS.FS_MKDIR, async (_, dirPath: string, recursive = true) => {
    try {
      await fileManager.createDirectory(dirPath, recursive);
      return createSuccessResponse(null);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse(ERROR_CODES.UNKNOWN_ERROR, err.message);
    }
  });

  console.log('[IPC] FileSystem handlers registered');
}
