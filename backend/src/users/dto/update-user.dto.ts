import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  fullName?: string | null;

  @IsOptional()
  @IsIn(['admin', 'operator', 'observer'])
  role?: 'admin' | 'operator' | 'observer';

  @IsOptional()
  @IsIn(['main', 'division', 'battery', 'ew'])
  scope?: 'main' | 'division' | 'battery' | 'ew';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' &&
    ['', 'null', 'undefined'].includes(value.trim())
      ? null
      : value,
  )
  @IsUUID('all')
  unitId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
