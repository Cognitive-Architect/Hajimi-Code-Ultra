/**
 * HAJIMI VIRTUALIZED - API路由: /api/virtualized/spawn
 * 
 * 工单 6/6: API层暴露与YGGDRASIL四象限集成
 * 
 * 快捷键绑定: Ctrl+R (重置)
 * 
 * 参考规范:
 * - ID-78（YGGDRASIL聊天治理四象限）
 * - ID-77（Phase 5人格化UI）
 * 
 * @module api/virtualized/spawn
 * @version 1.0.0
 */

import { VirtualAgentPool } from '../../../../lib/virtualized/agent-pool';
import { BNFParser } from '../../../../lib/virtualized/protocol/bnf-parser';

/**
 * Spawn请求体
 */
interface SpawnRequest {
  /** Agent ID */
  id: string;
  /** 重试次数限制 */
  retryLimit?: number;
  /** 隔离级别 */
  isolationLevel?: 'L0_MEMORY' | 'L1_CONTEXT' | 'L2_PROCESS' | 'L3_HARDWARE';
  /** BNF指令模式（可选） */
  bnfCommand?: string;
}

/**
 * Spawn响应
 */
interface SpawnResponse {
  /** 是否成功 */
  success: boolean;
  /** Agent ID */
  agentId?: string;
  /** 上下文边界 */
  contextBoundary?: string;
  /** 状态 */
  state?: string;
  /** 错误信息 */
  error?: string;
  /** 时间戳 */
  timestamp: number;
}

// 全局Agent池实例
const agentPool = new VirtualAgentPool();
const bnfParser = new BNFParser();

/**
 * POST /api/virtualized/spawn
 * 
 * 创建新的VirtualAgent实例
 * 快捷键: Ctrl+R (重置)
 * 
 * @param request - HTTP请求
 * @returns HTTP响应
 */
export async function POST(request: Request): Promise<Response> {
  const timestamp = Date.now();
  
  try {
    // 解析请求体
    const body: SpawnRequest = await request.json();
    
    // 验证必需参数
    if (!body.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameter: id',
          timestamp,
        } as SpawnResponse),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let agent;

    // 支持BNF指令模式
    if (body.bnfCommand) {
      const commands = bnfParser.parse(body.bnfCommand);
      if (commands.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid BNF command',
            timestamp,
          } as SpawnResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      const command = commands[0];
      if (command.type !== 'SPAWN') {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Expected SPAWN command, got ${command.type}`,
            timestamp,
          } as SpawnResponse),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      const bnfId = command.params[0];
      let retryLimit: number | undefined;
      if (command.params.length >= 3 && command.params[1] === 'RETRY') {
        retryLimit = parseInt(command.params[2], 10);
      }
      
      agent = agentPool.spawnAgent(bnfId, retryLimit);
    } else {
      // 标准模式
      agent = agentPool.spawnAgent(body.id, body.retryLimit);
    }

    // 返回成功响应
    const response: SpawnResponse = {
      success: true,
      agentId: agent.id,
      contextBoundary: agent.contextBoundary,
      state: agent.state,
      timestamp,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // 返回错误响应
    const response: SpawnResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp,
    };

    return new Response(
      JSON.stringify(response),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/virtualized/spawn
 * 
 * 获取已创建的Agent列表
 */
export async function GET(): Promise<Response> {
  const agents = Array.from(agentPool.agents.values()).map(agent => ({
    id: agent.id,
    state: agent.state,
    contextBoundary: agent.contextBoundary,
    createdAt: agent.createdAt,
  }));

  return new Response(
    JSON.stringify({
      success: true,
      agents,
      count: agents.length,
      timestamp: Date.now(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * DELETE /api/virtualized/spawn
 * 
 * 终止Agent实例
 */
export async function DELETE(request: Request): Promise<Response> {
  const timestamp = Date.now();
  
  try {
    const body = await request.json();
    const { id, reason = 'API_DELETE' } = body;

    if (!id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameter: id',
          timestamp,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    agentPool.terminateAgent(id, reason);

    return new Response(
      JSON.stringify({
        success: true,
        agentId: id,
        reason,
        timestamp,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
