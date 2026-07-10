import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class AirReconAreaPointDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class AirReconAreaDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsString()
  activeDate!: string;

  @IsOptional()
  @IsString()
  plannedStartAt?: string;

  @IsOptional()
  @IsString()
  plannedEndAt?: string;

  @IsOptional()
  @IsIn(['planned', 'active', 'completed', 'cancelled'])
  status?: 'planned' | 'active' | 'completed' | 'cancelled';

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AirReconAreaPointDto)
  points!: AirReconAreaPointDto[];
}

export class CreateAirAssetPositionDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsUUID()
  unitId!: string;

  @IsString()
  @MaxLength(100)
  callsign!: string;

  @IsIn(['recon', 'combat'])
  assetGroup!: 'recon' | 'combat';

  @IsOptional()
  @IsIn(['copter', 'fixed_wing'])
  reconType?: 'copter' | 'fixed_wing';

  @IsOptional()
  @IsIn(['fpv_radio', 'fpv_fiber', 'kamikaze', 'heavy_bomber'])
  combatType?: 'fpv_radio' | 'fpv_fiber' | 'kamikaze' | 'heavy_bomber';

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mgrs?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readinessStatus?: string;

  @IsOptional()
  @IsString()
  notReadyReason?: string;

  @IsOptional()
  @IsString()
  personnelRotationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  assetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  droneModel?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  assetQuantity?: number;

  @IsOptional()
  @IsNumber()
  mainDirectionUnits?: number;

  @IsOptional()
  @IsNumber()
  traverseLeftUnits?: number;

  @IsOptional()
  @IsNumber()
  traverseRightUnits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSectorDistanceM?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AirReconAreaDto)
  reconAreas?: AirReconAreaDto[];
}
