export type RealtimeScope =
  | 'all'
  | 'missions'
  | 'stock'
  | 'map'
  | 'analytics'
  | 'events'
  | 'reference'
  | 'users'
  | 'settings'
  | 'weapons'
  | 'recon'
  | 'threats'
  | 'logistics';

export type RealtimeAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'started'
  | 'completed'
  | 'moved'
  | 'synced'
  | 'changed';

export interface RealtimeEventPayload {
  version: 1;
  scope: RealtimeScope;
  action: RealtimeAction;
  entity?: string;
  id?: string;
  unitId?: string;
  reason?: string;
  at: string;
}
