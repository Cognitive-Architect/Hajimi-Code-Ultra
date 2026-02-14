"use strict";
/**
 * Project Manager
 * 项目管理（SQLite存储项目元数据）
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class ProjectManager {
    constructor() {
        this.recentProjects = [];
        this.maxRecentProjects = 10;
    }
    /**
     * 打开项目
     */
    async openProject(projectPath) {
        // 检查项目是否存在
        const stats = await fs.stat(projectPath);
        if (!stats.isDirectory()) {
            throw new Error('Path is not a directory');
        }
        const projectName = path.basename(projectPath);
        const project = {
            id: this.generateProjectId(projectPath),
            name: projectName,
            path: projectPath,
            lastOpened: new Date(),
            createdAt: new Date(),
            isFavorite: false,
            settings: {
                excludePatterns: ['node_modules', '.git', '.next', 'dist'],
                gitEnabled: true,
                autoSave: true,
            },
        };
        // 添加到最近项目
        this.addToRecentProjects(project);
        console.log(`[ProjectManager] Opened project: ${projectName}`);
        return project;
    }
    /**
     * 获取最近项目列表
     */
    getRecentProjects() {
        return [...this.recentProjects].sort((a, b) => b.lastOpened.getTime() - a.lastOpened.getTime());
    }
    /**
     * 添加到最近项目
     */
    addToRecentProjects(project) {
        // 移除已存在的相同项目
        this.recentProjects = this.recentProjects.filter((p) => p.path !== project.path);
        // 添加到开头
        this.recentProjects.unshift(project);
        // 限制数量
        if (this.recentProjects.length > this.maxRecentProjects) {
            this.recentProjects = this.recentProjects.slice(0, this.maxRecentProjects);
        }
    }
    /**
     * 生成项目ID
     */
    generateProjectId(projectPath) {
        // 使用路径的hash作为ID
        let hash = 0;
        for (let i = 0; i < projectPath.length; i++) {
            const char = projectPath.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `proj_${Math.abs(hash).toString(16)}`;
    }
    /**
     * 收藏/取消收藏项目
     */
    toggleFavorite(projectId) {
        const project = this.recentProjects.find((p) => p.id === projectId);
        if (project) {
            project.isFavorite = !project.isFavorite;
        }
    }
    /**
     * 从最近列表中移除
     */
    removeFromRecent(projectId) {
        this.recentProjects = this.recentProjects.filter((p) => p.id !== projectId);
    }
}
exports.ProjectManager = ProjectManager;
//# sourceMappingURL=ProjectManager.js.map