import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreatePrimerDto } from './dto/create-primer.dto';
import { UpdatePrimerDto } from './dto/update-primer.dto';
import { Primer } from './primer.entity';
import { PrimersService } from './primers.service';

@UseGuards(JwtAuthGuard)
@Controller('primers')
export class PrimersController {
  constructor(private readonly primersService: PrimersService) {}

  @Get()
  findAll(): Promise<Primer[]> {
    return this.primersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Primer> {
    return this.primersService.findOne(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreatePrimerDto): Promise<Primer> {
    return this.primersService.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdatePrimerDto,
  ): Promise<Primer> {
    return this.primersService.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.primersService.remove(id);
  }
}
