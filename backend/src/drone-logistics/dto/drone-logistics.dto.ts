import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateDroneModelDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsIn(['recon', 'combat'])
  droneGroup: 'recon' | 'combat';

  @IsIn(['copter', 'fixed_wing', 'fpv_radio', 'fpv_fiber', 'kamikaze', 'heavy_bomber'])
  droneType: 'copter' | 'fixed_wing' | 'fpv_radio' | 'fpv_fiber' | 'kamikaze' | 'heavy_bomber';

  @IsOptional()
  @IsIn(['none', 'day', 'night', 'thermal', 'day_night'])
  cameraType?: 'none' | 'day' | 'night' | 'thermal' | 'day_night';

 @IsOptional()
@IsInt()
@Min(0)
maxRangeM?: number;

@IsOptional()
@IsInt()
@Min(0)
cruiseSpeedKmh?: number;

@IsOptional()
@IsInt()
@Min(0)
enduranceMinutes?: number;

@IsOptional()
@IsNumber()
@Min(0)
payloadCapacityKg?: number;

@IsOptional()
@IsInt()
@Min(0)
maxAltitudeM?: number;

@IsOptional()
@IsNumber()
@Min(0)
maxWindMs?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CorrectAirAssetDroneStockDto {
  @IsOptional()
  @IsUUID()
  droneModelId?: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CorrectAirAssetWarheadStockDto {
  @IsOptional()
  @IsUUID()
  warheadTypeId?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateDroneWarheadTypeDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsIn(['unit', 'kg'])
  measureUnit?: 'unit' | 'kg';

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddDroneStockDto {
  @IsUUID()
  depotId: string;

  @IsUUID()
  droneModelId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class AddWarheadStockDto {
  @IsUUID()
  depotId: string;

  @IsUUID()
  warheadTypeId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class TransferDroneToAirAssetDto {
  @IsUUID()
  depotId: string;

  @IsUUID()
  airAssetPositionId: string;

  @IsUUID()
  droneModelId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class TransferWarheadToAirAssetDto {
  @IsUUID()
  depotId: string;

  @IsUUID()
  airAssetPositionId: string;

  @IsUUID()
  warheadTypeId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
