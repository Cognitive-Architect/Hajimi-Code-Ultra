/**
 * OpenRouter IP直连适配器
 * HAJIMI-OR-IPDIRECT 核心实现
 * 
 * 解决 Windows DNS 解析失败问题，通过 Cloudflare IP 直连
 * 
 * @module lib/quintant/adapters/openrouter-ip-direct
 * @author 唐音 (Engineer) - B-02/09
 */

import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';
import type {
  QuintantAdapter,
  AdapterCapabilities,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  HealthStatus,
  ORIPDirectConfig,
  IPPoolState,
  CallMetadata,
  Message,
} from '../types';
import { IPDirectError } from '../types';

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: Partial<ORIPDirectConfig> = {
  ipPool: {
    primary: '104.21.63.51',
    backups: ['104.21.63.52', '172.67.139.30'],
    healthCheckInterval: 30000,
    connectTimeout: 5000,
    requestTimeout: 30000,
  },
  tls: {
    rejectUnauthorized: false,
    servername: 'api.openrouter.ai',
    pinnedIPRanges: ['104.21.0.0/16', '172.67.0.0/16'],
  },
  modelMapping: {
    // DeepSeek 系列
    'deepseek-v3': 'deepseek/deepseek-chat',
    'deepseek-chat': 'deepseek/deepseek-chat',
    'deepseek-coder': 'deepseek/deepseek-coder',
    // OpenAI 系列
    'gpt-4': 'openai/gpt-4',
    'gpt-4o': 'openai/gpt-4o',
    'gpt-4o-mini': 'openai/gpt-4o-mini',
    'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
    // Anthropic 系列
    'claude-3-opus': 'anthropic/claude-3-opus',
    'claude-3-sonnet': 'anthropic/claude-3-sonnet',
    'claude-3-haiku': 'anthropic/claude-3-haiku',
    // Google 系列
    'gemini-pro': 'google/gemini-pro',
    'gemini-flash': 'google/gemini-flash-1.5',
    // Meta 系列
    'llama-3-70b': 'meta-llama/llama-3-70b-instruct',
    'llama-3-8b': 'meta-llama/llama-3-8b-instruct',
  },
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 30000,
    halfOpenMaxCalls: 2,
  },
  telemetry: {
    verbose: false,
    sampleRate: 1.0,
  },
};

// ============================================================================
// 熔断器状态
// ============================================================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

// ============================================================================
// 主类实现
// ============================================================================

export class OpenRouterIPDirectAdapter extends EventEmitter implements QuintantAdapter {
  public readonly provider = 'openrouter-ipdirect';
  
  public readonly capabilities: AdapterCapabilities = {
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonMode: true,
    maxTokens: 32000,
  };

  private config: ORIPDirectConfig;
  private ipPool: IPPoolState[] = [];
  private circuitBreaker: CircuitBreakerState;
  private currentIPIndex = 0;
  private healthCheckTimer?: NodeJS.Timeout;

  // HTTPS Agent 缓存
  private agents: Map<string, https.Agent> = new Map();

  constructor(config?: Partial<ORIPDirectConfig>) {
    super();
    this.config = this.mergeConfig(config);
    this.circuitBreaker = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0,
    };
    this.initializeIPPool();
    this.startHealthCheck();
  }

  // ========================================================================
  // 配置管理
  // ========================================================================

  private mergeConfig(userConfig?: Partial<ORIPDirectConfig>): ORIPDirectConfig {
    const apiKey = userConfig?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new IPDirectError(
        'API key is required. Set OPENROUTER_API_KEY environment variable.',
        'TLS_HANDSHAKE_FAILED'
      );
    }

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      apiKey,
      ipPool: { ...DEFAULT_CONFIG.ipPool!, ...userConfig?.ipPool },
      tls: { ...DEFAULT_CONFIG.tls!, ...userConfig?.tls },
      modelMapping: { ...DEFAULT_CONFIG.modelMapping, ...userConfig?.modelMapping },
      circuitBreaker: { ...DEFAULT_CONFIG.circuitBreaker!, ...userConfig?.circuitBreaker },
      telemetry: { ...DEFAULT_CONFIG.telemetry!, ...userConfig?.telemetry },
    } as ORIPDirectConfig;
  }

  // ========================================================================
  // IP池管理
  // ========================================================================

  private initializeIPPool(): void {
    const allIPs = [
      this.config.ipPool.primary,
      ...this.config.ipPool.backups,
    ];
    
    this.ipPool = allIPs.map(ip => ({
      ip,
      isHealthy: true,
      lastChecked: new Date(),
      consecutiveFailures: 0,
      averageLatency: 0,
    }));

    this.log('info', 'IP pool initialized', { 
      primary: this.config.ipPool.primary,
      backupCount: this.config.ipPool.backups.length 
    });
  }

  private getHealthyIP(): string {
    // 首先尝试当前索引的IP
    for (let i = 0; i < this.ipPool.length; i++) {
      const idx = (this.currentIPIndex + i) % this.ipPool.length;
      const ipState = this.ipPool[idx];
      
      if (ipState.isHealthy) {
        this.currentIPIndex = idx;
        return ipState.ip;
      }
    }

    // 所有IP都不健康，返回主IP（让它失败并触发降级）
    this.log('warn', 'All IPs unhealthy, falling back to primary');
    return this.config.ipPool.primary;
  }

  private markIPHealthy(ip: string, latency: number): void {
    const state = this.ipPool.find(s => s.ip === ip);
    if (state) {
      state.isHealthy = true;
      state.consecutiveFailures = 0;
      state.averageLatency = latency;
      state.lastChecked = new Date();
    }
  }

  private markIPUnhealthy(ip: string): void {
    const state = this.ipPool.find(s => s.ip === ip);
    if (state) {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= 3) {
        state.isHealthy = false;
        this.log('warn', `IP marked unhealthy after 3 failures`, { ip });
      }
    }
  }

  // ========================================================================
  // 熔断器逻辑
  // ========================================================================

  private checkCircuitBreaker(): void {
    const { state, failureCount, lastFailureTime } = this.circuitBreaker;
    const { failureThreshold, resetTimeout } = this.config.circuitBreaker;

    if (state === 'OPEN') {
      const now = Date.now();
      if (now - lastFailureTime > resetTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.successCount = 0;
        this.log('info', 'Circuit breaker entering HALF_OPEN state');
        this.emit('circuit:halfOpen');
      } else {
        throw new IPDirectError(
          `Circuit breaker is OPEN. Retry after ${resetTimeout}ms`,
          'CIRCUIT_OPEN',
          { remainingCooldown: resetTimeout - (now - lastFailureTime) }
        );
      }
    }
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= this.config.circuitBreaker.halfOpenMaxCalls) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        this.log('info', 'Circuit breaker CLOSED');
        this.emit('circuit:closed');
      }
    } else {
      this.circuitBreaker.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.config.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      this.log('error', 'Circuit breaker OPENED due to consecutive failures');
      this.emit('circuit:open');
    }
  }

  // ========================================================================
  // 模型映射
  // ========================================================================

  private resolveModel(modelId: string): string {
    // 1. 检查映射表
    if (this.config.modelMapping[modelId]) {
      const resolved = this.config.modelMapping[modelId];
      this.log('debug', 'Model resolved via mapping', { from: modelId, to: resolved });
      return resolved;
    }

    // 2. 已符合 provider/model 格式
    if (modelId.includes('/')) {
      return modelId;
    }

    // 3. 尝试启发式推断
    const inferred = this.inferProvider(modelId);
    if (inferred !== modelId) {
      this.log('warn', 'Model provider inferred', { from: modelId, to: inferred });
      return inferred;
    }

    return modelId;
  }

  private inferProvider(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower.includes('claude')) return `anthropic/${modelId}`;
    if (lower.includes('gpt')) return `openai/${modelId}`;
    if (lower.includes('gemini')) return `google/${modelId}`;
    if (lower.includes('llama')) return `meta-llama/${modelId}`;
    return modelId;
  }

  // ========================================================================
  // HTTPS Agent 管理
  // ========================================================================

  private getAgent(ip: string): https.Agent {
    if (!this.agents.has(ip)) {
      const agent = new https.Agent({
        rejectUnauthorized: this.config.tls.rejectUnauthorized,
        servername: this.config.tls.servername,
        family: 4, // IPv4强制
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: this.config.ipPool.requestTimeout,
      });
      this.agents.set(ip, agent);
    }
    return this.agents.get(ip)!;
  }

  // ========================================================================
  // 核心请求方法
  // ========================================================================

  async chatCompletion(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const traceId = this.generateTraceId();
    
    this.log('info', `[OR-DIRECT] Starting chat completion`, { 
      traceId, 
      model: request.model 
    });

    // 检查熔断器
    this.checkCircuitBreaker();

    // 解析模型ID
    const resolvedModel = this.resolveModel(request.model);

    // 获取健康IP
    const ip = this.getHealthyIP();
    
    const metadata: CallMetadata = {
      traceId,
      spanId: this.generateSpanId(),
      startTime,
      endTime: 0,
      usedIP: ip,
      modelId: request.model,
      resolvedModel,
      statusCode: 0,
    };

    try {
      const response = await this.makeRequest(ip, {
        ...request,
        model: resolvedModel,
      });

      metadata.endTime = Date.now();
      metadata.statusCode = 200;

      this.markIPHealthy(ip, metadata.endTime - startTime);
      this.recordSuccess();

      this.log('info', `[OR-DIRECT] Request succeeded`, {
        traceId,
        duration: metadata.endTime - startTime,
        ip,
        model: resolvedModel,
      });

      this.emit('request:success', metadata);
      return response;

    } catch (error) {
      metadata.endTime = Date.now();
      metadata.errorType = error instanceof Error ? error.name : 'Unknown';

      this.markIPUnhealthy(ip);
      this.recordFailure();

      this.log('error', `[OR-DIRECT] Request failed`, {
        traceId,
        error: error instanceof Error ? error.message : String(error),
        ip,
      });

      this.emit('request:failure', metadata, error);
      throw error;
    }
  }

  private makeRequest(ip: string, request: ChatRequest): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(request);
      const agent = this.getAgent(ip);

      const options: https.RequestOptions = {
        hostname: ip,
        port: 443,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Host': this.config.tls.servername,
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'HTTP-Referer': 'https://hajimi.ai',
          'X-Title': 'Hajimi-IPDirect',
        },
        agent,
        timeout: this.config.ipPool.requestTimeout,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data) as ChatResponse;
              resolve(parsed);
            } catch (e) {
              reject(new IPDirectError(
                `Failed to parse response: ${e}`,
                'TLS_HANDSHAKE_FAILED'
              ));
            }
          } else {
            reject(new IPDirectError(
              `HTTP ${res.statusCode}: ${data.substring(0, 200)}`,
              'IP_UNREACHABLE',
              { statusCode: res.statusCode }
            ));
          }
        });
      });

      req.on('error', (err) => {
        reject(new IPDirectError(
          `Request failed: ${err.message}`,
          'IP_UNREACHABLE',
          { code: (err as NodeJS.ErrnoException).code }
        ));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new IPDirectError(
          'Request timeout',
          'IP_UNREACHABLE'
        ));
      });

      req.write(postData);
      req.end();
    });
  }

  // ========================================================================
  // 流式请求 (简化版骨架)
  // ========================================================================

  async chatCompletionStream(
    request: ChatRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    // TODO: 实现流式处理
    // 当前版本返回骨架，由 B-09 完善
    throw new Error('Streaming not yet implemented in B-02');
  }

  // ========================================================================
  // 健康检查
  // ========================================================================

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    const testIP = this.getHealthyIP();

    try {
      // 发送最小化请求测试连通性
      await this.makeRequest(testIP, {
        model: 'deepseek/deepseek-chat',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });

      return {
        status: 'healthy',
        latency: Date.now() - startTime,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private startHealthCheck(): void {
    const interval = this.config.ipPool.healthCheckInterval;
    this.healthCheckTimer = setInterval(async () => {
      for (const ipState of this.ipPool) {
        try {
          const start = Date.now();
          await this.tcpProbe(ipState.ip);
          ipState.isHealthy = true;
          ipState.averageLatency = Date.now() - start;
          ipState.lastChecked = new Date();
        } catch {
          ipState.consecutiveFailures++;
          if (ipState.consecutiveFailures >= 3) {
            ipState.isHealthy = false;
          }
        }
      }
    }, interval);
  }

  private tcpProbe(ip: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new (require('net')).Socket();
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('TCP probe timeout'));
      });
      
      socket.connect(443, ip);
    });
  }

  // ========================================================================
  // 模型列表
  // ========================================================================

  async listModels(): Promise<string[]> {
    return Object.keys(this.config.modelMapping);
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  private generateTraceId(): string {
    return `or-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  private generateSpanId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    if (!this.config.telemetry.verbose && level === 'debug') return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[OR-DIRECT] [${level.toUpperCase()}] [${timestamp}]`;
    
    if (meta) {
      console.log(prefix, message, meta);
    } else {
      console.log(prefix, message);
    }
  }

  // ========================================================================
  // 清理
  // ========================================================================

  dispose(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    for (const agent of Array.from(this.agents.values())) {
      agent.destroy();
    }
    this.agents.clear();
    
    this.removeAllListeners();
  }
}

// 默认导出
export default OpenRouterIPDirectAdapter;
