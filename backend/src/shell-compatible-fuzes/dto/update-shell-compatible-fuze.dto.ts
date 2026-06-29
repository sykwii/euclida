import { PartialType } from '@nestjs/mapped-types';
import { CreateShellCompatibleFuzeDto } from './create-shell-compatible-fuze.dto';

export class UpdateShellCompatibleFuzeDto extends PartialType(CreateShellCompatibleFuzeDto) {}