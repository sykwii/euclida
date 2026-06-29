import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateChargeDto {
  @IsString()
  @MaxLength(100)
  marking: string;

  @IsString()
  @MaxLength(50)
  packagingType: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  measurementUnit?: string;

  @IsOptional()
  @IsIn(['unit', 'modular'])
  chargeKind?: 'unit' | 'modular';

  @ValidateIf((data: CreateChargeDto) => data.chargeKind === 'modular')
  @IsInt()
  @Min(1)
  @Max(20)
  modulesPerCharge?: number;

  @ValidateIf((data: CreateChargeDto) => data.chargeKind === 'modular')
  @IsInt()
  @Min(1)
  @Max(20)
  maxUsableModules?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  moduleNote?: string;
}
