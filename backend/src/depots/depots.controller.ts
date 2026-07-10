import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { Depot } from './depot.entity';
import { DepotsService } from './depots.service';
import { CreateDepotDto } from './dto/create-depot.dto';
import { Delete, Patch } from '@nestjs/common';
import { UpdateDepotDto } from './dto/update-depot.dto';

@UseGuards(JwtAuthGuard)
@Controller('depots')
export class DepotsController {
  constructor(private readonly service: DepotsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<Depot[]> {
    return this.service.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<Depot> {
    return this.service.findOne(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(@Body() body: CreateDepotDto, @CurrentUser() user: AuthUser): Promise<Depot> {
    return this.service.create(body, user);
  }
  @UseGuards(WriteAccessGuard)
  @Patch(':id')
update(
  @Param('id') id: string,
  @Body() body: UpdateDepotDto,
  @CurrentUser() user: AuthUser,
): Promise<Depot> {
  return this.service.update(id, body, user);
}

@UseGuards(WriteAccessGuard)
@Delete(':id')
remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
  return this.service.remove(id, user);
}
}
