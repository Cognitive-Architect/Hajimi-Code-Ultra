/**
 * Lazy-RAG Server MVP - Express + HNSW
 * B-02/09: Lazy-RAG Server实现
 * 
 * 功能特性：
 * - 极简依赖：仅express + hnswlib-node
 * - MVP端点：仅POST /query
 * - 跨平台存储路径（Windows/Linux兼容）
 * - PID文件防止重复启动
 * - Graceful shutdown处理
 * - 性能埋点：[PERF] query:XXms
 */
import express, { Request, Response } from 'express';
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { platform, tmpdir } from 'os';

// ============ 动态加载HNSW库 ============
let hnswlib: any;
try { 
  hnswlib = require('hnswlib-node'); 
} catch (e) { 
  console.error('[ERROR] hnswlib-node not installed. Run: npm install'); 
  process.exit(1); 
}

// ============ 配置常量 ============
const PORT = parseInt(process.env.LAZY_RAG_PORT || '3456', 10);
const HOST = process.env.LAZY_RAG_HOST || '0.0.0.0';
const STORAGE_PATH = process.env.LAZY_RAG_STORAGE || join(process.cwd(), 'storage', 'lazy-rag');
const PID_FILE = join(tmpdir(), 'lazy-rag-server.pid');
const LOG_FILE = join(STORAGE_PATH, 'server.log');

// ============ 类型定义 ============
interface QueryRequest { 
  embedding: number[]; 
  topK?: number; 
}

interface QueryResult { 
  id: string; 
  score: number; 
}

interface QueryResponse { 
  success: boolean; 
  results: QueryResult[]; 
  latency: number; 
  error?: string; 
}

// ============ HNSW索引管理器 ============
class HNSWIndexManager {
  private index: any = null;
  private dim: number = 1536;
  private indexPath: string;

  constructor() {
    this.indexPath = join(STORAGE_PATH, 'hnsw_index.bin');
    if (!existsSync(STORAGE_PATH)) mkdirSync(STORAGE_PATH, { recursive: true });
    this.loadIndex();
  }

  private loadIndex(): void {
    try {
      if (existsSync(this.indexPath)) {
        this.index = new hnswlib.HierarchicalNSW('l2', this.dim);
        this.index.readIndex(this.indexPath);
        console.log(`[INFO] Loaded index from ${this.indexPath}`);
      } else {
        this.index = new hnswlib.HierarchicalNSW('l2', this.dim);
        this.index.initIndex(10000);
        this.index.setEf(50);
        console.log('[INFO] Created new HNSW index');
      }
    } catch (err) {
      console.error('[ERROR] Failed to load index:', err);
      this.index = new hnswlib.HierarchicalNSW('l2', this.dim);
      this.index.initIndex(10000);
    }
  }

  public saveIndex(): void {
    try { 
      if (this.index) { 
        this.index.writeIndex(this.indexPath); 
        console.log('[INFO] Index saved'); 
      }
    } catch (err) { 
      console.error('[ERROR] Failed to save index:', err); 
    }
  }

  public search(embedding: number[], topK: number = 5): QueryResult[] {
    if (!this.index) return [];
    try {
      // 维度对齐处理：截断或填充
      if (embedding.length !== this.dim) {
        embedding = embedding.length > this.dim 
          ? embedding.slice(0, this.dim)
          : [...embedding, ...new Array(this.dim - embedding.length).fill(0)];
      }
      const result = this.index.searchKnn(embedding, Math.min(topK, 100));
      return result.labels.map((id: number, idx: number) => ({
        id: String(id), score: 1 / (1 + result.distances[idx]),
      }));
    } catch (err) { 
      console.error('[ERROR] Search failed:', err); 
      return []; 
    }
  }

  public getStats() { 
    return { dim: this.dim, path: this.indexPath }; 
  }
}

// ============ 日志管理器 ============
class Logger {
  private logStream: any = null;

  constructor() {
    if (!existsSync(STORAGE_PATH)) mkdirSync(STORAGE_PATH, { recursive: true });
    this.logStream = createWriteStream(LOG_FILE, { flags: 'a' });
  }

  public info(msg: string): void {
    const line = `[${new Date().toISOString()}] [INFO] ${msg}`;
    console.log(line); 
    this.logStream?.write(line + '\n');
  }

  public error(msg: string): void {
    const line = `[${new Date().toISOString()}] [ERROR] ${msg}`;
    console.error(line); 
    this.logStream?.write(line + '\n');
  }

  public perf(operation: string, latencyMs: number): void {
    const line = `[PERF] ${operation}:${Math.round(latencyMs)}ms`;
    console.log(line); 
    this.logStream?.write(`[${new Date().toISOString()}] ${line}\n`);
  }
}

// ============ PID文件管理 ============
class PidManager {
  public static checkAndCreate(): boolean {
    try {
      if (existsSync(PID_FILE)) {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8'), 10);
        try { 
          process.kill(pid, 0); 
          console.error(`[ERROR] Server already running (PID: ${pid})`); 
          return false; 
        }
        catch { unlinkSync(PID_FILE); }
      }
      writeFileSync(PID_FILE, String(process.pid)); 
      return true;
    } catch (e) { 
      console.error('[ERROR] Failed to manage PID file:', e); 
      return false; 
    }
  }

  public static remove(): void {
    try { 
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE); 
    } catch {}
  }
}

// ============ Express应用 ============
const app = express();
const logger = new Logger();
let indexManager: HNSWIndexManager;

app.use(express.json({ limit: '10mb' }));

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => { 
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`); 
  });
  next();
});

// 健康检查端点
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    pid: process.pid, 
    uptime: process.uptime(), 
    memory: process.memoryUsage(), 
    index: indexManager.getStats() 
  });
});

// MVP核心端点: POST /query
app.post('/query', (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { embedding, topK = 5 } = req.body as QueryRequest;
    if (!embedding || !Array.isArray(embedding)) {
      return res.status(400).json({ 
        success: false, 
        results: [], 
        latency: Date.now() - startTime, 
        error: 'Missing or invalid embedding' 
      });
    }
    const searchStart = Date.now();
    const results = indexManager.search(embedding, topK);
    logger.perf('query', Date.now() - searchStart);
    res.json({ success: true, results, latency: Date.now() - startTime });
  } catch (err: any) {
    logger.error(`Query error: ${err.message}`);
    res.status(500).json({ 
      success: false, 
      results: [], 
      latency: Date.now() - startTime, 
      error: err.message 
    });
  }
});

app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });
app.use((err: any, _req: Request, res: Response, _next: any) => { 
  logger.error(`Error: ${err.message}`); 
  res.status(500).json({ error: 'Internal error' }); 
});

// ============ 启动逻辑 ============
function startServer(): void {
  if (!PidManager.checkAndCreate()) process.exit(1);
  indexManager = new HNSWIndexManager();
  
  const server = app.listen(PORT, HOST, () => {
    logger.info(`Lazy-RAG Server at http://${HOST}:${PORT}`);
    logger.info(`Storage: ${STORAGE_PATH}, PID: ${process.pid}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    indexManager.saveIndex();
    server.close(() => { 
      logger.info('Server closed'); 
      PidManager.remove(); 
      process.exit(0); 
    });
    setTimeout(() => { 
      logger.error('Forced shutdown'); 
      PidManager.remove(); 
      process.exit(1); 
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  if (platform() === 'win32') process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  process.on('uncaughtException', (err) => { 
    logger.error(`Exception: ${err.message}`); 
    shutdown('uncaughtException'); 
  });
  process.on('unhandledRejection', (r) => { logger.error(`Rejection: ${r}`); });
}

startServer();
