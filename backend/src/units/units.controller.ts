import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Unit } from './unit.entity';
import { UnitsService } from './units.service';

@UseGuards(JwtAuthGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  findAll(): Promise<Unit[]> {
    return this.unitsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Unit> {
    return this.unitsService.findOne(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateUnitDto): Promise<Unit> {
    return this.unitsService.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUnitDto): Promise<Unit> {
    return this.unitsService.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.unitsService.remove(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id/with-related')
  removeWithRelated(@Param('id') id: string): Promise<void> {
    return this.unitsService.removeWithRelated(id);
  }
  @Get(':id/children')
  findChildren(@Param('id') id: string): Promise<Unit[]> {
    return this.unitsService.findChildren(id);
  }
}
