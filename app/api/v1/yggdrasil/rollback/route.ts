/**
 * YGGDRASIL API - Rollback 三重回滚
 * PUT  /api/v1/yggdrasil/rollback (创建快照)
 * GET  /api/v1/yggdrasil/rollback?sessionId=xxx (获取快照)
 * POST /api/v1/yggdrasil/rollback (执行回滚)
 */

import { NextRequest, NextResponse } from 'next/server';
import { rollbackService, yggdrasil } from '@/lib/yggdrasil';
import { 
  SoftRollbackRequest, 
  HardRollbackRequest, 
  GovernanceRollbackRequest 
} from '@/lib/yggdrasil/types';

// 创建快照
export async function PUT(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing required field: sessionId' },
        { status: 400 }
      );
    }

    const snapshot = await rollbackService.createSnapshot(sessionId);

    return NextResponse.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        state: snapshot.state,
        timestamp: snapshot.timestamp,
        keyCount: snapshot.transientKeys.length,
      },
    });

  } catch (error) {
    console.error('[API] Create snapshot error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 获取快照列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing required parameter: sessionId' },
        { status: 400 }
      );
    }

    const snapshots = await rollbackService.getSnapshots(sessionId);

    return NextResponse.json({
      success: true,
      snapshots: snapshots.map(s => ({
        id: s.id,
        state: s.state,
        timestamp: s.timestamp,
        keyCount: s.transientKeys.length,
      })),
    });

  } catch (error) {
    console.error('[API] Get snapshots error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 执行回滚（根据type字段分发）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type } = body;

    if (!type || !['soft', 'hard', 'governance'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid or missing rollback type. Must be soft, hard, or governance' },
        { status: 400 }
      );
    }

    let result;

    switch (type) {
      case 'soft': {
        const softRequest: SoftRollbackRequest = {
          sessionId: body.sessionId,
          snapshotId: body.snapshotId,
        };
        result = await yggdrasil.softRollback(softRequest);
        break;
      }
      case 'hard': {
        const hardRequest: HardRollbackRequest = {
          sessionId: body.sessionId,
          commitId: body.commitId,
        };
        result = await yggdrasil.hardRollback(hardRequest);
        break;
      }
      case 'governance': {
        const govRequest: GovernanceRollbackRequest = {
          sessionId: body.sessionId,
          proposalId: body.proposalId,
          targetState: body.targetState,
        };
        result = await yggdrasil.governanceRollback(govRequest);
        break;
      }
    }

    if (!result || !result.success) {
      return NextResponse.json(
        { error: result?.error, data: result?.data },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
      data: result.data,
      durationMs: result.durationMs,
      timestamp: result.timestamp,
    });

  } catch (error) {
    console.error('[API] Rollback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
