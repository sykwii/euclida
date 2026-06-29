import { PartialType } from '@nestjs/mapped-types';
import { CreateWeaponSystemDto } from './create-weapon-system.dto';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateWeaponSystemDto extends PartialType(CreateWeaponSystemDto) {
    @IsOptional()
@ValidateIf((_, value) => value !== null)
@IsUUID()
firePositionId?: string | null;
}