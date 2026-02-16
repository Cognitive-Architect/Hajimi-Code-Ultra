/**
 * YGGDRASIL API - Branching 分支管理
 * GET /api/v1/yggdrasil/branches?sessionId=xxx
 * POST /api/v1/yggdrasil/branches (创建分支)
 */

import { NextRequest, NextResponse } from 'next/server';
import { branchingService } from '@/lib/yggdrasil';
import { CreateBranchRequest } from '@/lib/yggdrasil/types';

// GET: 获取分支列表
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

    const branches = await branchingService.getBranches(sessionId);
    const tree = await branchingService.getBranchTree(sessionId);

    return NextResponse.json({
      success: true,
      branches,
      tree,
      metrics: branchingService.getMetrics(),
    });

  } catch (error) {
    console.error('[API] Get branches error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: 创建分支
export async function POST(request: NextRequest) {
  try {
    const body: CreateBranchRequest = await request.json();

    // 验证请求
    if (!body.sessionId || !body.name || !body.agentId) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, name, agentId' },
        { status: 400 }
      );
    }

    const result = await branchingService.createBranch(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      branch: result.branch,
    }, { status: 201 });

  } catch (error) {
    console.error('[API] Create branch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
