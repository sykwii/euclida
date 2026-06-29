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
  @IsString()
  @MaxLength(100)
  readinessStatus?: string;

  @IsOptional()
  @IsString()
  notReadyReason?: string;

  @IsOptional()
@IsIn(['reserve', 'fire_position'])
locationType?: string;

@IsOptional()
@IsUUID()
firePositionId?: string | null;
}