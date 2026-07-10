import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateFuzeDto } from './dto/create-fuze.dto';
import { UpdateFuzeDto } from './dto/update-fuze.dto';
import { Fuze } from './fuze.entity';
import { FuzesService } from './fuzes.service';

@UseGuards(JwtAuthGuard)
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

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateFuzeDto): Promise<Fuze> {
    return this.fuzesService.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateFuzeDto,
  ): Promise<Fuze> {
    return this.fuzesService.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.fuzesService.remove(id);
  }
}
