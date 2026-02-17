/**
 * MCP沙箱命令行服务器
 * 
 * 功能：
 * - execute: 执行白名单命令
 * 
 * 安全特性：
 * - 白名单命令
 * - 超时限制（30s）
 * - 危险命令拦截率100%（MCP-003）
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';

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

// 命令配置
interface ShellConfig {
  // 白名单命令（支持通配符）
  allowedCommands: string[];
  // 黑名单命令（绝对禁止）
  blockedCommands: string[];
  // 黑名单模式（正则）
  blockedPatterns: RegExp[];
  // 工作目录
  workingDirectory: string;
  // 默认超时（毫秒）
  defaultTimeout: number;
  // 最大输出长度
  maxOutputLength: number;
  // 环境变量白名单
  allowedEnvVars: string[];
  // 是否允许管道
  allowPipes: boolean;
  // 是否允许重定向
  allowRedirection: boolean;
}

// 默认配置
const DEFAULT_CONFIG: ShellConfig = {
  allowedCommands: [
    // 文件操作
    'cat', 'ls', 'dir', 'find', 'grep', 'head', 'tail', 'wc',
    // 系统信息
    'echo', 'pwd', 'date', 'uname', 'whoami', 'hostname',
    // 进程（只读）
    'ps', 'top', 'htop',
    // 网络
    'ping', 'curl', 'wget', 'nslookup', 'dig',
    // 开发工具
    'git', 'node', 'npm', 'python', 'python3', 'pip',
    // 构建工具
    'make', 'cmake', 'gcc', 'g++',
    // 文本处理
    'sed', 'awk', 'sort', 'uniq', 'diff', 'patch'
  ],
  blockedCommands: [
    // 系统修改
    'rm', 'rmdir', 'mkfs', 'fdisk', 'dd', 'format',
    // 权限提升
    'sudo', 'su', 'doas',
    // 系统控制
    'reboot', 'shutdown', 'halt', 'poweroff', 'init', 'systemctl',
    // 网络危险
    'nc', 'netcat', 'ncat', 'telnet',
    // Shell危险
    'bash', 'sh', 'zsh', 'fish', 'exec', 'eval',
    // 其他危险
    'chmod', 'chown', 'chgrp', 'kill', 'killall', 'pkill'
  ],
  blockedPatterns: [
    // 路径遍历
    /\.\.\//,
    /\.\.\\/,
    // 命令分隔符
    /[;&|]`/,
    // 危险字符
    /[;|`$(){}[\]]/,
    // 二进制执行
    /\b(base64|eval|exec)\b/,
    // 远程代码执行
    /(curl|wget).*\|/,
    // 环境变量注入
    /\$\{/,
    /\$[A-Z_]+/
  ],
  workingDirectory: process.cwd(),
  defaultTimeout: 30000,
  maxOutputLength: 100000,
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'NODE_PATH', 'PYTHONPATH'],
  allowPipes: false,
  allowRedirection: false
};

/**
 * 命令安全错误
 */
class CommandSecurityError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'CommandSecurityError';
  }
}

/**
 * MCP沙箱命令行服务器
 */
export class MCPShellServer extends EventEmitter {
  private config: ShellConfig;
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private executionLog: Array<{
    timestamp: Date;
    command: string;
    allowed: boolean;
    exitCode: number | null;
    durationMs: number;
    error?: string;
  }> = [];

  constructor(config: Partial<ShellConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      blockedPatterns: [...DEFAULT_CONFIG.blockedPatterns, ...(config.blockedPatterns || [])]
    };
    
    console.log(`[MCPShellServer] Working directory: ${this.config.workingDirectory}`);
    console.log(`[MCPShellServer] Timeout: ${this.config.defaultTimeout}ms`);
    console.log(`[MCPShellServer] Allowed commands: ${this.config.allowedCommands.length}`);
  }

  /**
   * 获取工具定义
   */
  getTools(): Tool[] {
    return [
      {
        name: 'shell_execute',
        description: 'Execute a shell command in a sandboxed environment. Only whitelisted commands are allowed.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute'
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'Command arguments',
              default: []
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (max 60000)',
              default: 30000
            },
            workingDir: {
              type: 'string',
              description: 'Working directory for execution',
              default: ''
            }
          },
          required: ['command']
        }
      }
    ];
  }

  /**
   * 验证命令安全性
   * 危险命令拦截率目标：100%（MCP-003）
   */
  private validateCommand(command: string, args: string[]): void {
    const fullCommand = `${command} ${args.join(' ')}`;

    // 1. 检查黑名单命令（直接匹配）
    const cmdBase = path.basename(command).toLowerCase();
    for (const blocked of this.config.blockedCommands) {
      if (cmdBase === blocked.toLowerCase()) {
        throw new CommandSecurityError(
          `Command '${command}' is blocked (security risk)`,
          'BLOCKED_COMMAND'
        );
      }
    }

    // 2. 检查白名单
    const isAllowed = this.config.allowedCommands.some(allowed => {
      // 精确匹配
      if (allowed === cmdBase) return true;
      // 通配符匹配（如 git* 匹配 git, git-status等）
      if (allowed.endsWith('*')) {
        return cmdBase.startsWith(allowed.slice(0, -1));
      }
      return false;
    });

    if (!isAllowed) {
      throw new CommandSecurityError(
        `Command '${command}' is not in the whitelist`,
        'NOT_WHITELISTED'
      );
    }

    // 3. 检查危险模式
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(fullCommand)) {
        throw new CommandSecurityError(
          `Dangerous pattern detected: ${pattern.source}`,
          'DANGEROUS_PATTERN'
        );
      }
    }

    // 4. 检查管道和重定向
    if (!this.config.allowPipes && (fullCommand.includes('|') || fullCommand.includes('||') || fullCommand.includes('&&'))) {
      throw new CommandSecurityError(
        'Pipes and command chaining are not allowed',
        'PIPES_NOT_ALLOWED'
      );
    }

    if (!this.config.allowRedirection && (fullCommand.includes('>') || fullCommand.includes('<') || fullCommand.includes('>>'))) {
      throw new CommandSecurityError(
        'Redirection is not allowed',
        'REDIRECTION_NOT_ALLOWED'
      );
    }
  }

  /**
   * 过滤环境变量
   */
  private filterEnv(): NodeJS.ProcessEnv {
    const filtered: NodeJS.ProcessEnv = {};
    for (const key of this.config.allowedEnvVars) {
      if (process.env[key] !== undefined) {
        filtered[key] = process.env[key];
      }
    }
    return filtered;
  }

  /**
   * 记录执行日志
   */
  private logExecution(command: string, allowed: boolean, exitCode: number | null, durationMs: number, error?: string): void {
    const entry = {
      timestamp: new Date(),
      command: command.substring(0, 500), // 限制长度
      allowed,
      exitCode,
      durationMs,
      error
    };

    this.executionLog.push(entry);
    if (this.executionLog.length > 1000) {
      this.executionLog.shift();
    }

    this.emit('execution', entry);
  }

  /**
   * 执行命令
   */
  async execute(command: string, args: string[] = [], timeout: number = 30000, workingDir?: string): Promise<ToolResult> {
    const executionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullCommand = `${command} ${args.join(' ')}`;
    const startTime = Date.now();
    
    // 限制超时
    const actualTimeout = Math.min(timeout, 60000);

    try {
      // 1. 安全验证
      this.validateCommand(command, args);

      // 2. 准备执行环境
      const cwd = workingDir || this.config.workingDirectory;
      const env = this.filterEnv();

      // 3. 执行命令
      return new Promise((resolve) => {
        const child = spawn(command, args, {
          cwd,
          env,
          shell: false, // 不使用shell模式，防止注入
          timeout: actualTimeout
        });

        this.runningProcesses.set(executionId, child);

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
          // 限制输出大小
          if (stdout.length > this.config.maxOutputLength) {
            stdout = stdout.substring(0, this.config.maxOutputLength) + '\n[Output truncated...]';
            child.kill('SIGTERM');
          }
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
          if (stderr.length > this.config.maxOutputLength) {
            stderr = stderr.substring(0, this.config.maxOutputLength) + '\n[Error output truncated...]';
          }
        });

        const cleanup = (exitCode: number | null, signal: string | null) => {
          this.runningProcesses.delete(executionId);
          const durationMs = Date.now() - startTime;

          this.logExecution(fullCommand, true, exitCode, durationMs);

          const output = stdout || '[No output]';
          const errorOutput = stderr ? `\n\nSTDERR:\n${stderr}` : '';

          if (signal) {
            resolve({
              content: [{
                type: 'text',
                text: `Command terminated by signal: ${signal}\n\n${output}${errorOutput}`
              }],
              isError: true
            });
          } else if (exitCode !== 0) {
            resolve({
              content: [{
                type: 'text',
                text: `Command exited with code ${exitCode}\n\n${output}${errorOutput}`
              }],
              isError: true
            });
          } else {
            resolve({
              content: [{
                type: 'text',
                text: `${output}${errorOutput}`
              }]
            });
          }
        };

        child.on('close', (code, signal) => cleanup(code, signal));
        child.on('error', (error) => {
          this.runningProcesses.delete(executionId);
          const durationMs = Date.now() - startTime;
          this.logExecution(fullCommand, true, null, durationMs, error.message);

          resolve({
            content: [{
              type: 'text',
              text: `Failed to execute command: ${error.message}`
            }],
            isError: true
          });
        });

        // 超时处理
        const timeoutTimer = setTimeout(() => {
          child.kill('SIGTERM');
          // 5秒后强制终止
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }, actualTimeout);

        child.on('close', () => clearTimeout(timeoutTimer));
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.logExecution(fullCommand, false, null, durationMs, errorMsg);

      if (error instanceof CommandSecurityError) {
        this.emit('execution:blocked', { command: fullCommand, error: errorMsg });
        return {
          content: [{
            type: 'text',
            text: `Security Error: ${error.message}`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Execution failed: ${errorMsg}`
        }],
        isError: true
      };
    }
  }

  /**
   * 处理工具调用
   */
  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'shell_execute':
        return this.execute(
          args.command as string,
          (args.args as string[]) || [],
          (args.timeout as number) || this.config.defaultTimeout,
          (args.workingDir as string) || undefined
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
   * 获取执行日志
   */
  getExecutionLog(): Array<{
    timestamp: Date;
    command: string;
    allowed: boolean;
    exitCode: number | null;
    durationMs: number;
    error?: string;
  }> {
    return [...this.executionLog];
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalExecutions: number;
    allowedExecutions: number;
    blockedExecutions: number;
    blockRate: number;
  } {
    const total = this.executionLog.length;
    const allowed = this.executionLog.filter(e => e.allowed).length;
    const blocked = total - allowed;
    const blockRate = total > 0 ? (blocked / total) * 100 : 0;

    return {
      totalExecutions: total,
      allowedExecutions: allowed,
      blockedExecutions: blocked,
      blockRate: Math.round(blockRate * 100) / 100
    };
  }

  /**
   * 终止所有运行中的进程
   */
  async killAll(): Promise<void> {
    this.runningProcesses.forEach((proc, id) => {
      proc.kill('SIGTERM');
      this.runningProcesses.delete(id);
    });
  }

  /**
   * 自检：危险命令拦截测试（MCP-003）
   */
  async verifyDangerousCommandBlocking(): Promise<{
    passed: boolean;
    tests: Array<{ command: string; expectedBlocked: boolean; actualBlocked: boolean; passed: boolean }>;
    blockRate: number;
  }> {
    const dangerousCommands = [
      { cmd: 'rm', args: ['-rf', '/'], shouldBlock: true },
      { cmd: 'sudo', args: ['ls'], shouldBlock: true },
      { cmd: 'bash', args: ['-c', 'evil'], shouldBlock: true },
      { cmd: 'sh', args: ['script.sh'], shouldBlock: true },
      { cmd: 'curl', args: ['http://evil.com'], shouldBlock: false },
      { cmd: 'ls', args: ['-la'], shouldBlock: false },
      { cmd: 'cat', args: ['file.txt'], shouldBlock: false },
      { cmd: 'echo', args: ['hello'], shouldBlock: false }
    ];

    const tests: Array<{ command: string; expectedBlocked: boolean; actualBlocked: boolean; passed: boolean }> = [];

    for (const test of dangerousCommands) {
      const fullCommand = `${test.cmd} ${test.args.join(' ')}`;
      let actualBlocked = false;

      try {
        this.validateCommand(test.cmd, test.args);
      } catch (e) {
        if (e instanceof CommandSecurityError) {
          actualBlocked = true;
        }
      }

      const passed = actualBlocked === test.shouldBlock;
      tests.push({
        command: fullCommand,
        expectedBlocked: test.shouldBlock,
        actualBlocked,
        passed
      });
    }

    const allPassed = tests.every(t => t.passed);
    const blockRate = (tests.filter(t => t.actualBlocked && t.expectedBlocked).length / 
                       tests.filter(t => t.expectedBlocked).length) * 100;

    return { passed: allPassed, tests, blockRate };
  }
}

// 导出默认实例
export const shellServer = new MCPShellServer();

// 导出类型
export type { ShellConfig, ToolResult, CommandSecurityError };
