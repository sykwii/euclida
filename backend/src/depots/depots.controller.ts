import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.types';
import { Depot } from './depot.entity';
import { DepotsService } from './depots.service';
import { CreateDepotDto } from './dto/create-depot.dto';
import { Delete, Patch } from '@nestjs/common';
import { UpdateDepotDto } from './dto/update-depot.dto';

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

  @Post()
  create(@Body() body: CreateDepotDto, @CurrentUser() user: AuthUser): Promise<Depot> {
    return this.service.create(body, user);
  }
  @Patch(':id')
update(
  @Param('id') id: string,
  @Body() body: UpdateDepotDto,
  @CurrentUser() user: AuthUser,
): Promise<Depot> {
  return this.service.update(id, body, user);
}

@Delete(':id')
remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
  return this.service.remove(id, user);
}
}
