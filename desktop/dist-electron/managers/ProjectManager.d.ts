/**
 * Project Manager
 * 项目管理（SQLite存储项目元数据）
 */
export interface Project {
    id: string;
    name: string;
    path: string;
    lastOpened: Date;
    createdAt: Date;
    isFavorite: boolean;
    settings: ProjectSettings;
}
export interface ProjectSettings {
    excludePatterns: string[];
    gitEnabled: boolean;
    autoSave: boolean;
}
export declare class ProjectManager {
    private recentProjects;
    private maxRecentProjects;
    /**
     * 打开项目
     */
    openProject(projectPath: string): Promise<Project>;
    /**
     * 获取最近项目列表
     */
    getRecentProjects(): Project[];
    /**
     * 添加到最近项目
     */
    private addToRecentProjects;
    /**
     * 生成项目ID
     */
    private generateProjectId;
    /**
     * 收藏/取消收藏项目
     */
    toggleFavorite(projectId: string): void;
    /**
     * 从最近列表中移除
     */
    removeFromRecent(projectId: string): void;
}
//# sourceMappingURL=ProjectManager.d.ts.map