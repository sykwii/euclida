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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { CreateShotConfigurationDto } from './dto/create-shot-configuration.dto';
import { UpdateShotConfigurationDto } from './dto/update-shot-configuration.dto';
import { ShotConfiguration } from './shot-configuration.entity';
import { ShotConfigurationsService } from './shot-configurations.service';

@UseGuards(JwtAuthGuard)
@Controller('shot-configurations')
export class ShotConfigurationsController {
  constructor(private readonly service: ShotConfigurationsService) {}

  @Get()
  findAll(): Promise<ShotConfiguration[]> {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ShotConfiguration> {
    return this.service.findOne(id);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateShotConfigurationDto): Promise<ShotConfiguration> {
    return this.service.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateShotConfigurationDto,
  ): Promise<ShotConfiguration> {
    return this.service.update(id, body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post(':id/activate')
  activate(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ): Promise<ShotConfiguration> {
    return this.service.activate(id, Boolean(body?.isActive));
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
