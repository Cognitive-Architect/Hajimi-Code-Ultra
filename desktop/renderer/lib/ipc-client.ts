/**
 * IPC Client for Renderer Process
 * 封装 Electron API 调用
 */

// 获取 electronAPI
const getAPI = () => (window as any).electronAPI;

// 文件系统操作
export const fs = {
  read: (filePath: string) => getAPI().fs.read(filePath),
  write: (filePath: string, content: string) => getAPI().fs.write(filePath, content),
  delete: (filePath: string) => getAPI().fs.delete(filePath),
  readdir: (dirPath: string) => getAPI().fs.readdir(dirPath),
};

// 项目操作
export const project = {
  open: () => getAPI().project.open(),
  list: () => getAPI().project.list(),
};

// 系统操作
export const system = {
  trash: (filePath: string) => getAPI().system.trash(filePath),
};

// 检查是否在 Electron 环境中
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};
