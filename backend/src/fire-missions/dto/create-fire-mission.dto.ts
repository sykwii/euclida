import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateFireMissionDto {
  // Поле лишено пользовательского смысла: батарея выполнения определяется сервером по выбранной ВП.
  @IsOptional()
  @IsUUID()
  executingUnitId?: string;

  @IsOptional()
  @IsUUID()
  firePositionId?: string | null;

  
  @IsOptional()
  @IsUUID()
  weaponSystemId?: string;

  @IsDateString()
  missionDatetime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetType?: string;

  @IsOptional()
  @IsNumber()
  targetLat?: number;

  @IsOptional()
  @IsNumber()
  targetLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetMgrs?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetSettlement?: string;

  @IsOptional()
  @IsUUID()
  shellId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  shellQuantity?: number;

  @IsOptional()
  @IsUUID()
  chargeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  chargeQuantity?: number;

  @IsOptional()
  @IsUUID()
  primerId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  primerQuantity?: number;

  @IsOptional()
  @IsUUID()
  fuzeId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fuzeQuantity?: number;

  @IsOptional()
  @IsIn(['draft', 'sent'])
  status?: 'draft' | 'sent';
}
