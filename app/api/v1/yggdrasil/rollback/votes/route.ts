/**
 * YGGDRASIL P1 API - 治理投票查询
 * GET /api/v1/yggdrasil/rollback/votes?proposalId=xxx
 * 
 * 自测点:
 * - API-002: 返回提案详情和投票状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { governanceRollbackService } from '@/lib/yggdrasil/governance-rollback-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const proposalId = searchParams.get('proposalId');

    if (!proposalId) {
      return NextResponse.json(
        { error: 'Missing proposalId parameter' },
        { status: 400 }
      );
    }

    await governanceRollbackService.init();

    const status = await governanceRollbackService.getProposalStatus(proposalId);

    if (!status.exists) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      proposal: status.proposal,
      voteResult: status.voteResult,
    });

  } catch (error) {
    console.error('[API] Get vote status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 创建治理回滚提案
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, targetState, requester } = body;

    if (!sessionId || !targetState || !requester) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await governanceRollbackService.init();

    const result = await governanceRollbackService.createRollbackProposal(
      { sessionId, targetState, proposalId: '' },
      requester
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      proposalId: result.proposalId,
    }, { status: 201 });

  } catch (error) {
    console.error('[API] Create rollback proposal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
