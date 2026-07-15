import { EntityManager } from 'typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { AirThreat } from './air-threat.entity';
import { AirThreatsService } from './air-threats.service';

type RecalculateApi = {
  recalculateFirePositionsReadiness(manager: EntityManager): Promise<void>;
};

describe('AirThreatsService canonical readiness transition', () => {
  it('marks an assigned weapon air-threat not ready once and never auto-restores it', async () => {
    const threat = { id: 'threat-1', lat: 50, lng: 30, isActive: true } as AirThreat;
    const position = {
      id: 'fp-1',
      lat: 50,
      lng: 30,
      readinessStatus: 'combat_ready',
      notReadyReason: null,
    } as FirePosition;
    const weapon = {
      id: 'weapon-1',
      currentFirePositionId: 'fp-1',
      readinessStatus: 'combat_ready',
      notReadyReason: null,
    } as WeaponSystem;
    let threats = [threat];
    const save = jest.fn(async (_entity: unknown, value: unknown) => value);
    const manager = {
      find: jest.fn(async (entity: unknown) => {
        if (entity === AirThreat) return threats;
        if (entity === FirePosition) return [position];
        if (entity === WeaponSystem) return [weapon];
        return [];
      }),
      save,
    } as unknown as EntityManager;
    const service = new AirThreatsService(
      {} as never,
      {} as never,
      {} as never,
      { getAirThreatRadius: jest.fn(async () => ({ radiusM: 1000 })) } as never,
      { emitMany: jest.fn() } as never,
    ) as unknown as RecalculateApi;

    await service.recalculateFirePositionsReadiness(manager);

    expect(weapon.readinessStatus).toBe('not_combat_ready');
    expect(weapon.notReadyReason).toBe('air_threat');
    expect(position.notReadyReason).toBe('threat');
    expect(save).toHaveBeenCalledWith(WeaponSystem, [weapon]);

    save.mockClear();
    await service.recalculateFirePositionsReadiness(manager);
    expect(save).not.toHaveBeenCalled();

    threats = [];
    await service.recalculateFirePositionsReadiness(manager);
    expect(position.notReadyReason).toBeNull();
    expect(weapon.readinessStatus).toBe('not_combat_ready');
    expect(weapon.notReadyReason).toBe('air_threat');
    expect(save).not.toHaveBeenCalledWith(WeaponSystem, expect.anything());
  });
});
