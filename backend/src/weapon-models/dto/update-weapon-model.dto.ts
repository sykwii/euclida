import { PartialType } from '@nestjs/mapped-types';
import { CreateWeaponModelDto } from './create-weapon-model.dto';

export class UpdateWeaponModelDto extends PartialType(CreateWeaponModelDto) {}