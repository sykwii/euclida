import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

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
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ammoDepotId?: string | null;

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
