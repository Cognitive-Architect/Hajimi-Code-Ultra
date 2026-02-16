/**
 * Electron Preload Script
 * 安全地暴露主进程API给渲染进程
 */
declare global {
    interface Window {
        electronAPI: {
            fs: {
                read: (filePath: string) => Promise<{
                    success: boolean;
                    data?: string;
                    error?: string;
                }>;
                write: (filePath: string, content: string) => Promise<{
                    success: boolean;
                    error?: string;
                }>;
                delete: (filePath: string) => Promise<{
                    success: boolean;
                    error?: string;
                }>;
                readdir: (dirPath: string) => Promise<{
                    success: boolean;
                    files?: string[];
                    error?: string;
                }>;
            };
            project: {
                open: () => Promise<any>;
                list: () => Promise<any[]>;
            };
            system: {
                trash: (filePath: string) => Promise<{
                    success: boolean;
                }>;
            };
        };
    }
}
export {};
//# sourceMappingURL=preload.d.ts.map