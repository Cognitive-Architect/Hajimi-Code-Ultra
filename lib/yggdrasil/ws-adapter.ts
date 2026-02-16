/**
 * YGGDRASIL P2 - WebSocket适配器 (MVP版)
 * HAJIMI-YGGDRASIL-P2-WS-MVP
 * 
 * 职责:
 * - WS-001: WebSocket握手管理
 * - WS-002: 投票事件广播
 * - WS-003: 连接存活检测(30秒ping/pong)
 * 
 * 债务声明: Redis PubSub跨实例同步延后至v1.2.0
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

export interface VoteEvent {
  type: 'vote:submitted' | 'proposal:created' | 'proposal:approved' | 'proposal:rejected';
  proposalId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface ConnectedClient {
  ws: WebSocket;
  id: string;
  isAlive: boolean;
  subscribedProposals: Set<string>;
  connectedAt: number;
}

class YggdrasilWebSocketAdapter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30秒 (WS-003)

  /**
   * 初始化WebSocket服务器
   */
  initialize(server: any): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/ws/yggdrasil/vote-updates'
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // 启动心跳检测 (WS-003)
    this.startHeartbeat();

    console.log('[WS-Adapter] WebSocket服务器初始化完成');
  }

  /**
   * 处理新连接 (WS-001)
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = this.generateClientId();
    const client: ConnectedClient = {
      ws,
      id: clientId,
      isAlive: true,
      subscribedProposals: new Set(),
      connectedAt: Date.now(),
    };

    this.clients.set(clientId, client);
    console.log(`[WS-001] 客户端连接成功: ${clientId}, 当前连接数: ${this.clients.size}`);

    // 发送连接确认
    this.sendToClient(client, {
      type: 'connection:established',
      clientId,
      timestamp: Date.now(),
    });

    // 处理pong响应 (WS-003)
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // 处理消息
    ws.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    // 处理关闭
    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    // 处理错误
    ws.on('error', (error: Error) => {
      console.error(`[WS-Adapter] 客户端错误 ${clientId}:`, error.message);
    });
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(client: ConnectedClient, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe:proposal':
          if (message.proposalId) {
            client.subscribedProposals.add(message.proposalId);
            this.sendToClient(client, {
              type: 'subscribe:confirmed',
              proposalId: message.proposalId,
            });
          }
          break;

        case 'unsubscribe:proposal':
          if (message.proposalId) {
            client.subscribedProposals.delete(message.proposalId);
          }
          break;

        case 'ping':
          this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          console.warn(`[WS-Adapter] 未知消息类型: ${message.type}`);
      }
    } catch (error) {
      console.error('[WS-Adapter] 消息解析失败:', error);
    }
  }

  /**
   * 处理断开连接
   */
  private handleDisconnection(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`[WS-Adapter] 客户端断开: ${clientId}, 剩余连接: ${this.clients.size}`);
  }

  /**
   * 广播投票事件 (WS-002)
   */
  broadcastVoteEvent(event: VoteEvent): void {
    const message = JSON.stringify({
      ...event,
      serverTime: Date.now(),
    });

    let sentCount = 0;
    
    for (const client of this.clients.values()) {
      // 如果客户端订阅了特定提案，只发送订阅的
      if (client.subscribedProposals.size > 0) {
        if (!client.subscribedProposals.has(event.proposalId)) {
          continue;
        }
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    }

    console.log(`[WS-002] 广播事件: ${event.type}, 接收客户端: ${sentCount}/${this.clients.size}`);
  }

  /**
   * 启动心跳检测 (WS-003)
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          // 30秒内未响应pong，关闭连接
          console.log(`[WS-003] 心跳超时，关闭连接: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }

        client.isAlive = false;
        client.ws.ping();
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * 发送消息给特定客户端
   */
  private sendToClient(client: ConnectedClient, data: unknown): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  /**
   * 生成客户端ID
   */
  private generateClientId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalConnections: number;
    averageConnectionDuration: number;
  } {
    const now = Date.now();
    const durations: number[] = [];
    
    for (const client of this.clients.values()) {
      durations.push(now - client.connectedAt);
    }

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      totalConnections: this.clients.size,
      averageConnectionDuration: Math.round(avgDuration / 1000), // 秒
    };
  }

  /**
   * 销毁适配器
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    for (const client of this.clients.values()) {
      client.ws.terminate();
    }
    this.clients.clear();
    
    this.wss?.close();
    console.log('[WS-Adapter] WebSocket服务器已关闭');
  }
}

// 导出单例
export const wsAdapter = new YggdrasilWebSocketAdapter();
export default YggdrasilWebSocketAdapter;
