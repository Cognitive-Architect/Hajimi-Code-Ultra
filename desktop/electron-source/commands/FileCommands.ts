/**
 * File Commands
 * 文件操作命令（Command 模式）
 * P0-037: 所有操作实现 Command 接口
 */

import { UndoableCommand, CommandPayload } from '../managers/UndoManager';
import { FileManager } from '../managers/FileManager';

// 文件创建命令
export class CreateFileCommand implements UndoableCommand {
  readonly type = 'file' as const;

  constructor(
    public id: string,
    public projectId: string,
    private filePath: string,
    private content: string,
    private fileManager: FileManager
  ) {}

  async execute(): Promise<void> {
    await this.fileManager.writeFile(this.filePath, this.content);
  }

  async undo(): Promise<void> {
    // 移动到回收站
    await this.fileManager.deleteFile(this.filePath);
  }

  async redo(): Promise<void> {
    await this.execute();
  }

  serialize(): CommandPayload {
    return {
      id: this.id,
      type: this.type,
      projectId: this.projectId,
      data: { path: this.filePath, content: this.content },
      timestamp: Date.now(),
    };
  }
}

// 文件重命名命令
export class RenameFileCommand implements UndoableCommand {
  readonly type = 'file' as const;
  private oldPath: string;

  constructor(
    public id: string,
    public projectId: string,
    private filePath: string,
    private newName: string,
    private fileManager: FileManager
  ) {
    this.oldPath = filePath;
  }

  async execute(): Promise<void> {
    // 实际重命名逻辑
    console.log(`[Command] Rename ${this.oldPath} to ${this.newName}`);
  }

  async undo(): Promise<void> {
    // 恢复原名
    console.log(`[Command] Restore name from ${this.newName} to ${this.oldPath}`);
  }

  async redo(): Promise<void> {
    await this.execute();
  }

  serialize(): CommandPayload {
    return {
      id: this.id,
      type: this.type,
      projectId: this.projectId,
      data: { oldPath: this.oldPath, newName: this.newName },
      timestamp: Date.now(),
    };
  }
}

// 文件删除命令
export class DeleteFileCommand implements UndoableCommand {
  readonly type = 'file' as const;
  private backupContent?: string;

  constructor(
    public id: string,
    public projectId: string,
    private filePath: string,
    private fileManager: FileManager
  ) {}

  async execute(): Promise<void> {
    // 备份内容
    const result = await this.fileManager.readFile(this.filePath);
    if (result.success) {
      this.backupContent = result.data;
    }
    // 移动到回收站
    await this.fileManager.deleteFile(this.filePath);
  }

  async undo(): Promise<void> {
    // 从回收站恢复
    if (this.backupContent !== undefined) {
      await this.fileManager.writeFile(this.filePath, this.backupContent);
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
      data: { path: this.filePath },
      timestamp: Date.now(),
    };
  }
}

// 文件编辑命令（用于 Undo/Redo）
export class EditFileCommand implements UndoableCommand {
  readonly type = 'file' as const;
  private oldContent: string;
  private newContent: string;

  constructor(
    public id: string,
    public projectId: string,
    private filePath: string,
    private fileManager: FileManager
  ) {
    this.oldContent = '';
    this.newContent = '';
  }

  setOldContent(content: string): void {
    this.oldContent = content;
  }

  setNewContent(content: string): void {
    this.newContent = content;
  }

  async execute(): Promise<void> {
    await this.fileManager.writeFile(this.filePath, this.newContent);
  }

  async undo(): Promise<void> {
    await this.fileManager.writeFile(this.filePath, this.oldContent);
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
        path: this.filePath, 
        oldContent: this.oldContent,
        newContent: this.newContent,
      },
      timestamp: Date.now(),
    };
  }
}
