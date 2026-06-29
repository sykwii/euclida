import { PartialType } from '@nestjs/mapped-types';
import { CreateShellCompatibleChargeDto } from './create-shell-compatible-charge.dto';

export class UpdateShellCompatibleChargeDto extends PartialType(CreateShellCompatibleChargeDto) {}