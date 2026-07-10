import { PartialType } from '@nestjs/mapped-types';
import { CreateShotConfigurationDto } from './create-shot-configuration.dto';

export class UpdateShotConfigurationDto extends PartialType(CreateShotConfigurationDto) {}
