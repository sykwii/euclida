import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { SettingsService } from '../settings/settings.service';
import { AirThreat } from './air-threat.entity';
import { CreateAirThreatDto } from './dto/create-air-threat.dto';
import { EntityManager } from 'typeorm';

@Injectable()
export class AirThreatsService {
  constructor(
    @InjectRepository(AirThreat)
    private readonly repository: Repository<AirThreat>,

    @InjectRepository(FirePosition)
    private readonly firePositionsRepository: Repository<FirePosition>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly settingsService: SettingsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<AirThreat[]> {
    return this.repository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  countActive(): Promise<number> {
    return this.repository.count({
      where: {
        isActive: true,
      },
    });
  }

  async create(data: CreateAirThreatDto): Promise<AirThreat> {
    return this.dataSource.transaction(async (manager) => {
      const threat = manager.create(AirThreat, data);
      const savedThreat = await manager.save(AirThreat, threat);

      await this.recalculateFirePositionsReadiness(manager);

      this.emitThreatChanged('created', savedThreat.id);

      return savedThreat;
    });
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const threat = await manager.findOne(AirThreat, {
        where: { id },
      });

      if (!threat) {
        throw new NotFoundException('Мітку загрози не знайдено');
      }

      threat.isActive = false;
      threat.removedAt = new Date();

      await manager.save(AirThreat, threat);
      await this.recalculateFirePositionsReadiness(manager);
      this.emitThreatChanged('deleted', id);
    });
  }

  private async recalculateFirePositionsReadiness(
    manager: EntityManager,
  ): Promise<void> {
    const { radiusM } = await this.settingsService.getAirThreatRadius();

    const threats: AirThreat[] = await manager.find(AirThreat, {
      where: {
        isActive: true,
      },
    });

    const positions: FirePosition[] = await manager.find(FirePosition);

    const changedPositions: FirePosition[] = [];

    for (const position of positions) {
      const nearestThreat = threats.find((threat) => {
        const distanceM = this.calculateDistanceM(
          position.lat,
          position.lng,
          threat.lat,
          threat.lng,
        );

        return distanceM <= radiusM;
      });

      if (nearestThreat) {
        const nextReason = `Повітряна загроза: ${nearestThreat.threatType}`;

        if (
          position.readinessStatus !== 'not_ready' ||
          position.notReadyReason !== nextReason
        ) {
          position.readinessStatus = 'not_ready';
          position.notReadyReason = nextReason;
          changedPositions.push(position);
        }
      } else if (position.notReadyReason?.startsWith('Повітряна загроза:')) {
        position.readinessStatus = 'ready';
        position.notReadyReason = null;
        changedPositions.push(position);
      }
    }

    if (changedPositions.length > 0) {
      await manager.save(FirePosition, changedPositions);
    }
  }

  private emitThreatChanged(
    action: 'created' | 'deleted' | 'updated',
    id: string,
  ): void {
    this.realtimeEvents.emitMany(
      ['threats', 'map', 'analytics', 'events'],
      action,
      {
        entity: 'air_threat',
        id,
      },
    );
  }

  private calculateDistanceM(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const earthRadiusM = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusM * c;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}
