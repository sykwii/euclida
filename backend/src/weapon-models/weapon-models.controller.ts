import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateWeaponModelDto } from './dto/create-weapon-model.dto';
import { UpdateWeaponModelDto } from './dto/update-weapon-model.dto';
import { WeaponModel } from './weapon-model.entity';
import { WeaponModelsService } from './weapon-models.service';

@UseGuards(JwtAuthGuard)
@Controller('weapon-models')
export class WeaponModelsController {
  constructor(private readonly weaponModelsService: WeaponModelsService) {}

  @Get()
  findAll(): Promise<WeaponModel[]> {
    return this.weaponModelsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<WeaponModel> {
    return this.weaponModelsService.findOne(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateWeaponModelDto): Promise<WeaponModel> {
    return this.weaponModelsService.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateWeaponModelDto,
  ): Promise<WeaponModel> {
    return this.weaponModelsService.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.weaponModelsService.remove(id);
  }
}
