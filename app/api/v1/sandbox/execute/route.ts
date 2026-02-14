/**
 * POST /api/v1/sandbox/execute
 * B-04/06 沙盒执行API - 直接执行（低风险）
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
    const { code, context } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: '代码不能为空' },
        { status: 400 }
      );
    }

    // 先进行风险评估
    const riskAssessment = executor.assessRisk(code);
    
    // 高风险代码需要治理审批
    if (riskAssessment.requiresGovernance) {
      return NextResponse.json(
        { 
          success: false, 
          error: '高风险代码需要治理审批',
          code: 'GOVERNANCE_REQUIRED',
          riskAssessment,
        },
        { status: 403 }
      );
    }

    // 低风险直接执行
    const result = await executor.execute(code, context);

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('[Sandbox Execute API] Error:', error);
    const message = error instanceof Error ? error.message : '执行失败';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
