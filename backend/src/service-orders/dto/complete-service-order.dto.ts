import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteServiceOrderAmmoItemDto {
  @IsUUID()
  shellId!: string;

  @IsUUID()
  chargeId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  chargeModulesPerShot?: number;
}

export class CompleteServiceOrderDto {
  @IsDateString()
  startedAt!: string;

  @IsDateString()
  completedAt!: string;

  @IsInt()
  @Min(1)
  actualQuantity!: number;

  @IsOptional()
  @IsUUID()
  actualShellId?: string;

  @IsOptional()
  @IsUUID()
  actualChargeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  chargeModulesPerShot?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteServiceOrderAmmoItemDto)
  actualAmmoItems?: CompleteServiceOrderAmmoItemDto[];

  @IsString()
  resultType!: string;

  @IsOptional()
  @IsString()
  resultComment?: string;
}
