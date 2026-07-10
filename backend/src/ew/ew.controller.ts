import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateEwPositionDto } from './dto/create-ew-position.dto';
import { UpdateEwPositionDto } from './dto/update-ew-position.dto';
import { EwService } from './ew.service';

@UseGuards(JwtAuthGuard)
@Controller('ew-positions')
export class EwController {
  constructor(private readonly service: EwService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEwPositionDto) {
    return this.service.create(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateEwPositionDto) {
    return this.service.update(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(id, user);
  }
}
