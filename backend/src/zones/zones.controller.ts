import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Zone } from './zone.entity';
import { ZonesService } from './zones.service';

@UseGuards(JwtAuthGuard)
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

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateZoneDto): Promise<Zone> {
    return this.service.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateZoneDto,
  ): Promise<Zone> {
    return this.service.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
