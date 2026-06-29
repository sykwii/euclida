import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateServiceOrderDto {
 @IsOptional()
@IsNumber()
targetLat?: number;

@IsString()
orderNumber!: string;

@IsOptional()
@IsNumber()
targetLng?: number;

@IsOptional()
@IsString()
targetMgrs?: string;

  @IsOptional()
  @IsString()
  targetSettlement?: string;

  @IsString()
  taskType!: string;

  @IsOptional()
  @IsUUID()
  plannedResourceAId?: string;

  @IsOptional()
  @IsUUID()
  plannedResourceBId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  plannedQuantity?: number;
}
