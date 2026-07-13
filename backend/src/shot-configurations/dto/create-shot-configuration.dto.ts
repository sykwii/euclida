import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ShotConfigurationChargeDto {
  @IsUUID()
  chargeId!: string;

  @IsInt()
  @Min(1)
  quantityPerShot!: number;

  @IsIn(['piece', 'module'])
  accountingUnit!: 'piece' | 'module';

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateShotConfigurationDto {
  @IsString()
  name!: string;

  @IsUUID()
  weaponModelId!: string;

  @IsUUID()
  shellId!: string;

  @IsOptional()
  @IsUUID()
  fuzeId?: string | null;

  @IsOptional()
  @IsUUID()
  primerId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  zoneNumber?: number | null;

  @IsInt()
  @Min(1)
  maxRangeM!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShotConfigurationChargeDto)
  charges!: ShotConfigurationChargeDto[];
}
