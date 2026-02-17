/**
 * ============================================================
 * HAJIMI Desktop v1.4.0 - Node.js后端嵌入服务
 * ============================================================
 * 文件: desktop/main/hajimi-embed.ts
 * 职责: Express服务器封装、静态文件服务、热重载（开发模式）
 * 依赖: lib/lcr 核心服务
 * 
 * @version 1.4.0
 * @author Hajimi Team
 */

import * as express from 'express';
import * as http from 'http';
import * as path from 'path';
import { AddressInfo } from 'net';

// ============================================================
// 类型定义
// ============================================================

interface EmbedOptions {
  /** 服务端口，0表示自动分配 */
  port: number;
  /** 开发模式 */
  devMode: boolean;
  /** 静态文件根目录 */
  staticRoot?: string;
  /** 启用热重载 */
  hotReload?: boolean;
}

interface ServiceStatus {
  running: boolean;
  port: number;
  startTime: number;
  requestCount: number;
  errorCount: number;
}

// ============================================================
// Hajimi嵌入服务类
// ============================================================

export class HajimiEmbed {
  private app: express.Application;
  private server: http.Server | null = null;
  private options: EmbedOptions;
  private status: ServiceStatus;
  private lcrService: any | null = null;

  constructor(options: EmbedOptions) {
    this.options = {
      staticRoot: path.join(__dirname, '../../.next'),
      hotReload: options.devMode,
      ...options,
    };

    this.status = {
      running: false,
      port: 0,
      startTime: 0,
      requestCount: 0,
      errorCount: 0,
    };

    this.app = express();
    this.initializeMiddleware();
  }

  // ============================================================
  // 初始化
  // ============================================================

  private initializeMiddleware(): void {
    // 请求日志
    this.app.use((req, res, next) => {
      this.status.requestCount++;
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[Embed] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });

      res.on('error', () => {
        this.status.errorCount++;
      });

      next();
    });

    // CORS配置
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // JSON解析
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 健康检查
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        version: '1.4.0',
        uptime: this.getUptime(),
        timestamp: new Date().toISOString(),
      });
    });

    // 服务状态API
    this.app.get('/api/embed/status', (_req, res) => {
      res.json({
        ...this.status,
        uptime: this.getUptime(),
        memory: process.memoryUsage(),
      });
    });

    // LCR服务代理
    this.setupLcrProxy();

    // 开发模式热重载
    if (this.options.hotReload) {
      this.setupHotReload();
    }

    // 静态文件服务（生产模式）
    if (!this.options.devMode) {
      this.setupStaticFiles();
    }
  }

  // ============================================================
  // LCR服务集成
  // ============================================================

  private setupLcrProxy(): void {
    // 尝试加载 lib/lcr 核心服务
    try {
      const lcrPath = path.join(__dirname, '../../lib/lcr');
      // 动态导入避免启动时阻塞
      this.lcrService = null; // 延迟初始化
      
      console.log(`[Embed] LCR服务路径: ${lcrPath}`);
    } catch (error) {
      console.warn('[Embed] LCR服务加载失败，将使用降级模式:', error);
    }

    // LCR状态代理
    this.app.get('/api/lcr/status', async (_req, res) => {
      try {
        const status = await this.getLcrStatus();
        res.json(status);
      } catch (error) {
        res.status(503).json({
          status: 'unavailable',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // 七权状态代理
    this.app.get('/api/agents/status', async (_req, res) => {
      try {
        const agents = await this.getAgentStatuses();
        res.json(agents);
      } catch (error) {
        res.status(503).json({ error: 'Agents unavailable' });
      }
    });

    // Remix服务代理
    this.app.post('/api/remix', async (req, res) => {
      try {
        const result = await this.callRemixService(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: 'Remix service failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Branching服务代理
    this.app.post('/api/branching', async (req, res) => {
      try {
        const result = await this.callBranchingService(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: 'Branching service failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  private async getLcrStatus(): Promise<any> {
    // TODO: 集成实际的LCR服务状态
    return {
      status: 'running',
      version: '1.4.0',
      services: ['remix', 'branching', 'rollback', 'regenerate'],
      redis: { connected: true },
    };
  }

  private async getAgentStatuses(): Promise<any[]> {
    // 七权Agent状态
    return [
      { id: 'orchestrator', name: '客服小祥', status: 'active', color: '#884499', load: 0.3 },
      { id: 'architect', name: '黄瓜睦', status: 'idle', color: '#669966', load: 0.1 },
      { id: 'engineer', name: '唐音', status: 'active', color: '#FF9999', load: 0.5 },
      { id: 'qa', name: '咕咕嘎嘎', status: 'active', color: '#77BBDD', load: 0.4 },
      { id: 'audit', name: '压力怪', status: 'idle', color: '#7777AA', load: 0.2 },
      { id: 'pm', name: 'Soyorin', status: 'active', color: '#FFDD88', load: 0.3 },
      { id: 'doctor', name: '奶龙娘', status: 'idle', color: '#FFDD00', load: 0.0 },
    ];
  }

  private async callRemixService(params: any): Promise<any> {
    // TODO: 集成实际的Remix服务
    console.log('[Embed] Remix调用:', params);
    return {
      success: true,
      sessionId: params.sessionId,
      compressionRatio: 0.75,
      timestamp: new Date().toISOString(),
    };
  }

  private async callBranchingService(params: any): Promise<any> {
    // TODO: 集成实际的Branching服务
    console.log('[Embed] Branching调用:', params);
    return {
      success: true,
      branchId: `branch-${Date.now()}`,
      name: params.name,
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================
  // 热重载（开发模式）
  // ============================================================

  private setupHotReload(): void {
    if (!this.options.devMode) return;

    console.log('[Embed] 热重载已启用');

    // WebSocket端点用于热重载通知
    const clients: Set<any> = new Set();

    this.app.get('/__hot-reload', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      clients.add(res);
      
      req.on('close', () => {
        clients.delete(res);
      });

      // 发送初始连接消息
      res.write('data: {"type":"connected"}\n\n');
    });

    // 文件监听（简化版）
    if (this.options.hotReload) {
      const chokidar = this.tryRequire('chokidar');
      if (chokidar) {
        const watcher = chokidar.watch([
          path.join(__dirname, '../../app/**/*'),
          path.join(__dirname, '../../lib/**/*'),
        ], {
          ignored: /node_modules/,
          persistent: true,
        });

        watcher.on('change', (filePath: string) => {
          console.log(`[Embed] 文件变更: ${filePath}`);
          // 通知所有客户端刷新
          clients.forEach((client: any) => {
            client.write(`data: {"type":"reload","file":"${filePath}"}\n\n`);
          });
        });
      } else {
        console.warn('[Embed] chokidar未安装，热重载受限');
      }
    }
  }

  // ============================================================
  // 静态文件服务
  // ============================================================

  private setupStaticFiles(): void {
    const staticRoot = this.options.staticRoot!;
    
    // 静态文件缓存控制
    this.app.use(express.static(staticRoot, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
    }));

    // SPA路由回退
    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(staticRoot, 'index.html'));
    });
  }

  // ============================================================
  // 服务控制
  // ============================================================

  async start(): Promise<void> {
    if (this.status.running) {
      throw new Error('服务已在运行');
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, () => {
        const address = this.server?.address() as AddressInfo;
        this.status.port = address.port;
        this.status.running = true;
        this.status.startTime = Date.now();

        console.log(`[Embed] 服务已启动，端口: ${this.status.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  stop(): void {
    if (!this.status.running || !this.server) {
      return;
    }

    console.log('[Embed] 正在停止服务...');
    
    this.server.close(() => {
      console.log('[Embed] 服务已停止');
    });

    this.status.running = false;
    this.status.port = 0;
  }

  // ============================================================
  // 工具方法
  // ============================================================

  getPort(): number {
    return this.status.port;
  }

  isRunning(): boolean {
    return this.status.running;
  }

  getUptime(): number {
    if (!this.status.running) return 0;
    return Date.now() - this.status.startTime;
  }

  private tryRequire(module: string): any {
    try {
      return require(module);
    } catch {
      return null;
    }
  }
}

// ============================================================
// 导出工厂函数
// ============================================================

export function createEmbedService(options: Partial<EmbedOptions> = {}): HajimiEmbed {
  return new HajimiEmbed({
    port: 0,
    devMode: process.env.NODE_ENV === 'development',
    ...options,
  });
}
