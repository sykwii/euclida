import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateShellCompatibleChargeDto {
  @IsUUID()
  shellId: string;

  @IsUUID()
  chargeId: string;

  @IsInt()
  @Min(1)
  maxRangeM: number;

  @IsOptional()
  @IsUUID()
  zoneId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usableModules?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  compatibilityNote?: string | null;
}
