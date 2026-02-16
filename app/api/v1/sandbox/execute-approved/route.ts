/**
 * POST /api/v1/sandbox/execute-approved
 * B-04/06 沙盒执行API - 执行已批准的提案
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
    const { executionId, proposalId } = body;

    if (!executionId || !proposalId) {
      return NextResponse.json(
        { success: false, error: 'executionId和proposalId不能为空' },
        { status: 400 }
      );
    }

    // 获取执行记录
    const execution = executor.getExecution(executionId);
    if (!execution) {
      return NextResponse.json(
        { success: false, error: '执行记录不存在' },
        { status: 404 }
      );
    }

    // 检查投票是否通过
    const canExecute = await governanceIntegration.canExecute(proposalId);
    if (!canExecute) {
      return NextResponse.json(
        { success: false, error: '提案未通过投票，无法执行' },
        { status: 403 }
      );
    }

    // 执行代码
    const result = await executor.execute(execution.code, execution.context, proposalId);

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('[Sandbox Execute Approved API] Error:', error);
    const message = error instanceof Error ? error.message : '执行失败';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
