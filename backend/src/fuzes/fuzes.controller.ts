import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateFuzeDto } from './dto/create-fuze.dto';
import { UpdateFuzeDto } from './dto/update-fuze.dto';
import { Fuze } from './fuze.entity';
import { FuzesService } from './fuzes.service';

@Controller('fuzes')
export class FuzesController {
  constructor(private readonly fuzesService: FuzesService) {}

  @Get()
  findAll(): Promise<Fuze[]> {
    return this.fuzesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Fuze> {
    return this.fuzesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateFuzeDto): Promise<Fuze> {
    return this.fuzesService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateFuzeDto,
  ): Promise<Fuze> {
    return this.fuzesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.fuzesService.remove(id);
  }
}