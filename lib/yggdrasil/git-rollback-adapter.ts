/**
 * YGGDRASIL P1 - Git硬回滚适配器
 * HAJIMI-YGGDRASIL-P1-01
 * 
 * 职责:
 * - 执行git checkout到指定commit
 * - TSA三层与Git状态同步
 * - 原子性保证（失败时Git不切换）
 */

import simpleGit, { SimpleGit, ResetMode } from 'simple-git';
import { tsa } from '@/lib/tsa';
import { PowerState } from '@/lib/types/state';

export interface GitRollbackResult {
  success: boolean;
  commitId: string;
  previousCommit: string;
  currentCommit: string;
  tsaSynced: boolean;
  error?: string;
  durationMs: number;
}

export interface GitStatusSnapshot {
  commitId: string;
  branch: string;
  modifiedFiles: string[];
  timestamp: number;
  state: PowerState;
}

class GitRollbackAdapter {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  /**
   * 执行硬回滚 (HRB-001)
   * git checkout {commitHash}
   */
  async hardRollback(commitId: string): Promise<GitRollbackResult> {
    const startTime = performance.now();
    
    try {
      console.log(`[GitRollback] 开始硬回滚: commit=${commitId}`);

      // 1. 获取当前commit（用于失败时回滚）
      const currentStatus = await this.getCurrentStatus();
      const previousCommit = currentStatus.commitId;

      // 2. 验证目标commit存在
      const commitExists = await this.verifyCommit(commitId);
      if (!commitExists) {
        return {
          success: false,
          commitId,
          previousCommit,
          currentCommit: previousCommit,
          tsaSynced: false,
          error: `Commit not found: ${commitId}`,
          durationMs: Math.round(performance.now() - startTime),
        };
      }

      // 3. 检查是否有未提交更改
      const hasUncommitted = await this.hasUncommittedChanges();
      if (hasUncommitted) {
        // 先stash
        await this.git.stash(['push', '-m', `Auto-stash before rollback to ${commitId}`]);
      }

      // 4. 执行git checkout（原子操作）
      await this.git.checkout(commitId);

      // 5. 验证Git切换成功
      const newStatus = await this.getCurrentStatus();
      if (newStatus.commitId !== commitId) {
        // 切换失败，尝试回滚
        throw new Error(`Git checkout failed: expected ${commitId}, got ${newStatus.commitId}`);
      }

      // 6. 同步TSA状态 (HRB-002)
      const tsaSynced = await this.syncTSAToGitState(commitId);

      const durationMs = Math.round(performance.now() - startTime);

      console.log(`[GitRollback] 硬回滚完成: ${previousCommit} -> ${commitId}, 耗时${durationMs}ms`);

      return {
        success: true,
        commitId,
        previousCommit,
        currentCommit: commitId,
        tsaSynced,
        durationMs,
      };

    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      console.error('[GitRollback] 硬回滚失败:', error);

      // HRB-003: 失败时原子性回滚
      await this.atomicRollback(commitId, error as Error);

      return {
        success: false,
        commitId,
        previousCommit: '',
        currentCommit: '',
        tsaSynced: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      };
    }
  }

  /**
   * 获取Git状态快照
   */
  async getCurrentStatus(): Promise<GitStatusSnapshot> {
    const log = await this.git.log({ maxCount: 1 });
    const status = await this.git.status();
    
    // 从TSA获取当前状态机状态
    const state = await tsa.get<PowerState>('state:current') || 'IDLE';

    return {
      commitId: log.latest?.hash || '',
      branch: status.current || 'HEAD',
      modifiedFiles: status.modified,
      timestamp: Date.now(),
      state,
    };
  }

  /**
   * 获取提交历史
   */
  async getCommitHistory(maxCount: number = 20): Promise<Array<{
    hash: string;
    date: string;
    message: string;
    author: string;
  }>> {
    const log = await this.git.log({ maxCount: maxCount });
    return log.all.map(commit => ({
      hash: commit.hash,
      date: commit.date,
      message: commit.message,
      author: commit.author_name,
    }));
  }

  /**
   * 保存Git状态快照到TSA
   */
  async saveSnapshot(sessionId: string): Promise<GitStatusSnapshot> {
    const snapshot = await this.getCurrentStatus();
    await tsa.set(`yggdrasil:git:snapshot:${sessionId}`, snapshot, { tier: 'ARCHIVE' });
    return snapshot;
  }

  /**
   * 验证commit是否存在 (HRB-001)
   */
  private async verifyCommit(commitId: string): Promise<boolean> {
    try {
      await this.git.show([commitId, '--quiet']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否有未提交更改
   */
  private async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return status.files.length > 0;
  }

  /**
   * TSA与Git状态同步 (HRB-002)
   */
  private async syncTSAToGitState(commitId: string): Promise<boolean> {
    try {
      // 同步Archive层
      await tsa.set('yggdrasil:git:current_commit', commitId, { tier: 'ARCHIVE' });
      
      // 清除可能冲突的Staging数据
      const keys = tsa.keys().filter(k => k.startsWith('session:'));
      for (const key of keys) {
        await tsa.delete(key);
      }

      return true;
    } catch (error) {
      console.error('[GitRollback] TSA同步失败:', error);
      return false;
    }
  }

  /**
   * 原子性回滚 (HRB-003)
   * 当硬回滚失败时，确保Git状态回到之前的状态
   */
  private async atomicRollback(targetCommitId: string, error: Error): Promise<void> {
    console.log('[GitRollback] 执行原子性回滚...');
    
    try {
      // 获取当前状态
      const currentStatus = await this.getCurrentStatus();
      
      // 如果Git已经切换到了目标commit，需要回滚回去
      if (currentStatus.commitId === targetCommitId) {
        // 查找之前的commit
        const log = await this.git.log({ maxCount: 2 });
        if (log.all.length > 1) {
          const previousCommit = log.all[1].hash;
          await this.git.checkout(previousCommit);
          console.log(`[GitRollback] Git已回滚到: ${previousCommit}`);
        }
      }
      
      // 恢复stash（如果有）
      const stashList = await this.git.stash(['list']);
      if (stashList.includes('Auto-stash before rollback')) {
        await this.git.stash(['pop']);
      }
      
    } catch (rollbackError) {
      console.error('[GitRollback] 原子性回滚失败:', rollbackError);
      // 这里可能需要人工介入
    }
  }
}

// 导出单例（使用默认repo路径）
export const gitRollbackAdapter = new GitRollbackAdapter();
export { GitRollbackAdapter };
export default gitRollbackAdapter;
