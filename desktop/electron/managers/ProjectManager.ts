/**
 * Project Manager
 * 项目管理（SQLite存储项目元数据）
 */

import * as path from 'path';
import * as fs from 'fs/promises';

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

export class ProjectManager {
  private recentProjects: Project[] = [];
  private maxRecentProjects = 10;

  /**
   * 打开项目
   */
  async openProject(projectPath: string): Promise<Project> {
    // 检查项目是否存在
    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    const projectName = path.basename(projectPath);
    const project: Project = {
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
  getRecentProjects(): Project[] {
    return [...this.recentProjects].sort(
      (a, b) => b.lastOpened.getTime() - a.lastOpened.getTime()
    );
  }

  /**
   * 添加到最近项目
   */
  private addToRecentProjects(project: Project): void {
    // 移除已存在的相同项目
    this.recentProjects = this.recentProjects.filter(
      (p) => p.path !== project.path
    );

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
  private generateProjectId(projectPath: string): string {
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
  toggleFavorite(projectId: string): void {
    const project = this.recentProjects.find((p) => p.id === projectId);
    if (project) {
      project.isFavorite = !project.isFavorite;
    }
  }

  /**
   * 从最近列表中移除
   */
  removeFromRecent(projectId: string): void {
    this.recentProjects = this.recentProjects.filter(
      (p) => p.id !== projectId
    );
  }
}
