/**
 * POST /api/v1/sandbox/assess
 * B-04/06 沙盒风险评估API
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
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: '代码不能为空' },
        { status: 400 }
      );
    }

    // 执行风险评估
    const riskAssessment = executor.assessRisk(code);

    return NextResponse.json({
      success: true,
      data: riskAssessment,
    });
  } catch (error) {
    console.error('[Sandbox Assess API] Error:', error);
    return NextResponse.json(
      { success: false, error: '风险评估失败' },
      { status: 500 }
    );
  }
}
