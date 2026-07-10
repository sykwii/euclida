import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateShellCompatibleFuzeDto } from './dto/create-shell-compatible-fuze.dto';
import { UpdateShellCompatibleFuzeDto } from './dto/update-shell-compatible-fuze.dto';
import { ShellCompatibleFuze } from './shell-compatible-fuze.entity';
import { ShellCompatibleFuzesService } from './shell-compatible-fuzes.service';

@UseGuards(JwtAuthGuard)
@Controller('shell-compatible-fuzes')
export class ShellCompatibleFuzesController {
  constructor(private readonly service: ShellCompatibleFuzesService) {}

  @Get()
  findAll(): Promise<ShellCompatibleFuze[]> {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ShellCompatibleFuze> {
    return this.service.findOne(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateShellCompatibleFuzeDto): Promise<ShellCompatibleFuze> {
    return this.service.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateShellCompatibleFuzeDto,
  ): Promise<ShellCompatibleFuze> {
    return this.service.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
