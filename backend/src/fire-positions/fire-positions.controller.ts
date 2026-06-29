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
import { CreateFirePositionDto } from './dto/create-fire-position.dto';
import { UpdateFirePositionDto } from './dto/update-fire-position.dto';
import { FirePosition } from './fire-position.entity';
import { FirePositionsService } from './fire-positions.service';

@UseGuards(JwtAuthGuard)
@Controller('fire-positions')
export class FirePositionsController {
  constructor(private readonly service: FirePositionsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @Get('map')
  findAllForMap(@CurrentUser() user: AuthUser) {
    return this.service.findAllForMap(user);
  }

  @Get(':id/card')
  getCard(@Param('id') id: string) {
    return this.service.getCard(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<FirePosition> {
    return this.service.findOne(id);
  }

  @UseGuards(WriteAccessGuard)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateFirePositionDto,
  ): Promise<FirePosition> {
    return this.service.create(body, user);
  }

  @UseGuards(WriteAccessGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateFirePositionDto,
  ): Promise<FirePosition> {
    return this.service.update(id, body, user);
  }

  @Get(':id/sector')
  getSectorInfo(@Param('id') id: string) {
    return this.service.getSectorInfo(id);
  }

  @UseGuards(WriteAccessGuard)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(id, user);
  }
}