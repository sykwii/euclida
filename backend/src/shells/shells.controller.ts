import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateShellDto } from './dto/create-shell.dto';
import { UpdateShellDto } from './dto/update-shell.dto';
import { Shell } from './shell.entity';
import { ShellsService } from './shells.service';

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

  @Post()
  create(@Body() body: CreateShellDto): Promise<Shell> {
    return this.shellsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateShellDto,
  ): Promise<Shell> {
    return this.shellsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.shellsService.remove(id);
  }
}