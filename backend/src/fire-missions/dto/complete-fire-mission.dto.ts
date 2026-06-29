import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CompleteFireMissionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  actualShellQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualChargeQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualPrimerQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualFuzeQuantity?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
