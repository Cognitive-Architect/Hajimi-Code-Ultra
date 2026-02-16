/**
 * 客服小祥·典狱长 - 沙盒容器编排管理器
 * 
 * 功能：
 * - 管理 Docker 沙盒容器的生命周期
 * - 提供安全的代码执行环境
 * - 支持 rootless 模式和资源限制
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { execWithEnv, execDockerCompose, EnvConfig } from './shell-adapter';

const execAsync = promisify(exec);

// 沙盒配置接口
export interface SandboxConfig {
  /** 沙盒唯一标识 */
  id?: string;
  /** 镜像名称 */
  image?: string;
  /** CPU 限制 (0.0 - N) */
  cpuLimit?: number;
  /** 内存限制 (MB) */
  memoryLimit?: number;
  /** 工作目录 */
  workingDir?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 超时时间 (ms) */
  timeout?: number;
  /** 网络模式 */
  networkMode?: 'none' | 'host' | 'bridge';
  /** 只读文件系统 */
  readOnly?: boolean;
}

// 执行结果接口
export interface ExecutionResult {
  /** 退出码 */
  exitCode: number;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 执行时间 (ms) */
  duration: number;
  /** 是否超时 */
  timedOut: boolean;
}

// 健康状态接口
export interface HealthStatus {
  /** 是否健康 */
  healthy: boolean;
  /** 状态描述 */
  status: string;
  /** 容器状态 */
  containerStatus?: string;
  /** 最后检查时间 */
  checkedAt: Date;
  /** 错误信息 */
  error?: string;
}

// 沙盒信息接口
export interface SandboxInfo {
  id: string;
  containerName: string;
  status: 'pending' | 'running' | 'stopped' | 'error';
  createdAt: Date;
  config: SandboxConfig;
}

/**
 * Jailor 类 - 沙盒管理器
 * 
 * 管理沙盒容器的完整生命周期：
 * - spawn: 创建并启动沙盒
 * - execute: 在沙盒中执行代码
 * - destroy: 销毁沙盒
 * - healthCheck: 检查沙盒健康状态
 */
export class Jailor {
  private sandboxes: Map<string, SandboxInfo> = new Map();
  private composeFilePath: string;

  constructor(
    private options: {
      /** Docker Compose 文件路径 */
      composeFile?: string;
      /** 是否使用 Dockerode */
      useDockerode?: boolean;
      /** 调试模式 */
      debug?: boolean;
    } = {}
  ) {
    // 默认使用项目根目录的 docker-compose.sandbox.yml
    this.composeFilePath = this.options.composeFile || 
      path.resolve(process.cwd(), 'docker-compose.sandbox.yml');
  }

  /**
   * 生成唯一沙盒 ID
   */
  private generateId(): string {
    return `sandbox-${randomUUID().slice(0, 8)}`;
  }

  /**
   * 获取容器名称
   */
  private getContainerName(id: string): string {
    return `sandbox-${id}`;
  }

  /**
   * 记录调试日志
   */
  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log('[Jailor]', ...args);
    }
  }

  /**
   * 执行 Docker 命令
   */
  private async dockerCommand(
    command: string, 
    timeout = 30000,
    env?: EnvConfig
  ): Promise<{ stdout: string; stderr: string }> {
    this.log(`执行命令: ${command}`);
    
    if (env && Object.keys(env).length > 0) {
      // 使用跨平台适配器执行，确保环境变量正确传递
      const result = await execWithEnv(command, env, { timeout, cwd: process.cwd() });
      return { stdout: result.stdout, stderr: result.stderr };
    }
    
    return execAsync(command, { 
      timeout,
      cwd: process.cwd()
    });
  }

  /**
   * 启动沙盒容器
   * 
   * @param config - 沙盒配置
   * @returns 沙盒信息
   */
  async spawn(config: SandboxConfig = {}): Promise<SandboxInfo> {
    const id = config.id || this.generateId();
    const containerName = this.getContainerName(id);

    this.log(`启动沙盒: ${id}`);

    try {
      // 检查容器是否已存在
      const { stdout: existing } = await this.dockerCommand(
        `docker ps -a --filter name=${containerName} --format "{{.Names}}"`
      );
      
      if (existing.trim()) {
        // 移除已存在的容器
        this.log(`移除已存在的容器: ${containerName}`);
        await this.dockerCommand(`docker rm -f ${containerName}`);
      }

      // 构建环境变量配置
      const envConfig: EnvConfig = {
        SANDBOX_ID: id,
        ...config.env
      };

      // 启动容器（使用跨平台适配器，确保环境变量正确传递）
      const composeResult = await execDockerCompose(
        this.composeFilePath,
        ['up', '-d', '--no-deps', 'sandbox'],
        envConfig,
        { timeout: 60000 }
      );
      
      if (composeResult.exitCode !== 0) {
        throw new Error(`Docker Compose 启动失败: ${composeResult.stderr}`);
      }

      // 等待容器启动
      await this.waitForContainer(containerName, 10000);

      // 验证 rootless 用户
      const { stdout: whoami } = await this.dockerCommand(
        `docker exec ${containerName} id -u`
      );
      
      const uid = whoami.trim();
      if (uid !== '1000') {
        throw new Error(`Rootless 验证失败: UID 为 ${uid}, 期望 1000`);
      }

      this.log(`沙盒 ${id} 启动成功，UID: ${uid}`);

      // 保存沙盒信息
      const info: SandboxInfo = {
        id,
        containerName,
        status: 'running',
        createdAt: new Date(),
        config: { ...config, id }
      };
      
      this.sandboxes.set(id, info);
      return info;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`沙盒启动失败: ${errorMsg}`);
      
      throw new Error(`Failed to spawn sandbox ${id}: ${errorMsg}`);
    }
  }

  /**
   * 等待容器启动
   */
  private async waitForContainer(
    containerName: string, 
    timeoutMs: number
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      try {
        const { stdout } = await this.dockerCommand(
          `docker inspect --format="{{.State.Status}}" ${containerName}`
        );
        
        const status = stdout.trim();
        if (status === 'running') {
          return;
        }
        
        if (status === 'exited' || status === 'dead') {
          throw new Error(`容器状态异常: ${status}`);
        }
        
      } catch (error) {
        if (Date.now() - start >= timeoutMs) {
          throw error;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error('等待容器启动超时');
  }

  /**
   * 在沙盒中执行代码
   * 
   * @param id - 沙盒 ID
   * @param code - 要执行的代码或命令
   * @param options - 执行选项
   * @returns 执行结果
   */
  async execute(
    id: string, 
    code: string,
    options: {
      /** 执行超时 (ms) */
      timeout?: number;
      /** 工作目录 */
      cwd?: string;
      /** 解释器 */
      interpreter?: 'sh' | 'bash' | 'node' | 'python3';
    } = {}
  ): Promise<ExecutionResult> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      throw new Error(`沙盒 ${id} 不存在`);
    }

    if (sandbox.status !== 'running') {
      throw new Error(`沙盒 ${id} 未运行 (状态: ${sandbox.status})`);
    }

    const containerName = sandbox.containerName;
    const interpreter = options.interpreter || 'sh';
    const timeout = options.timeout || 30000;

    this.log(`在沙盒 ${id} 中执行代码 (interpreter: ${interpreter})`);

    const startTime = Date.now();
    
    try {
      let command: string;
      
      switch (interpreter) {
        case 'node':
          // 将代码写入文件后执行
          await this.dockerCommand(
            `docker exec ${containerName} sh -c 'echo ${Buffer.from(code).toString('base64')} | base64 -d > /workspace/script.js'`
          );
          command = `docker exec --user=1000:1000 -w ${options.cwd || '/workspace'} ${containerName} node /workspace/script.js`;
          break;
          
        case 'python3':
          await this.dockerCommand(
            `docker exec ${containerName} sh -c 'echo ${Buffer.from(code).toString('base64')} | base64 -d > /workspace/script.py'`
          );
          command = `docker exec --user=1000:1000 -w ${options.cwd || '/workspace'} ${containerName} python3 /workspace/script.py`;
          break;
          
        case 'bash':
          command = `docker exec --user=1000:1000 -w ${options.cwd || '/workspace'} ${containerName} bash -c ${JSON.stringify(code)}`;
          break;
          
        case 'sh':
        default:
          command = `docker exec --user=1000:1000 -w ${options.cwd || '/workspace'} ${containerName} sh -c ${JSON.stringify(code)}`;
          break;
      }

      const { stdout, stderr } = await this.dockerCommand(command, timeout);
      
      return {
        exitCode: 0,
        stdout: stdout,
        stderr: stderr,
        duration: Date.now() - startTime,
        timedOut: false
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 检查是否超时
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Execution timed out',
          duration,
          timedOut: true
        };
      }

      // 解析错误中的退出码和输出
      const errorStr = String(error);
      const exitCodeMatch = errorStr.match(/exit code (\d+)/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 1;

      return {
        exitCode,
        stdout: '',
        stderr: errorStr,
        duration,
        timedOut: false
      };
    }
  }

  /**
   * 检查沙盒健康状态
   * 
   * @param id - 沙盒 ID
   * @returns 健康状态
   */
  async healthCheck(id: string): Promise<HealthStatus> {
    const sandbox = this.sandboxes.get(id);
    const checkedAt = new Date();

    if (!sandbox) {
      return {
        healthy: false,
        status: 'not_found',
        checkedAt,
        error: `沙盒 ${id} 不存在`
      };
    }

    const containerName = sandbox.containerName;

    try {
      // 获取容器状态
      const { stdout: inspect } = await this.dockerCommand(
        `docker inspect --format="{{.State.Status}}|{{.State.Health.Status}}|{{.State.Running}}" ${containerName}`
      );
      
      const [status, healthStatus, running] = inspect.trim().split('|');

      // 验证 rootless 用户
      const { stdout: uid } = await this.dockerCommand(
        `docker exec ${containerName} id -u`
      );

      const isRootless = uid.trim() === '1000';
      const isRunning = running === 'true';

      if (!isRunning) {
        sandbox.status = 'stopped';
        return {
          healthy: false,
          status: 'stopped',
          containerStatus: status,
          checkedAt,
          error: '容器已停止'
        };
      }

      if (!isRootless) {
        return {
          healthy: false,
          status: 'security_violation',
          containerStatus: status,
          checkedAt,
          error: `UID 为 ${uid.trim()}, 期望 1000`
        };
      }

      sandbox.status = 'running';
      return {
        healthy: true,
        status: 'healthy',
        containerStatus: status,
        checkedAt
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      sandbox.status = 'error';
      
      return {
        healthy: false,
        status: 'error',
        checkedAt,
        error: errorMsg
      };
    }
  }

  /**
   * 销毁沙盒容器
   * 
   * @param id - 沙盒 ID
   * @param force - 是否强制销毁
   * @returns 是否成功
   */
  async destroy(id: string, force = false): Promise<boolean> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      this.log(`沙盒 ${id} 不存在，无需销毁`);
      return false;
    }

    const containerName = sandbox.containerName;
    this.log(`销毁沙盒: ${id} (容器: ${containerName})`);

    try {
      // 停止容器
      try {
        await this.dockerCommand(`docker stop ${containerName}`, force ? 5000 : 30000);
      } catch {
        // 忽略停止错误，继续删除
      }

      // 删除容器
      const { stdout } = await this.dockerCommand(`docker rm ${force ? '-f' : ''} ${containerName}`);
      
      if (stdout.includes(containerName) || stdout.trim() === containerName) {
        this.log(`沙盒 ${id} 已成功销毁`);
        this.sandboxes.delete(id);
        return true;
      }

      return false;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`销毁沙盒 ${id} 失败: ${errorMsg}`);
      
      if (force) {
        // 强制模式下，即使出错也从映射中移除
        this.sandboxes.delete(id);
      }
      
      return false;
    }
  }

  /**
   * 销毁所有沙盒
   */
  async destroyAll(force = false): Promise<number> {
    this.log('销毁所有沙盒...');
    
    const ids = Array.from(this.sandboxes.keys());
    let destroyed = 0;
    
    for (const id of ids) {
      const success = await this.destroy(id, force);
      if (success) destroyed++;
    }
    
    // 清理孤儿容器
    try {
      const { stdout } = await this.dockerCommand(
        `docker ps -a --filter name=sandbox- --format "{{.Names}}"`
      );
      
      const containers = stdout.trim().split('\n').filter(Boolean);
      for (const container of containers) {
        try {
          await this.dockerCommand(`docker rm -f ${container}`);
          destroyed++;
        } catch {
          // 忽略错误
        }
      }
    } catch {
      // 忽略错误
    }
    
    return destroyed;
  }

  /**
   * 获取沙盒信息
   */
  getSandbox(id: string): SandboxInfo | undefined {
    return this.sandboxes.get(id);
  }

  /**
   * 获取所有沙盒
   */
  getAllSandboxes(): SandboxInfo[] {
    return Array.from(this.sandboxes.values());
  }

  /**
   * 验证 Docker Compose 配置
   */
  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.dockerCommand(
        `docker-compose -f "${this.composeFilePath}" config`
      );
      return { valid: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { valid: false, error: errorMsg };
    }
  }
}

// 导出单例实例
export const jailor = new Jailor();
export default jailor;
