import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PlannedRoutePointDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsBoolean()
  isControl?: boolean;
}

export class PlannedRouteDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlannedRoutePointDto)
  points!: PlannedRoutePointDto[];
}

export class PlannedTripSegmentDto {
  @IsUUID()
  routeId!: string;

  @IsOptional()
  @IsUUID()
  startRoutePointId?: string | null;

  @IsOptional()
  @IsUUID()
  endRoutePointId?: string | null;
}

export class CreatePlannedTripDto {
  @IsUUID()
  routeId!: string;

  @IsString()
  @MinLength(1)
  vehicleLabel!: string;

  @IsOptional()
  @IsString()
  driverLabel?: string | null;

  @IsOptional()
  @IsUUID()
  startRoutePointId?: string | null;

  @IsOptional()
  @IsUUID()
  endRoutePointId?: string | null;

  @IsOptional()
  @IsIn(['fire_position', 'ew_position', 'air_recon'])
  destinationEntityType?: 'fire_position' | 'ew_position' | 'air_recon' | null;

  @IsOptional()
  @IsUUID()
  destinationEntityId?: string | null;

  @IsOptional()
  @IsString()
  destinationName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationLat?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationLng?: number | null;

  @IsOptional()
  @IsString()
  tripPurpose?: string | null;

  @IsOptional()
  @IsString()
  plannedStartAt?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlannedTripSegmentDto)
  segments?: PlannedTripSegmentDto[];
}

export class UpdatePlannedTripDto {
  @IsOptional()
  @IsIn(['planned', 'active', 'completed', 'cancelled', 'archived'])
  status?: string;
}
