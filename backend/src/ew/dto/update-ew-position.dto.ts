import { PartialType } from '@nestjs/mapped-types';
import { CreateEwPositionDto } from './create-ew-position.dto';

export class UpdateEwPositionDto extends PartialType(CreateEwPositionDto) {}
