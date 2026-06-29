import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AirThreat } from './air-threat.entity';
import { AirThreatsService } from './air-threats.service';
import { CreateAirThreatDto } from './dto/create-air-threat.dto';

@Controller('air-threats')
export class AirThreatsController {
  constructor(private readonly service: AirThreatsService) {}

  @Get()
  findAll(): Promise<AirThreat[]> {
    return this.service.findAll();
  }

  @Post()
  create(@Body() body: CreateAirThreatDto): Promise<AirThreat> {
    return this.service.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}