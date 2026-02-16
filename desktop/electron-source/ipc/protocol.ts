/**
 * IPC Protocol Definition
 * 命名空间规范: domain:action
 */

export const IPC_CHANNELS = {
  // 文件系统
  FS_READ: 'fs:read',
  FS_WRITE: 'fs:write',
  FS_DELETE: 'fs:delete',
  FS_READDIR: 'fs:readdir',
  FS_WATCH: 'fs:watch',
  FS_STAT: 'fs:stat',
  FS_MKDIR: 'fs:mkdir',
  
  // 项目
  PROJECT_OPEN: 'project:open',
  PROJECT_CLOSE: 'project:close',
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  
  // 窗口
  WINDOW_CREATE: 'window:create',
  WINDOW_CLOSE: 'window:close',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  
  // Undo/Redo
  UNDO_EXECUTE: 'undo:execute',
  UNDO_UNDO: 'undo:undo',
  UNDO_REDO: 'undo:redo',
  UNDO_CAN_UNDO: 'undo:canUndo',
  UNDO_CAN_REDO: 'undo:canRedo',
  UNDO_GET_STACK: 'undo:getStack',
  
  // 跨窗口
  CROSS_COPY: 'cross:copy',
  CROSS_MOVE: 'cross:move',
  CROSS_BROADCAST: 'cross:broadcast',
  
  // 系统
  SYSTEM_TRASH: 'system:trash',
  SYSTEM_SHOW_DIALOG: 'system:showDialog',
  SYSTEM_CONFIRM_DELETE: 'system:confirmDelete',
  SYSTEM_GET_PATH: 'system:getPath',
  
  // 数据库
  DB_GET_PROJECT: 'db:getProject',
  DB_SAVE_PROJECT: 'db:saveProject',
  DB_DELETE_PROJECT: 'db:deleteProject',
  DB_LIST_PROJECTS: 'db:listProjects',
  DB_GET_FILE: 'db:getFile',
  DB_SAVE_FILE: 'db:saveFile',
  DB_DELETE_FILE: 'db:deleteFile',
} as const;

// 统一响应格式
export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// 错误代码定义
export const ERROR_CODES = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_ALREADY_EXISTS: 'FILE_ALREADY_EXISTS',
  INVALID_PATH: 'INVALID_PATH',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  DB_ERROR: 'DB_ERROR',
  UNDO_EMPTY: 'UNDO_EMPTY',
  REDO_EMPTY: 'REDO_EMPTY',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// 创建成功响应
export function createSuccessResponse<T>(data: T): IPCResponse<T> {
  return { success: true, data };
}

// 创建错误响应
export function createErrorResponse(
  code: string, 
  message: string, 
  details?: unknown
): IPCResponse<never> {
  return { 
    success: false, 
    error: { code, message, details } 
  };
}
