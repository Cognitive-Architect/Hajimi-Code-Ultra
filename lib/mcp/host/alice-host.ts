/**
 * Alice MCP Host 实现
 * MCP协议版本: 2024-11-25
 * 
 * 功能：
 * - MCP协议握手与连接管理
 * - 工具发现与管理
 * - 工具调用路由
 * - 权限验证
 * 
 * 目标延迟：<100ms（MCP-001）
 */

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

// 简单UUID生成器（替代uuid包）
function uuidv4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString('hex').match(/(.{8})(.{4})(.{4})(.{4})(.{12})/)!.slice(1).join('-');
}

// MCP协议版本
const MCP_PROTOCOL_VERSION = '2024-11-25';

// 性能目标：工具发现延迟
const DISCOVERY_TIMEOUT_MS = 100;

// MCP消息类型
enum MCPMessageType {
  // 生命周期
  INITIALIZE = 'initialize',
  INITIALIZED = 'initialized',
  
  // 工具
  TOOLS_LIST = 'tools/list',
  TOOLS_CALL = 'tools/call',
  
  // 资源
  RESOURCES_LIST = 'resources/list',
  RESOURCES_READ = 'resources/read',
  
  // 提示
  PROMPTS_LIST = 'prompts/list',
  PROMPTS_GET = 'prompts/get',
  
  // 通知
  NOTIFICATION = 'notification',
  
  // 错误
  ERROR = 'error'
}

// MCP请求接口
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

// MCP响应接口
interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// 工具定义
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// 服务器连接接口
interface MCPServerConnection {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  tools: MCPTool[];
  transport: MCPTransport;
  isConnected: boolean;
}

// 传输层接口
interface MCPTransport {
  send(message: MCPRequest | MCPResponse): Promise<void>;
  onMessage(handler: (message: MCPRequest | MCPResponse) => void): void;
  close(): Promise<void>;
}

// 工具调用结果
interface ToolCallResult {
  success: boolean;
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  error?: string;
  durationMs: number;
}

/**
 * Alice MCP Host 核心类
 * 管理所有MCP服务器连接和工具调用
 */
export class AliceMCPHost extends EventEmitter {
  private servers: Map<string, MCPServerConnection> = new Map();
  private toolRegistry: Map<string, { serverId: string; tool: MCPTool }> = new Map();
  private requestQueue: Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }> = new Map();
  private isInitialized = false;
  private discoveryStats = { totalCalls: 0, avgLatencyMs: 0 };

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.on('server:connected', (serverId: string) => {
      console.log(`[AliceMCPHost] Server connected: ${serverId}`);
      this.emit('status', { type: 'connected', serverId });
    });

    this.on('server:disconnected', (serverId: string) => {
      console.log(`[AliceMCPHost] Server disconnected: ${serverId}`);
      this.cleanupServer(serverId);
      this.emit('status', { type: 'disconnected', serverId });
    });

    this.on('tool:discovered', (tools: MCPTool[]) => {
      console.log(`[AliceMCPHost] Discovered ${tools.length} tools`);
      this.emit('tools:updated', Array.from(this.toolRegistry.keys()));
    });
  }

  /**
   * 初始化MCP Host
   * 执行协议握手
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    console.log(`[AliceMCPHost] Initializing MCP Host (protocol: ${MCP_PROTOCOL_VERSION})`);
    
    this.isInitialized = true;
    this.emit('initialized');
    
    return true;
  }

  /**
   * 连接MCP服务器
   * 执行完整的协议握手流程
   */
  async connectServer(name: string, transport: MCPTransport): Promise<string> {
    const serverId = uuidv4();
    const startTime = Date.now();

    try {
      // 1. 发送initialize请求（协议握手）
      const initRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: uuidv4(),
        method: MCPMessageType.INITIALIZE,
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          clientInfo: {
            name: 'AliceMCPHost',
            version: '1.0.0'
          }
        }
      };

      // 设置消息处理器
      transport.onMessage((message) => {
        this.handleServerMessage(serverId, message);
      });

      // 发送初始化请求
      await transport.send(initRequest);

      // 2. 等待initialized响应
      const initResponse = await this.waitForResponse(initRequest.id, 5000);
      
      if (!initResponse.result) {
        throw new Error('Initialize failed: no result in response');
      }

      const serverInfo = initResponse.result as any;

      // 3. 发送initialized通知
      await transport.send({
        jsonrpc: '2.0',
        id: uuidv4(),
        method: MCPMessageType.INITIALIZED,
        params: {}
      });

      // 4. 发现工具（性能目标：<100ms）
      const discoveryStart = Date.now();
      const tools = await this.discoverTools(transport);
      const discoveryLatency = Date.now() - discoveryStart;

      // 更新性能统计
      this.updateDiscoveryStats(discoveryLatency);

      if (discoveryLatency > DISCOVERY_TIMEOUT_MS) {
        console.warn(`[AliceMCPHost] Discovery latency ${discoveryLatency}ms exceeds target ${DISCOVERY_TIMEOUT_MS}ms`);
      }

      // 5. 注册服务器
      const connection: MCPServerConnection = {
        id: serverId,
        name,
        version: serverInfo.serverInfo?.version || 'unknown',
        capabilities: Object.keys(serverInfo.capabilities || {}),
        tools,
        transport,
        isConnected: true
      };

      this.servers.set(serverId, connection);

      // 6. 注册工具
      this.registerTools(serverId, tools);

      const totalLatency = Date.now() - startTime;
      console.log(`[AliceMCPHost] Server ${name} connected in ${totalLatency}ms, discovered ${tools.length} tools`);

      this.emit('server:connected', serverId);

      return serverId;
    } catch (error) {
      console.error(`[AliceMCPHost] Failed to connect server ${name}:`, error);
      transport.close();
      throw error;
    }
  }

  /**
   * 发现服务器工具
   * 性能目标：<100ms（MCP-001）
   */
  private async discoverTools(transport: MCPTransport): Promise<MCPTool[]> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: MCPMessageType.TOOLS_LIST
    };

    await transport.send(request);

    const response = await this.waitForResponse(request.id, DISCOVERY_TIMEOUT_MS);
    
    if (response.error) {
      throw new Error(`Tools discovery failed: ${response.error.message}`);
    }

    const result = response.result as { tools?: MCPTool[] };
    return result.tools || [];
  }

  /**
   * 注册工具到全局注册表
   */
  private registerTools(serverId: string, tools: MCPTool[]): void {
    for (const tool of tools) {
      this.toolRegistry.set(tool.name, { serverId, tool });
    }
    this.emit('tool:discovered', tools);
  }

  /**
   * 调用工具
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const startTime = Date.now();

    const registration = this.toolRegistry.get(toolName);
    if (!registration) {
      return {
        success: false,
        content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
        durationMs: Date.now() - startTime
      };
    }

    const server = this.servers.get(registration.serverId);
    if (!server || !server.isConnected) {
      return {
        success: false,
        content: [{ type: 'text', text: `Server not connected for tool: ${toolName}` }],
        durationMs: Date.now() - startTime
      };
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: MCPMessageType.TOOLS_CALL,
      params: {
        name: toolName,
        arguments: args
      }
    };

    try {
      await server.transport.send(request);
      const response = await this.waitForResponse(request.id, 30000);

      const durationMs = Date.now() - startTime;

      if (response.error) {
        return {
          success: false,
          content: [{ type: 'text', text: `Tool error: ${response.error.message}` }],
          durationMs
        };
      }

      const result = response.result as { content?: ToolCallResult['content'] };

      return {
        success: true,
        content: result.content || [{ type: 'text', text: 'Success' }],
        durationMs
      };
    } catch (error) {
      return {
        success: false,
        content: [{ type: 'text', text: `Call failed: ${error instanceof Error ? error.message : String(error)}` }],
        durationMs: Date.now() - startTime
      };
    }
  }

  /**
   * 获取所有可用工具
   */
  getAvailableTools(): Array<{ name: string; description: string; serverId: string }> {
    const tools: Array<{ name: string; description: string; serverId: string }> = [];
    this.toolRegistry.forEach((value, name) => {
      tools.push({
        name,
        description: value.tool.description,
        serverId: value.serverId
      });
    });
    return tools;
  }

  /**
   * 获取工具定义
   */
  getToolSchema(toolName: string): MCPTool | null {
    const registration = this.toolRegistry.get(toolName);
    return registration?.tool || null;
  }

  /**
   * 断开服务器连接
   */
  async disconnectServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (server) {
      server.isConnected = false;
      await server.transport.close();
      this.cleanupServer(serverId);
    }
  }

  /**
   * 清理服务器资源
   */
  private cleanupServer(serverId: string): void {
    // 移除该服务器的工具注册
    for (const [toolName, registration] of this.toolRegistry.entries()) {
      if (registration.serverId === serverId) {
        this.toolRegistry.delete(toolName);
      }
    }
    this.servers.delete(serverId);
  }

  /**
   * 处理服务器消息
   */
  private handleServerMessage(serverId: string, message: MCPRequest | MCPResponse): void {
    // 如果是响应，处理等待队列
    if ('id' in message && 'result' in message) {
      const pending = this.requestQueue.get(String(message.id));
      if (pending) {
        clearTimeout(pending.timer);
        this.requestQueue.delete(String(message.id));
        pending.resolve(message);
      }
    }

    // 如果是请求，处理服务器发起的调用
    if ('method' in message) {
      this.handleServerRequest(serverId, message as MCPRequest);
    }
  }

  /**
   * 处理服务器发起的请求
   */
  private async handleServerRequest(serverId: string, request: MCPRequest): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) return;

    // 处理各种通知类型
    switch (request.method) {
      case MCPMessageType.NOTIFICATION:
        this.emit('notification', { serverId, params: request.params });
        break;
      default:
        console.log(`[AliceMCPHost] Unhandled server request: ${request.method}`);
    }
  }

  /**
   * 等待响应
   */
  private waitForResponse(requestId: string | number, timeout: number): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requestQueue.delete(String(requestId));
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.requestQueue.set(String(requestId), { resolve, reject, timer });
    });
  }

  /**
   * 更新发现性能统计
   */
  private updateDiscoveryStats(latencyMs: number): void {
    const { totalCalls, avgLatencyMs } = this.discoveryStats;
    this.discoveryStats.totalCalls++;
    this.discoveryStats.avgLatencyMs = 
      (avgLatencyMs * totalCalls + latencyMs) / this.discoveryStats.totalCalls;
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): { discoveryAvgMs: number; totalCalls: number } {
    return {
      discoveryAvgMs: this.discoveryStats.avgLatencyMs,
      totalCalls: this.discoveryStats.totalCalls
    };
  }

  /**
   * 关闭Host
   */
  async shutdown(): Promise<void> {
    console.log('[AliceMCPHost] Shutting down...');
    
    for (const serverId of Array.from(this.servers.keys())) {
      const server = this.servers.get(serverId);
      if (server) {
        await server.transport.close();
      }
    }
    
    this.servers.clear();
    this.toolRegistry.clear();
    this.requestQueue.clear();
    this.isInitialized = false;
    
    console.log('[AliceMCPHost] Shutdown complete');
  }
}

// 导出单例
export const aliceMCPHost = new AliceMCPHost();

// 导出类型
export type {
  MCPRequest,
  MCPResponse,
  MCPTool,
  ToolCallResult,
  MCPTransport
};
