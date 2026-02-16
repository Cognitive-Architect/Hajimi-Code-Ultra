/**
 * POST /api/v1/sandbox/propose
 * B-04/06 沙盒执行提案API
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, context, proposer = 'pm' } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: '代码不能为空' },
        { status: 400 }
      );
    }

    // 提交执行提案
    const proposal = await executor.proposeExecution(code, context, proposer);

    return NextResponse.json({
      success: true,
      data: proposal,
    });
  } catch (error) {
    console.error('[Sandbox Propose API] Error:', error);
    const message = error instanceof Error ? error.message : '提案提交失败';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
