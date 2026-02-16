/**
 * GET /api/v1/sandbox/execution/:id
 * B-04/06 获取执行状态API
 */

import { NextRequest, NextResponse } from 'next/server';
import { SandboxExecutor, MemoryAuditLogger, WebWorkerJailor } from '@/lib/sandbox/executor';
import { proposalService, voteService } from '@/lib/core/governance';
import { SevenPowersGovernanceIntegration } from '@/lib/sandbox/governance-integration';

// 初始化治理集成
const governanceIntegration = new SevenPowersGovernanceIntegration(
  proposalService,
  voteService
);

// 初始化执行器
const auditLogger = new MemoryAuditLogger();
const jailor = new WebWorkerJailor();
const executor = new SandboxExecutor(governanceIntegration, jailor, auditLogger);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const execution = executor.getExecution(id);
    if (!execution) {
      return NextResponse.json(
        { success: false, error: '执行记录不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('[Sandbox Execution API] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取执行状态失败' },
      { status: 500 }
    );
  }
}
