import { Injectable, NotFoundException } from '@nestjs/common';
import { PuarProposalService } from './puar-proposal.service';

@Injectable()
export class ReconCoreIntegrationService {
  constructor(private readonly puar: PuarProposalService) {}

  describeContract(): string {
    return 'Recon owns its tables. Core integrations must consume this service contract, not Recon tables directly.';
  }

  async getPuarProposalForCore(id: string): Promise<{
    id: string;
    targetId: string | null;
    observationId: string | null;
    payload: Record<string, unknown>;
    comments?: string | null;
  }> {
    const proposal = await this.puar.findOne(id);
    if (!proposal) throw new NotFoundException('Пропозицію ПУАР не знайдено');
    return {
      id: String(proposal['id']),
      targetId: (proposal['targetId'] as string | null) || null,
      observationId: (proposal['observationId'] as string | null) || null,
      payload: (proposal['payload'] as Record<string, unknown>) || {},
      comments: (proposal['comments'] as string | null) || null,
    };
  }

  markPuarAccepted(id: string, serviceOrderId: string): Promise<void> {
    return this.puar.markAccepted(id, serviceOrderId);
  }
}
