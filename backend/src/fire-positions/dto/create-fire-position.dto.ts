import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFirePositionDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  positionType?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsUUID()
  assignedWeaponId?: string;

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
  @IsBoolean()
  hasSg?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readinessStatus?: string;

  @IsOptional()
  @IsString()
  notReadyReason?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedVgzCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  personnelRotationStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  airSituationStatus?: string;

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
  @IsString()
  personnelRotationDate?: string;

  @IsOptional()
  @IsUUID()
  ammoDepotId?: string;
}
