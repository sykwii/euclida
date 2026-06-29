import { PartialType } from '@nestjs/mapped-types';
import { CreateFuzeDto } from './create-fuze.dto';

export class UpdateFuzeDto extends PartialType(CreateFuzeDto) {}