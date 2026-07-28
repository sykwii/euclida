import { FirePosition } from './fire-position.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { deriveFirePositionOperationalState } from './fire-position-operational-state';

const position = (notReadyReason: string | null): FirePosition =>
  ({ notReadyReason }) as FirePosition;

const weapon = (
  readinessStatus: string,
  notReadyReason: string | null = null,
): WeaponSystem => ({ readinessStatus, notReadyReason }) as WeaponSystem;

describe('deriveFirePositionOperationalState', () => {
  it('reports a missing assigned weapon and ignores stale non-blocking state', () => {
    expect(
      deriveFirePositionOperationalState(position('not_prepared'), null),
    ).toMatchObject({
      ready: false,
      displayState: 'unknown',
      reasonCode: 'weapon_missing',
      reasonLabel: 'СГ не призначена',
      assignedWeapon: null,
    });
  });

  it('reports the localized weapon reason for a non-ready assigned weapon', () => {
    const assignedWeapon = weapon('not_combat_ready', 'breakdown');

    expect(
      deriveFirePositionOperationalState(position(null), assignedWeapon),
    ).toEqual({
      ready: false,
      displayState: 'danger',
      reasonCode: 'weapon_not_ready',
      reasonLabel: 'СГ НЕ БГ: Поломка',
      assignedWeapon,
    });
  });

  it('is ready only with a combat-ready assigned weapon', () => {
    const assignedWeapon = weapon('combat_ready');

    expect(
      deriveFirePositionOperationalState(position(null), assignedWeapon),
    ).toEqual({
      ready: true,
      displayState: 'ready',
      reasonCode: null,
      reasonLabel: null,
      assignedWeapon,
    });
  });

  it.each([
    ['threat', 'fp_threat', 'Повітряна загроза'],
    ['damaged', 'fp_damaged', 'ВП пошкоджена'],
    ['prohibited', 'fp_prohibited', 'Використання ВП заборонено'],
    ['other', 'fp_other', 'ВП заблокована'],
  ])(
    'gives explicit block %s priority over weapon readiness',
    (notReadyReason, reasonCode, reasonLabel) => {
      const assignedWeapon = weapon('combat_ready');

      expect(
        deriveFirePositionOperationalState(
          position(notReadyReason),
          assignedWeapon,
        ),
      ).toEqual({
        ready: false,
        displayState: 'danger',
        reasonCode,
        reasonLabel,
        assignedWeapon,
      });
    },
  );
});
