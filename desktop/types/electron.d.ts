/**
 * Electron API 类型声明
 */

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedTime: Date;
}

export interface FileSystemAPI {
  read: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  write: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  delete: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  readdir: (dirPath: string) => Promise<{ success: boolean; files?: FileEntry[]; error?: string }>;
}

export interface ProjectAPI {
  open: () => Promise<any>;
  list: () => Promise<any[]>;
}

export interface SystemAPI {
  trash: (filePath: string) => Promise<{ success: boolean }>;
}

export interface ElectronAPI {
  fs: FileSystemAPI;
  project: ProjectAPI;
  system: SystemAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
