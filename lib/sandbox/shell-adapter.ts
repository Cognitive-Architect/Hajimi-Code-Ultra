/**
 * 黄瓜睦·跨平台 Shell 适配器
 * 
 * 功能：
 * - 检测操作系统类型 (Windows / Linux / macOS)
 * - 提供跨平台的命令执行和环境变量传递
 * - 统一封装 Bash/PowerShell 语法差异
 */

import { spawn, SpawnOptions, exec, ExecOptions } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 操作系统类型
 */
export type Platform = 'win32' | 'linux' | 'darwin' | 'unknown';

/**
 * 获取当前操作系统类型
 */
export function getPlatform(): Platform {
  const platform = process.platform;
  
  switch (platform) {
    case 'win32':
      return 'win32';
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'darwin';
    default:
      return 'unknown';
  }
}

/**
 * 检查是否为 Windows 系统
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * 环境变量配置接口
 */
export interface EnvConfig {
  [key: string]: string | number | boolean | undefined;
}

/**
 * 命令执行选项
 */
export interface ShellExecOptions {
  /** 超时时间 (ms) */
  timeout?: number;
  /** 工作目录 */
  cwd?: string;
  /** 额外的环境变量 */
  env?: EnvConfig;
  /** 是否以同步方式执行 */
  sync?: boolean;
  /** 是否捕获输出 */
  captureOutput?: boolean;
}

/**
 * 命令执行结果
 */
export interface ShellExecResult {
  /** 退出码 */
  exitCode: number;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 执行时间 (ms) */
  duration: number;
}

/**
 * 构建环境变量前缀
 * 
 * Windows: $env:KEY="value"; command
 * Linux/Mac: KEY=value command
 */
export function buildEnvPrefix(env: EnvConfig): string {
  if (Object.keys(env).length === 0) {
    return '';
  }

  if (isWindows()) {
    // PowerShell 语法: $env:KEY="value"; $env:KEY2="value2"; command
    const envStatements = Object.entries(env)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `$env:${key}="${escapePowerShellValue(String(value))}"`)
      .join('; ');
    return envStatements ? `${envStatements}; ` : '';
  } else {
    // Bash 语法: KEY=value KEY2=value2 command
    const envStatements = Object.entries(env)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${escapeBashValue(String(value))}`)
      .join(' ');
    return envStatements ? `${envStatements} ` : '';
  }
}

/**
 * 转义 Bash 环境变量值
 */
function escapeBashValue(value: string): string {
  // 简单转义：如果包含空格或特殊字符，使用引号包裹
  if (/[\s"'\\$`<>|;&]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * 转义 PowerShell 环境变量值
 */
function escapePowerShellValue(value: string): string {
  // 转义 PowerShell 中的双引号
  return value.replace(/"/g, '`"');
}

/**
 * 构建跨平台的完整命令
 */
export function buildCommand(command: string, env?: EnvConfig): string {
  if (!env || Object.keys(env).length === 0) {
    return command;
  }

  const envPrefix = buildEnvPrefix(env);
  return `${envPrefix}${command}`;
}

/**
 * 使用 cross-spawn 风格的方式执行命令（推荐）
 * 通过 env 选项传递环境变量，而非拼接命令字符串
 */
export async function execWithEnv(
  command: string,
  env: EnvConfig = {},
  options: Omit<ShellExecOptions, 'env' | 'sync'> = {}
): Promise<ShellExecResult> {
  const startTime = Date.now();
  
  // 构建环境变量对象（合并当前进程环境变量）
  const childEnv = {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(env)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    )
  };

  const execOptions: ExecOptions = {
    timeout: options.timeout || 30000,
    cwd: options.cwd || process.cwd(),
    env: childEnv,
    windowsHide: true // Windows 下隐藏命令窗口
  };

  try {
    const { stdout, stderr } = await execAsync(command, execOptions);
    
    return {
      exitCode: 0,
      stdout: stdout ? String(stdout) : '',
      stderr: stderr ? String(stderr) : '',
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // exec 在命令失败时抛出错误，但可能包含 stdout/stderr
    if (error.stdout !== undefined || error.stderr !== undefined) {
      return {
        exitCode: error.code || 1,
        stdout: error.stdout ? String(error.stdout) : '',
        stderr: error.stderr ? String(error.stderr) : error.message || '',
        duration
      };
    }
    
    throw error;
  }
}

/**
 * 同步执行命令（带环境变量）
 */
export function execSyncWithEnv(
  command: string,
  env: EnvConfig = {},
  options: Omit<ShellExecOptions, 'env' | 'sync'> = {}
): ShellExecResult {
  const startTime = Date.now();
  const { execSync } = require('child_process');
  
  // 构建环境变量对象
  const childEnv = {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(env)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    )
  };

  try {
    const result = execSync(command, {
      timeout: options.timeout || 30000,
      cwd: options.cwd || process.cwd(),
      env: childEnv,
      encoding: 'utf-8',
      windowsHide: true
    });

    return {
      exitCode: 0,
      stdout: result?.toString() || '',
      stderr: '',
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // execSync 在失败时抛出错误，但可能包含 output 和 stderr
    return {
      exitCode: error.status || 1,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message || '',
      duration
    };
  }
}

/**
 * 使用 spawn 执行命令（带环境变量）
 * 适合长时间运行的进程
 */
export function spawnWithEnv(
  command: string,
  args: string[] = [],
  env: EnvConfig = {},
  options: Omit<SpawnOptions, 'env'> = {}
): ReturnType<typeof spawn> {
  // 构建环境变量对象
  const childEnv = {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(env)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    )
  };

  const spawnOptions: SpawnOptions = {
    ...options,
    env: childEnv,
    windowsHide: true,
    shell: true // 使用 shell 执行，确保跨平台兼容性
  };

  return spawn(command, args, spawnOptions);
}

/**
 * 构建 Docker Compose 命令（带环境变量）
 * 
 * 这是专门为 docker-compose 命令设计的封装，
 * 使用环境变量对象而非命令行前缀
 */
export async function execDockerCompose(
  composeFile: string,
  args: string[],
  env: EnvConfig = {},
  options: Omit<ShellExecOptions, 'env'> = {}
): Promise<ShellExecResult> {
  const command = `docker-compose -f "${composeFile}" ${args.join(' ')}`;
  return execWithEnv(command, env, options);
}

/**
 * 验证环境变量是否正确传递
 * 用于测试和调试
 */
export async function verifyEnvPassThrough(testEnv: EnvConfig): Promise<ShellExecResult> {
  if (isWindows()) {
    // Windows: 使用 PowerShell 输出环境变量
    const envChecks = Object.keys(testEnv)
      .map(key => `Write-Output "${key}=$env:${key}"`)
      .join('; ');
    return execWithEnv(`powershell -Command "${envChecks}"`, testEnv);
  } else {
    // Linux/Mac: 使用 env 命令或 printenv
    const envVars = Object.keys(testEnv).join(',');
    return execWithEnv(`env | grep -E "^(${envVars})="`, testEnv);
  }
}

// 默认导出
export default {
  getPlatform,
  isWindows,
  buildEnvPrefix,
  buildCommand,
  execWithEnv,
  execSyncWithEnv,
  spawnWithEnv,
  execDockerCompose,
  verifyEnvPassThrough
};
