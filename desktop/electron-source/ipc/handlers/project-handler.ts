/**
 * Project IPC Handlers
 */

import { ipcMain, dialog } from 'electron';
import { ProjectManager } from '../../managers/ProjectManager';
import { IPC_CHANNELS, createSuccessResponse, createErrorResponse } from '../protocol';

export function registerProjectHandlers(projectManager: ProjectManager): void {
  // 打开项目
  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open Project Folder'
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return createSuccessResponse(null);
    }
    
    try {
      const project = await projectManager.openProject(result.filePaths[0]);
      return createSuccessResponse(project);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse('PROJECT_OPEN_ERROR', err.message);
    }
  });

  // 关闭项目
  ipcMain.handle(IPC_CHANNELS.PROJECT_CLOSE, async (_, projectId: string) => {
    try {
      await projectManager.closeProject(projectId);
      return createSuccessResponse(null);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse('PROJECT_CLOSE_ERROR', err.message);
    }
  });

  // 获取项目列表
  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async () => {
    try {
      const projects = await projectManager.getRecentProjects();
      return createSuccessResponse(projects);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse('PROJECT_LIST_ERROR', err.message);
    }
  });

  // 创建新项目
  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, async (_, name: string, path: string) => {
    try {
      const project = await projectManager.createProject(name, path);
      return createSuccessResponse(project);
    } catch (error) {
      const err = error as Error;
      return createErrorResponse('PROJECT_CREATE_ERROR', err.message);
    }
  });

  console.log('[IPC] Project handlers registered');
}
