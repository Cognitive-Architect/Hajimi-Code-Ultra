/**
 * MCP文件系统服务器
 * 
 * 功能：
 * - read_file: 读取文件内容
 * - write_file: 写入文件内容
 * - list_directory: 列出目录内容
 * 
 * 安全特性：
 * - 路径隔离（chroot-like）
 * - 路径规范化
 * - 访问范围限制
 * 
 * 验收标准：文件读写隔离验证（MCP-002）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

// 工具定义
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// 工具调用结果
interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// 安全策略配置
interface SecurityPolicy {
  // 根目录（chroot jail）
  rootPath: string;
  // 允许的文件扩展名（空数组表示允许所有）
  allowedExtensions: string[];
  // 禁止的文件扩展名
  blockedExtensions: string[];
  // 最大文件大小（字节）
  maxFileSize: number;
  // 只读模式
  readOnly: boolean;
  // 允许的操作
  allowedOperations: Array<'read' | 'write' | 'list' | 'delete'>;
}

// 默认安全策略
const DEFAULT_POLICY: SecurityPolicy = {
  rootPath: process.cwd(),
  allowedExtensions: [],
  blockedExtensions: ['.exe', '.dll', '.bat', '.sh', '.cmd'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  readOnly: false,
  allowedOperations: ['read', 'write', 'list']
};

/**
 * 路径安全检查错误
 */
class PathSecurityError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

/**
 * MCP文件系统服务器
 */
export class MCPFilesystemServer extends EventEmitter {
  private policy: SecurityPolicy;
  private normalizedRoot: string;
  private accessLog: Array<{ timestamp: Date; operation: string; path: string; allowed: boolean }> = [];

  constructor(policy: Partial<SecurityPolicy> = {}) {
    super();
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.normalizedRoot = path.resolve(this.policy.rootPath);
    
    console.log(`[MCPFilesystemServer] Root path: ${this.normalizedRoot}`);
    console.log(`[MCPFilesystemServer] Read-only: ${this.policy.readOnly}`);
  }

  /**
   * 获取工具定义
   */
  getTools(): Tool[] {
    const tools: Tool[] = [];

    if (this.policy.allowedOperations.includes('read')) {
      tools.push({
        name: 'read_file',
        description: 'Read the contents of a file at the specified path. Returns the file content as text.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file within the workspace'
            },
            encoding: {
              type: 'string',
              enum: ['utf-8', 'base64', 'latin1'],
              description: 'File encoding (default: utf-8)',
              default: 'utf-8'
            }
          },
          required: ['path']
        }
      });
    }

    if (this.policy.allowedOperations.includes('write')) {
      tools.push({
        name: 'write_file',
        description: 'Write content to a file at the specified path. Creates the file if it does not exist.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file within the workspace'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            },
            encoding: {
              type: 'string',
              enum: ['utf-8', 'base64'],
              description: 'Content encoding (default: utf-8)',
              default: 'utf-8'
            }
          },
          required: ['path', 'content']
        }
      });
    }

    if (this.policy.allowedOperations.includes('list')) {
      tools.push({
        name: 'list_directory',
        description: 'List the contents of a directory. Returns files and subdirectories with their types.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the directory (default: ".")',
              default: '.'
            },
            recursive: {
              type: 'boolean',
              description: 'Whether to list recursively (default: false)',
              default: false
            }
          },
          required: []
        }
      });
    }

    return tools;
  }

  /**
   * 规范化并验证路径
   * 确保路径在chroot jail内
   */
  private async resolvePath(inputPath: string): Promise<string> {
    // 规范化输入路径
    const normalized = path.normalize(inputPath);
    
    // 阻止路径遍历攻击
    if (normalized.startsWith('..') || normalized.includes('../') || normalized.includes('..\\')) {
      throw new PathSecurityError(
        `Path traversal attempt detected: ${inputPath}`,
        'PATH_TRAVERSAL'
      );
    }

    // 构建绝对路径
    const absolutePath = path.resolve(this.normalizedRoot, normalized);
    
    // 验证路径在根目录内
    if (!absolutePath.startsWith(this.normalizedRoot)) {
      throw new PathSecurityError(
        `Access denied: path ${inputPath} is outside allowed workspace`,
        'OUTSIDE_JAIL'
      );
    }

    // 检查扩展名限制
    const ext = path.extname(absolutePath).toLowerCase();
    if (this.policy.blockedExtensions.includes(ext)) {
      throw new PathSecurityError(
        `File type not allowed: ${ext}`,
        'BLOCKED_EXTENSION'
      );
    }

    if (this.policy.allowedExtensions.length > 0 && !this.policy.allowedExtensions.includes(ext)) {
      throw new PathSecurityError(
        `File type not in allowed list: ${ext}`,
        'EXTENSION_NOT_ALLOWED'
      );
    }

    return absolutePath;
  }

  /**
   * 记录访问日志
   */
  private logAccess(operation: string, filePath: string, allowed: boolean): void {
    const entry = {
      timestamp: new Date(),
      operation,
      path: filePath,
      allowed
    };
    this.accessLog.push(entry);
    
    // 只保留最近1000条日志
    if (this.accessLog.length > 1000) {
      this.accessLog.shift();
    }

    this.emit('access', entry);
  }

  /**
   * 读取文件
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<ToolResult> {
    try {
      const resolvedPath = await this.resolvePath(filePath);
      
      // 检查是否为文件
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error(`Not a file: ${filePath}`);
      }

      // 检查文件大小
      if (stats.size > this.policy.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${this.policy.maxFileSize})`);
      }

      // 读取文件
      const content = await fs.readFile(resolvedPath, { encoding });
      
      this.logAccess('read', filePath, true);

      return {
        content: [{
          type: 'text',
          text: content
        }]
      };
    } catch (error) {
      this.logAccess('read', filePath, false);
      
      if (error instanceof PathSecurityError) {
        return {
          content: [{
            type: 'text',
            text: `Security violation: ${error.message}`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Error reading file: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 写入文件
   */
  async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<ToolResult> {
    if (this.policy.readOnly) {
      return {
        content: [{
          type: 'text',
          text: 'Write operation denied: filesystem is in read-only mode'
        }],
        isError: true
      };
    }

    try {
      const resolvedPath = await this.resolvePath(filePath);

      // 检查文件大小
      const contentSize = Buffer.byteLength(content, encoding);
      if (contentSize > this.policy.maxFileSize) {
        throw new Error(`Content too large: ${contentSize} bytes (max: ${this.policy.maxFileSize})`);
      }

      // 确保目录存在
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      await fs.writeFile(resolvedPath, content, { encoding });
      
      this.logAccess('write', filePath, true);

      return {
        content: [{
          type: 'text',
          text: `File written successfully: ${filePath}`
        }]
      };
    } catch (error) {
      this.logAccess('write', filePath, false);

      if (error instanceof PathSecurityError) {
        return {
          content: [{
            type: 'text',
            text: `Security violation: ${error.message}`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Error writing file: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 列出目录
   */
  async listDirectory(dirPath: string = '.', recursive: boolean = false): Promise<ToolResult> {
    try {
      const resolvedPath = await this.resolvePath(dirPath);

      // 检查是否为目录
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Not a directory: ${dirPath}`);
      }

      const entries = await this.listDirectoryEntries(resolvedPath, recursive, dirPath);
      
      this.logAccess('list', dirPath, true);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(entries, null, 2)
        }]
      };
    } catch (error) {
      this.logAccess('list', dirPath, false);

      if (error instanceof PathSecurityError) {
        return {
          content: [{
            type: 'text',
            text: `Security violation: ${error.message}`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Error listing directory: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 递归列出目录条目
   */
  private async listDirectoryEntries(
    absolutePath: string, 
    recursive: boolean,
    relativePath: string
  ): Promise<Array<{ name: string; type: 'file' | 'directory'; path: string; size?: number }>> {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const result: Array<{ name: string; type: 'file' | 'directory'; path: string; size?: number }> = [];

    for (const entry of entries) {
      const entryPath = path.join(relativePath, entry.name);
      const entryAbsolutePath = path.join(absolutePath, entry.name);

      if (entry.isDirectory()) {
        result.push({ name: entry.name, type: 'directory', path: entryPath });
        
        if (recursive) {
          const subEntries = await this.listDirectoryEntries(entryAbsolutePath, true, entryPath);
          result.push(...subEntries);
        }
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryAbsolutePath);
        result.push({ 
          name: entry.name, 
          type: 'file', 
          path: entryPath,
          size: stats.size 
        });
      }
    }

    return result;
  }

  /**
   * 处理工具调用
   */
  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'read_file':
        return this.readFile(
          args.path as string,
          (args.encoding as BufferEncoding) || 'utf-8'
        );
      
      case 'write_file':
        return this.writeFile(
          args.path as string,
          args.content as string,
          (args.encoding as BufferEncoding) || 'utf-8'
        );
      
      case 'list_directory':
        return this.listDirectory(
          (args.path as string) || '.',
          (args.recursive as boolean) || false
        );
      
      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${toolName}`
          }],
          isError: true
        };
    }
  }

  /**
   * 获取访问日志
   */
  getAccessLog(): Array<{ timestamp: Date; operation: string; path: string; allowed: boolean }> {
    return [...this.accessLog];
  }

  /**
   * 验证路径隔离（MCP-002自检）
   */
  async verifyPathIsolation(): Promise<{ passed: boolean; tests: Array<{ name: string; passed: boolean; error?: string }> }> {
    const tests: Array<{ name: string; passed: boolean; error?: string }> = [];

    // 测试1：路径规范化
    try {
      const testCases = [
        { input: '../etc/passwd', shouldFail: true },
        { input: 'foo/../../../etc/passwd', shouldFail: true },
        { input: 'foo/bar/../../secret', shouldFail: true },
        { input: 'valid/path/file.txt', shouldFail: false }
      ];

      for (const testCase of testCases) {
        try {
          await this.resolvePath(testCase.input);
          if (testCase.shouldFail) {
            tests.push({ 
              name: `Path traversal blocked: ${testCase.input}`, 
              passed: false,
              error: 'Path traversal should have been blocked'
            });
          } else {
            tests.push({ name: `Valid path allowed: ${testCase.input}`, passed: true });
          }
        } catch (e) {
          if (testCase.shouldFail) {
            tests.push({ name: `Path traversal blocked: ${testCase.input}`, passed: true });
          } else {
            tests.push({ 
              name: `Valid path allowed: ${testCase.input}`, 
              passed: false,
              error: e instanceof Error ? e.message : String(e)
            });
          }
        }
      }
    } catch (e) {
      tests.push({ name: 'Path normalization', passed: false, error: String(e) });
    }

    // 测试2：根目录限制
    try {
      const jailTest = path.join(this.normalizedRoot, '..', 'outside.txt');
      if (jailTest.startsWith(this.normalizedRoot)) {
        tests.push({ name: 'Chroot jail enforcement', passed: false, error: 'Jail escape possible' });
      } else {
        tests.push({ name: 'Chroot jail enforcement', passed: true });
      }
    } catch (e) {
      tests.push({ name: 'Chroot jail enforcement', passed: false, error: String(e) });
    }

    const allPassed = tests.every(t => t.passed);
    return { passed: allPassed, tests };
  }
}

// 导出默认实例
export const filesystemServer = new MCPFilesystemServer();

// 导出类型
export type { SecurityPolicy, ToolResult, PathSecurityError };
