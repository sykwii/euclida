import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class AirAssetTaskPointDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class UpsertAirAssetTaskDto {
  @IsIn(['recon', 'combat'])
  taskType!: 'recon' | 'combat';

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsUUID()
  airAssetPositionId!: string;

  @IsOptional()
  @IsUUID()
  droneModelId?: string;

  @IsOptional()
  @IsUUID()
  warheadTypeId?: string;

  @IsString()
  @MaxLength(255)
  areaName!: string;

  @IsOptional()
  @IsString()
  plannedStartAt?: string;

  @IsOptional()
  @IsString()
  plannedEndAt?: string;

  @IsOptional()
  @IsIn(['planned', 'sent', 'in_progress', 'completed', 'cancelled'])
  status?: 'planned' | 'sent' | 'in_progress' | 'completed' | 'cancelled';

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AirAssetTaskPointDto)
  points!: AirAssetTaskPointDto[];
}
