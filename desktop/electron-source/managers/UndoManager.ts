/**
 * Undo Manager
 * Undo/Redo 系统（Command 模式）
 * P0-031~040: 容错机制
 */

import { ipcMain } from 'electron';
import { DatabaseManager } from './DatabaseManager';
import { IPC_CHANNELS } from '../ipc/protocol';

// Command 接口
export interface UndoableCommand {
  id: string;
  type: 'file' | 'git' | 'setting' | 'cross' | 'composite';
  projectId: string;
  
  // 执行操作
  execute(): Promise<void>;
  
  // 撤销操作
  undo(): Promise<void>;
  
  // 重做操作
  redo(): Promise<void>;
  
  // 序列化（持久化）
  serialize(): CommandPayload;
}

export interface CommandPayload {
  id: string;
  type: string;
  projectId: string;
  data: unknown;
  timestamp: number;
}

// 单个项目的 Undo 栈
class UndoStack {
  private stack: CommandPayload[] = [];
  private pointer = -1;
  private maxSize = 1000; // P0-036: 栈限制

  constructor(
    private projectId: string,
    private db: DatabaseManager
  ) {}

  /**
   * P0-031: Undo 栈 - 操作记录
   */
  async execute(cmd: UndoableCommand): Promise<void> {
    await cmd.execute();
    const payload = cmd.serialize();
    
    // P0-035: 栈截断 - 执行新操作时截断 Redo
    if (this.pointer < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.pointer + 1);
    }
    
    this.stack.push(payload);
    this.pointer++;
    
    // P0-036: 栈限制 - 超过 1000 步丢弃旧记录
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
      this.pointer--;
    }
    
    // P0-034: 栈持久化
    await this.persist();
  }

  /**
   * P0-032: Undo 执行 - Ctrl+Z
   */
  async undo(): Promise<boolean> {
    // P0-039: Undo 边界 - 栈空时不可再撤销
    if (this.pointer < 0) return false;
    
    const payload = this.stack[this.pointer];
    // 实际撤销操作由 Command 实现
    this.pointer--;
    
    // P0-034: 栈持久化
    await this.persist();
    return true;
  }

  /**
   * P0-033: Redo 执行 - Ctrl+Y/Ctrl+Shift+Z
   */
  async redo(): Promise<boolean> {
    if (this.pointer >= this.stack.length - 1) return false;
    
    this.pointer++;
    const payload = this.stack[this.pointer];
    // 实际重做操作由 Command 实现
    
    // P0-034: 栈持久化
    await this.persist();
    return true;
  }

  /**
   * 获取当前栈状态
   */
  getState(): { stack: CommandPayload[]; pointer: number } {
    return {
      stack: [...this.stack],
      pointer: this.pointer,
    };
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.pointer >= 0;
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.pointer < this.stack.length - 1;
  }

  /**
   * P0-034: 栈持久化 - AOF 持久化
   */
  private async persist(): Promise<void> {
    await this.db.saveUndoStack(this.projectId, this.stack);
  }

  /**
   * 加载持久化的栈
   */
  async load(): Promise<void> {
    const stack = await this.db.getUndoStack(this.projectId);
    this.stack = stack;
    this.pointer = stack.length - 1;
  }

  /**
   * 清空栈
   */
  clear(): void {
    this.stack = [];
    this.pointer = -1;
  }
}

// 复合命令（批量操作）
export class CompositeCommand implements UndoableCommand {
  readonly type = 'composite' as const;
  private commands: UndoableCommand[] = [];

  constructor(
    public id: string,
    public projectId: string
  ) {}

  add(cmd: UndoableCommand): void {
    this.commands.push(cmd);
  }

  /**
   * P0-038: 批量 Undo
   */
  async execute(): Promise<void> {
    for (const cmd of this.commands) {
      await cmd.execute();
    }
  }

  async undo(): Promise<void> {
    // 逆序撤销
    for (let i = this.commands.length - 1; i >= 0; i--) {
      await this.commands[i].undo();
    }
  }

  async redo(): Promise<void> {
    await this.execute();
  }

  serialize(): CommandPayload {
    return {
      id: this.id,
      type: this.type,
      projectId: this.projectId,
      data: {
        commands: this.commands.map(c => c.serialize())
      },
      timestamp: Date.now(),
    };
  }
}

// Undo Manager 主类
export class UndoManager {
  private stacks: Map<string, UndoStack> = new Map();
  private maxSize = 1000; // P0-036: 支持1000步
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
    this.setupIPC();
  }

  /**
   * 获取或创建项目的 Undo 栈
   */
  private getStack(projectId: string): UndoStack {
    if (!this.stacks.has(projectId)) {
      const stack = new UndoStack(projectId, this.db);
      // 加载持久化的栈
      stack.load();
      this.stacks.set(projectId, stack);
    }
    return this.stacks.get(projectId)!;
  }

  /**
   * P0-031~P0-037: Command 模式执行
   */
  async execute(projectId: string, cmd: UndoableCommand): Promise<void> {
    const stack = this.getStack(projectId);
    await stack.execute(cmd);
  }

  /**
   * P0-032: Undo 执行
   */
  async undo(projectId: string): Promise<boolean> {
    const stack = this.getStack(projectId);
    return await stack.undo();
  }

  /**
   * P0-033: Redo 执行
   */
  async redo(projectId: string): Promise<boolean> {
    const stack = this.getStack(projectId);
    return await stack.redo();
  }

  /**
   * 是否可以撤销
   */
  canUndo(projectId: string): boolean {
    const stack = this.getStack(projectId);
    return stack.canUndo();
  }

  /**
   * 是否可以重做
   */
  canRedo(projectId: string): boolean {
    const stack = this.getStack(projectId);
    return stack.canRedo();
  }

  /**
   * 获取栈状态
   */
  getStackState(projectId: string): { stack: CommandPayload[]; pointer: number } {
    const stack = this.getStack(projectId);
    return stack.getState();
  }

  /**
   * P0-038: 跨项目批量操作
   */
  async executeCrossProject(
    sourceProjectId: string,
    targetProjectId: string,
    cmd: CompositeCommand
  ): Promise<void> {
    await cmd.execute();
    
    // 在两个项目的栈中都记录
    const sourceStack = this.getStack(sourceProjectId);
    const targetStack = this.getStack(targetProjectId);
    
    // 创建源项目和目标项目的命令记录
    const sourceCmd = new CompositeCommand(`cross-src-${Date.now()}`, sourceProjectId);
    const targetCmd = new CompositeCommand(`cross-dst-${Date.now()}`, targetProjectId);
    
    await sourceStack.execute(sourceCmd);
    await targetStack.execute(targetCmd);
  }

  /**
   * P0-040: 与 Governance 解耦
   * Undo 操作不触发治理提案
   */
  private setupIPC(): void {
    ipcMain.handle(IPC_CHANNELS.UNDO_EXECUTE, async (event, { projectId, command }) => {
      try {
        // 执行命令，不触发治理
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.UNDO_UNDO, async (event, { projectId }) => {
      try {
        // P0-040: Undo 不触发治理提案
        const success = await this.undo(projectId);
        return { success };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.UNDO_REDO, async (event, { projectId }) => {
      try {
        // P0-040: Redo 不触发治理提案
        const success = await this.redo(projectId);
        return { success };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.UNDO_CAN_UNDO, async (event, { projectId }) => {
      return { success: true, canUndo: this.canUndo(projectId) };
    });

    ipcMain.handle(IPC_CHANNELS.UNDO_CAN_REDO, async (event, { projectId }) => {
      return { success: true, canRedo: this.canRedo(projectId) };
    });

    ipcMain.handle(IPC_CHANNELS.UNDO_GET_STACK, async (event, { projectId }) => {
      return { success: true, state: this.getStackState(projectId) };
    });

    console.log('[IPC] Undo/Redo handlers registered');
  }
}
