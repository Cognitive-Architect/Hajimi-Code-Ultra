import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { voteService } from '@/lib/core/governance';
import type { AgentRole } from '@/lib/types/state';
import { handleAPIError } from '@/lib/api/error-handler';

const VoteRequestSchema = z.object({
  voter: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike', 'system']),
  choice: z.enum(['approve', 'reject', 'abstain']),
  reason: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    await voteService.init();
    const proposal = voteService.getProposal(params.id);
    
    if (!proposal) {
      return NextResponse.json(
        { error: 'GOV_PROPOSAL_NOT_FOUND', message: 'Proposal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: proposal }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = VoteRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { voter, choice, reason } = validation.data;
    await voteService.init();

    const result = await voteService.vote(params.id, voter as AgentRole, choice, reason);
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}
