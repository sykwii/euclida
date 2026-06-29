import { IsIn, IsOptional, IsString } from 'class-validator';

export const FIRE_MISSION_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
] as const;

export type FireMissionStatus = typeof FIRE_MISSION_STATUSES[number];

export class UpdateFireMissionStatusDto {
  @IsIn(FIRE_MISSION_STATUSES)
  status!: FireMissionStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
