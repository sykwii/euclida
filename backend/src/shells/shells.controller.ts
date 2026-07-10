import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateShellDto } from './dto/create-shell.dto';
import { UpdateShellDto } from './dto/update-shell.dto';
import { Shell } from './shell.entity';
import { ShellsService } from './shells.service';

@UseGuards(JwtAuthGuard)
@Controller('shells')
export class ShellsController {
  constructor(private readonly shellsService: ShellsService) {}

  @Get()
  findAll(): Promise<Shell[]> {
    return this.shellsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Shell> {
    return this.shellsService.findOne(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateShellDto): Promise<Shell> {
    return this.shellsService.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateShellDto,
  ): Promise<Shell> {
    return this.shellsService.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.shellsService.remove(id);
  }
}
