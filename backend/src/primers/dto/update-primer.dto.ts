import { PartialType } from '@nestjs/mapped-types';
import { CreatePrimerDto } from './create-primer.dto';

export class UpdatePrimerDto extends PartialType(CreatePrimerDto) {}