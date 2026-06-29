import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateFirePositionWeaponDto } from './dto/create-fire-position-weapon.dto';
import { FirePositionWeapon } from './fire-position-weapon.entity';
import { FirePositionWeaponsService } from './fire-position-weapons.service';

@Controller('fire-position-weapons')
export class FirePositionWeaponsController {
  constructor(private readonly service: FirePositionWeaponsService) {}

  @Get()
  findAll(): Promise<FirePositionWeapon[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateFirePositionWeaponDto): Promise<FirePositionWeapon> {
    return this.service.create(body);
  }
  @Get(':id')
findOne(@Param('id') id: string): Promise<FirePositionWeapon> {
  return this.service.findOne(id);
}

@Delete(':id')
remove(@Param('id') id: string): Promise<void> {
  return this.service.remove(id);
}
}