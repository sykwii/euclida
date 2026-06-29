import { PartialType } from '@nestjs/mapped-types';
import { CreateFirePositionDto } from './create-fire-position.dto';

export class UpdateFirePositionDto extends PartialType(CreateFirePositionDto) {}