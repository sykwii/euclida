import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWeaponSystemDto {
  @IsUUID()
  weaponModelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  callsign?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsIn(['combat_ready', 'not_combat_ready', 'ready', 'not_ready', 'repair', 'unknown'])
  readinessStatus?: string;

  @IsOptional()
  @IsIn(['breakdown', 'maintenance', 'air_threat', 'crew', 'other'])
  notReadyReason?: string;

  @IsOptional()
  @IsIn([
    'reserve_area',
    'moving_to_fire_position',
    'at_fire_position',
    'moving_to_reserve_area',
    'reserve',
    'fire_position',
  ])
  deploymentStatus?: string;

  @IsOptional()
  @IsIn(['reserve', 'fire_position'])
  locationType?: string;

  @IsOptional()
  @IsUUID()
  currentFirePositionId?: string | null;

  @IsOptional()
  @IsUUID()
  firePositionId?: string | null;
}
