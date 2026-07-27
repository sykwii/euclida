import { MapPage } from './map-page';

describe('MapPage fire-position readiness', () => {
  const component = new MapPage(
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
});
