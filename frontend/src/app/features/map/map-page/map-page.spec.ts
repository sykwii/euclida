import { MapPage } from './map-page';
import { FirePosition } from '../../fire-positions/fire-position.model';

describe('MapPage fire-position readiness', () => {
  let component: MapPage;

  beforeEach(() => {
    component = new MapPage(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('renders canonical combat-ready status as ready', () => {
    expect(component.getReadinessLabel('combat_ready')).toBe('Боєготова');
    expect(
      (
        component as unknown as {
          getReadinessColor(status: string): string;
        }
      ).getReadinessColor('combat_ready'),
    ).toBe('#00ff88');
  });

  it('renders canonical non-combat-ready status as not ready', () => {
    expect(component.getReadinessLabel('not_combat_ready')).toBe('Не боєготова');
    expect(
      (
        component as unknown as {
          getReadinessColor(status: string): string;
        }
      ).getReadinessColor('not_combat_ready'),
    ).toBe('#ff4040');
  });

  it.each([
    ['ready', '#00ff88'],
    ['danger', '#ff4040'],
    ['warning', '#ffd400'],
    ['unknown', '#6b7280'],
  ] as const)('maps canonical display state %s to the FP color', (displayState, color) => {
    const position = createPosition(displayState);

    expect(
      (
        component as unknown as {
          getFirePositionReadinessColor(position: FirePosition): string;
        }
      ).getFirePositionReadinessColor(position),
    ).toBe(color);
  });

  it('uses canonical ready state even when legacy readiness is stale', () => {
    const position = createPosition('ready', 'not_combat_ready');

    expect(
      (
        component as unknown as {
          getFirePositionReadinessColor(position: FirePosition): string;
        }
      ).getFirePositionReadinessColor(position),
    ).toBe('#00ff88');
    expect(component.getFirePositionReadinessClass(position)).toBe('ready');
    expect(component.getFirePositionReadinessLabel(position)).toBe('Боєготова');
  });

  it('calculates a 39 degree sector and handles zero crossing', () => {
    const map = component as unknown as {
      getSectorSpanDegrees(left: number, right: number): number;
    };

    expect(map.getSectorSpanDegrees(102, 141)).toBe(39);
    expect(map.getSectorSpanDegrees(348, 27)).toBe(39);
  });

  it('replaces the previous FP sector layer instead of duplicating it', () => {
    const parent = {
      removeLayer: vi.fn(),
      clearLayers: vi.fn(),
    };
    const groups = [createLayerGroup(), createLayerGroup()];
    const map = component as unknown as {
      L: {
        layerGroup(): ReturnType<typeof createLayerGroup>;
        polygon(): { addTo(group: unknown): unknown };
        polyline(): { addTo(group: unknown): unknown };
      };
      sectorsLayer: typeof parent;
      addSector(position: FirePosition): void;
      firePositionSectorLayers: Map<string, unknown>;
    };
    map.sectorsLayer = parent;
    map.L = {
      layerGroup: vi.fn(() => groups.shift()!),
      polygon: vi.fn(() => ({ addTo: vi.fn() })),
      polyline: vi.fn(() => ({ addTo: vi.fn() })),
    };
    const position = createPosition('ready');

    map.addSector(position);
    const firstGroup = map.firePositionSectorLayers.get(position.id);
    map.addSector(position);

    expect(parent.removeLayer).toHaveBeenCalledOnce();
    expect(parent.removeLayer).toHaveBeenCalledWith(firstGroup);
    expect(map.firePositionSectorLayers.size).toBe(1);
  });

  it('coalesces duplicate realtime refreshes for the same FP', () => {
    vi.useFakeTimers();
    const map = component as unknown as {
      scheduleFirePositionRefresh(id: string): void;
      refreshFirePosition(id: string): void;
    };
    const refresh = vi.spyOn(map, 'refreshFirePosition').mockImplementation(() => undefined);

    map.scheduleFirePositionRefresh('fp-1');
    map.scheduleFirePositionRefresh('fp-1');
    vi.advanceTimersByTime(40);

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith('fp-1');
    vi.useRealTimers();
  });
});

function createLayerGroup() {
  return {
    addTo: vi.fn(),
  };
}

function createPosition(
  displayState: FirePosition['operationalState']['displayState'],
  readinessStatus = displayState === 'ready' ? 'combat_ready' : 'not_combat_ready',
): FirePosition {
  return {
    id: 'fp-1',
    name: 'Дрейк',
    unitId: 'unit-1',
    ammoDepotId: 'depot-1',
    personnelRotationDate: null,
    lat: 49,
    lng: 36,
    mgrs: null,
    hasSg: displayState !== 'unknown',
    readinessStatus,
    notReadyReason: displayState === 'danger' ? 'СГ НЕ БГ' : null,
    operationalState: {
      ready: displayState === 'ready',
      displayState,
      reasonCode:
        displayState === 'unknown'
          ? 'weapon_missing'
          : displayState === 'danger'
            ? 'weapon_not_ready'
            : null,
      reasonLabel: null,
      assignedWeapon: null,
    },
    completedVgzCount: 0,
    personnelRotationStatus: null,
    airSituationStatus: null,
    mainDirectionUnits: 20,
    traverseLeftUnits: 3,
    traverseRightUnits: 3.4,
    mainDirectionDegrees: 120,
    traverseLeftDegrees: 18,
    traverseRightDegrees: 21,
    sectorLeftDegrees: 102,
    sectorRightDegrees: 141,
  };
}
