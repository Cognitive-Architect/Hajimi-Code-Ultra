/**
 * YGGDRASIL P2 - WebSocket API路由
 * Route: /api/ws/yggdrasil/vote-updates
 * 
 * 自测点:
 * - WS-001: 握手成功
 * - WS-002: 投票事件广播
 * - WS-003: 连接存活30秒
 */

import { NextRequest } from 'next/server';
import { wsAdapter } from '@/lib/yggdrasil/ws-adapter';

// 标记WebSocket升级处理
export const dynamic = 'force-dynamic';

/**
 * WebSocket升级处理
 * 验证命令: curl -i -N -H "Connection: Upgrade" http://localhost:3000/api/ws/yggdrasil/vote-updates
 */
export async function GET(req: NextRequest) {
  // Next.js App Router不直接支持WebSocket
  // 这个端点用于文档和状态查询
  // 实际WebSocket由lib/yggdrasil/ws-adapter.ts在服务器启动时初始化
  
  const stats = wsAdapter.getStats();
  
  return new Response(
    JSON.stringify({
      status: 'WebSocket endpoint active',
      path: '/api/ws/yggdrasil/vote-updates',
      protocol: 'ws://',
      stats,
      // 客户端连接示例
      example: {
        javascript: `const ws = new WebSocket('ws://localhost:3000/api/ws/yggdrasil/vote-updates');
ws.onopen = () => console.log('WS-001: Connected');
ws.onmessage = (e) => console.log('WS-002:', e.data);
ws.send(JSON.stringify({ type: 'subscribe:proposal', proposalId: 'prop-123' }));`,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * 手动触发广播（用于测试WS-002）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, proposalId, data } = body;

    if (!type || !proposalId) {
      return new Response(
        JSON.stringify({ error: 'Missing type or proposalId' }),
        { status: 400 }
      );
    }

    // 广播事件
    wsAdapter.broadcastVoteEvent({
      type,
      proposalId,
      timestamp: Date.now(),
      data,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Event broadcasted',
        type,
        proposalId,
      }),
      { status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400 }
    );
  }
}
