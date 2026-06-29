import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Zone } from './zone.entity';
import { ZonesService } from './zones.service';

@Controller('zones')
export class ZonesController {
  constructor(private readonly service: ZonesService) {}

  @Get()
  findAll(): Promise<Zone[]> {
    return this.service.findAll();
  }
  @Get('by-weapon-model/:weaponModelId')
findByWeaponModel(
  @Param('weaponModelId') weaponModelId: string,
): Promise<Zone[]> {
  return this.service.findByWeaponModel(weaponModelId);
}

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Zone> {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: CreateZoneDto): Promise<Zone> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateZoneDto,
  ): Promise<Zone> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}