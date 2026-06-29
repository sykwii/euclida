import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateAirThreatRadiusDto } from './dto/update-air-threat-radius.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('air-threat-radius')
  getAirThreatRadius(): Promise<{ radiusM: number }> {
    return this.service.getAirThreatRadius();
  }

  @Patch('air-threat-radius')
  updateAirThreatRadius(
    @Body() body: UpdateAirThreatRadiusDto,
  ): Promise<{ radiusM: number }> {
    return this.service.updateAirThreatRadius(body.radiusM);
  }
}