import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { proposalService } from '@/lib/core/governance';
import type { AgentRole } from '@/lib/types/state';
import { handleAPIError } from '@/lib/api/error-handler';

const CreateProposalSchema = z.object({
  proposer: z.enum(['pm', 'arch', 'qa', 'engineer', 'mike', 'system']),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  targetState: z.enum(['IDLE', 'DESIGN', 'CODE', 'AUDIT', 'BUILD', 'DEPLOY', 'DONE']),
  type: z.enum(['state_transition', 'config_change', 'rule_change', 'custom']).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const proposer = searchParams.get('proposer') as AgentRole | null;
    
    await proposalService.init();
    
    const filter = {
      status: status ? status.split(',') as ('pending' | 'voting' | 'approved' | 'rejected' | 'expired' | 'executed')[] : undefined,
      proposer: proposer || undefined,
    };
    
    const response = await proposalService.getProposals(filter);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = CreateProposalSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', details: validation.error.errors },
        { status: 400 }
      );
    }

    await proposalService.init();
    const proposal = await proposalService.createProposal(validation.data);
    
    return NextResponse.json({ success: true, data: proposal }, { status: 201 });
  } catch (error) {
    return handleAPIError(error);
  }
}
