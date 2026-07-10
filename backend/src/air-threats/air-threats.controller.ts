import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { AirThreat } from './air-threat.entity';
import { AirThreatsService } from './air-threats.service';
import { CreateAirThreatDto } from './dto/create-air-threat.dto';

@UseGuards(JwtAuthGuard)
@Controller('air-threats')
export class AirThreatsController {
  constructor(private readonly service: AirThreatsService) {}

  @Get()
  findAll(): Promise<AirThreat[]> {
    return this.service.findAll();
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Post()
  create(@Body() body: CreateAirThreatDto): Promise<AirThreat> {
    return this.service.create(body);
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
