import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateFirePositionWeaponDto } from './dto/create-fire-position-weapon.dto';
import { FirePositionWeapon } from './fire-position-weapon.entity';
import { FirePositionWeaponsService } from './fire-position-weapons.service';

@UseGuards(JwtAuthGuard, MainScopeGuard)
@Controller('fire-position-weapons')
export class FirePositionWeaponsController {
  constructor(private readonly service: FirePositionWeaponsService) {}

  @Get()
  findAll(): Promise<FirePositionWeapon[]> {
    return this.service.findAll();
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@Body() body: CreateFirePositionWeaponDto): Promise<FirePositionWeapon> {
    return this.service.create(body);
  }
  @Get(':id')
findOne(@Param('id') id: string): Promise<FirePositionWeapon> {
  return this.service.findOne(id);
}

@UseGuards(WriteAccessGuard)
@Delete(':id')
remove(@Param('id') id: string): Promise<void> {
  return this.service.remove(id);
}
}
