import { PartialType } from '@nestjs/mapped-types';
import { CreateAirAssetPositionDto } from './create-air-asset-position.dto';

export class UpdateAirAssetPositionDto extends PartialType(CreateAirAssetPositionDto) {}
