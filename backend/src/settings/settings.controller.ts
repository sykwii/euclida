import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MainScopeGuard } from '../auth/main-scope.guard';
import { WriteAccessGuard } from '../auth/write-access.guard';
import { UpdateAirThreatRadiusDto } from './dto/update-air-threat-radius.dto';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get('air-threat-radius')
  getAirThreatRadius(): Promise<{ radiusM: number }> {
    return this.service.getAirThreatRadius();
  }

  @UseGuards(WriteAccessGuard, MainScopeGuard)
  @Patch('air-threat-radius')
  updateAirThreatRadius(
    @Body() body: UpdateAirThreatRadiusDto,
  ): Promise<{ radiusM: number }> {
    return this.service.updateAirThreatRadius(body.radiusM);
  }
}
