import { PartialType } from '@nestjs/mapped-types';
import { CreateShellDto } from './create-shell.dto';

export class UpdateShellDto extends PartialType(CreateShellDto) {}