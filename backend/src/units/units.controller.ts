import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Unit } from './unit.entity';
import { UnitsService } from './units.service';

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

  @Post()
  create(@Body() body: CreateUnitDto): Promise<Unit> {
    return this.unitsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUnitDto): Promise<Unit> {
    return this.unitsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.unitsService.remove(id);
  }

  @Delete(':id/with-related')
  removeWithRelated(@Param('id') id: string): Promise<void> {
    return this.unitsService.removeWithRelated(id);
  }
  @Get(':id/children')
  findChildren(@Param('id') id: string): Promise<Unit[]> {
    return this.unitsService.findChildren(id);
  }
}
