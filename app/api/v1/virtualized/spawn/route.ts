/**
 * HAJIMI VIRTUALIZED - API路由: /api/v1/virtualized/spawn
 * 
 * 集成至Hajimi-Code-Ultra v1.2.0
 * 快捷键绑定: Ctrl+R (重置)
 * 
 * @version 1.0.0
 */

import { VirtualAgentPool } from '../../../../../lib/virtualized/agent-pool';
import { BNFParser } from '../../../../../lib/virtualized/protocol/bnf-parser';

interface SpawnRequest {
  id: string;
  retryLimit?: number;
  isolationLevel?: 'L0_MEMORY' | 'L1_CONTEXT' | 'L2_PROCESS' | 'L3_HARDWARE';
  bnfCommand?: string;
}

interface SpawnResponse {
  success: boolean;
  agentId?: string;
  contextBoundary?: string;
  state?: string;
  error?: string;
  timestamp: number;
}

const agentPool = new VirtualAgentPool();
const bnfParser = new BNFParser();

export async function POST(request: Request): Promise<Response> {
  const timestamp = Date.now();
  
  try {
    const body: SpawnRequest = await request.json();
    
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
      agent = agentPool.spawnAgent(body.id, body.retryLimit);
    }

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
