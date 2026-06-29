import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AppSetting } from './app-setting.entity';

@Injectable()
export class SettingsService {
  private readonly airThreatRadiusKey = 'air_threat_radius_m';

  constructor(
    @InjectRepository(AppSetting)
    private readonly repository: Repository<AppSetting>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async getAirThreatRadius(): Promise<{ radiusM: number }> {
    const setting = await this.repository.findOne({
      where: { key: this.airThreatRadiusKey },
    });

    if (!setting) {
      throw new NotFoundException('Налаштування радіуса загрози не знайдено');
    }

    return {
      radiusM: Number(setting.value),
    };
  }

  async updateAirThreatRadius(radiusM: number): Promise<{ radiusM: number }> {
    await this.repository.save({
      key: this.airThreatRadiusKey,
      value: String(radiusM),
    });

    this.realtimeEvents.emitMany(['settings', 'map', 'analytics', 'events'], 'updated', {
      entity: 'settings',
      id: this.airThreatRadiusKey,
    });

    return {
      radiusM,
    };
  }
}