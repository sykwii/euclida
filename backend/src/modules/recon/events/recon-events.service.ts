import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RealtimeEventsService } from '../../../realtime/realtime-events.service';

@Injectable()
export class ReconEventsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async record(eventType: string, entityType: string, entityId: string | null, payload: Record<string, unknown> = {}): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO recon_events (event_type, entity_type, entity_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [eventType, entityType, entityId, JSON.stringify(payload)],
    );

    const action = eventType.includes('created') ? 'created' : eventType.includes('updated') ? 'updated' : 'changed';
    this.realtimeEvents.emitMany(['recon', 'map', 'analytics', 'events'], action, {
      entity: entityType,
      id: entityId || undefined,
      reason: eventType,
    });
  }
}
