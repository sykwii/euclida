import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { IsEnum } from 'class-validator';
import { UnitType } from '../unit-type.enum';

export class CreateUnitDto {
  @IsString()
  @MaxLength(255)
  name: string;

 @IsEnum(UnitType)
type: UnitType;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}