import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateWeaponSystemDto } from './dto/create-weapon-system.dto';
import { UpdateWeaponSystemDto } from './dto/update-weapon-system.dto';
import { AssignWeaponToFirePositionDto } from './dto/assign-weapon-to-fire-position.dto';
import { WeaponSystem } from './weapon-system.entity';
import { WeaponSystemsService } from './weapon-systems.service';

@UseGuards(JwtAuthGuard)
@Controller('weapon-systems')
export class WeaponSystemsController {
  constructor(private readonly service: WeaponSystemsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<WeaponSystem[]> {
    return this.service.findAll(user);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<WeaponSystem> {
    return this.service.findOne(id, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWeaponSystemDto,
  ): Promise<WeaponSystem> {
    return this.service.create(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateWeaponSystemDto,
  ): Promise<WeaponSystem> {
    return this.service.update(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(id, user);
  }


  @UseGuards(WriteAccessGuard)
  @Post(':id/assign-to-fire-position')
  assignToFirePosition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AssignWeaponToFirePositionDto,
  ): Promise<WeaponSystem> {
    return this.service.assignToFirePosition(id, body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Post('sync-fire-position-states')
  syncFirePositionStates(
    @CurrentUser() user: AuthUser,
  ): Promise<{ updated: number }> {
    return this.service.syncAllFirePositionStates(user);
  }

@UseGuards(WriteAccessGuard)
@Post(':id/move-to-reserve')
moveToReserve(
  @CurrentUser() user: AuthUser,
  @Param('id') id: string,
): Promise<WeaponSystem> {
  return this.service.moveToReserve(id, user);
}

}