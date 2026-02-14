import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { voteService } from '@/lib/core/governance';
import type { AgentRole } from '@/lib/types/state';
import { handleAPIError } from '@/lib/api/error-handler';

const VoteRequestSchema = z.object({
  proposalId: z.string(),
  voter: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike', 'system']),
  choice: z.enum(['approve', 'reject', 'abstain']),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = VoteRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { proposalId, voter, choice, reason } = validation.data;
    await voteService.init();

    const result = await voteService.vote(proposalId, voter as AgentRole, choice, reason);
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const proposalId = searchParams.get('proposalId');
    
    if (!proposalId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'proposalId is required' },
        { status: 400 }
      );
    }

    await voteService.init();
    const stats = await voteService.getVoteStats(proposalId);
    return NextResponse.json({ success: true, data: stats }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
