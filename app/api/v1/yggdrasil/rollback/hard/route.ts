/**
 * YGGDRASIL P1 API - 硬回滚 (Git集成)
 * POST /api/v1/yggdrasil/rollback/hard
 * 
 * 自测点:
 * - API-001: 200/409/500 状态码正确处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { gitRollbackAdapter } from '@/lib/yggdrasil/git-rollback-adapter';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, commitId } = body;

    // 验证请求
    if (!sessionId || !commitId) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, commitId' },
        { status: 400 }
      );
    }

    console.log(`[API] 硬回滚请求: session=${sessionId}, commit=${commitId}`);

    // 执行硬回滚
    const result = await gitRollbackAdapter.hardRollback(commitId);

    if (!result.success) {
      // 409: 冲突（commit不存在或有未解决冲突）
      if (result.error?.includes('Commit not found')) {
        return NextResponse.json(
          { error: result.error, code: 'COMMIT_NOT_FOUND' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: result.error, code: 'ROLLBACK_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      type: 'hard',
      data: {
        commitId: result.commitId,
        previousCommit: result.previousCommit,
        currentCommit: result.currentCommit,
        tsaSynced: result.tsaSynced,
        durationMs: result.durationMs,
      },
    });

  } catch (error) {
    console.error('[API] Hard rollback error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

// 获取Git提交历史
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const maxCount = parseInt(searchParams.get('maxCount') || '20', 10);

    const history = await gitRollbackAdapter.getCommitHistory(maxCount);

    return NextResponse.json({
      success: true,
      commits: history,
    });

  } catch (error) {
    console.error('[API] Get commit history error:', error);
    return NextResponse.json(
      { error: 'Failed to get commit history' },
      { status: 500 }
    );
  }
}
