import { FirePosition } from './fire-position.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';

export type FirePositionOperationalReasonCode =
  | 'fp_threat'
  | 'fp_damaged'
  | 'fp_prohibited'
  | 'fp_other'
  | 'weapon_missing'
  | 'weapon_not_ready'
  | null;

export interface FirePositionOperationalState {
  ready: boolean;
  reasonCode: FirePositionOperationalReasonCode;
  reasonLabel: string | null;
  assignedWeapon: WeaponSystem | null;
}

const FIRE_POSITION_BLOCKS: Record<
  string,
  {
    code: Exclude<
      FirePositionOperationalReasonCode,
      'weapon_missing' | 'weapon_not_ready' | null
    >;
    label: string;
  }
> = {
  threat: { code: 'fp_threat', label: 'Повітряна загроза' },
  damaged: { code: 'fp_damaged', label: 'ВП пошкоджена' },
  prohibited: { code: 'fp_prohibited', label: 'Використання ВП заборонено' },
  other: { code: 'fp_other', label: 'ВП заблокована' },
};

const WEAPON_REASON_LABELS: Record<string, string> = {
  breakdown: 'Поломка',
  maintenance: 'Технічне обслуговування',
  air_threat: 'Повітряна загроза',
  crew: 'Екіпаж не готовий',
  other: 'Інша причина',
};

export function deriveFirePositionOperationalState(
  firePosition: Pick<FirePosition, 'notReadyReason'>,
  assignedWeapon: WeaponSystem | null,
): FirePositionOperationalState {
  const block = firePosition.notReadyReason
    ? FIRE_POSITION_BLOCKS[firePosition.notReadyReason]
    : undefined;

  if (block) {
    return {
      ready: false,
      reasonCode: block.code,
      reasonLabel: block.label,
      assignedWeapon,
    };
  }

  if (!assignedWeapon) {
    return {
      ready: false,
      reasonCode: 'weapon_missing',
      reasonLabel: 'СГ не призначена',
      assignedWeapon: null,
    };
  }

  if (assignedWeapon.readinessStatus !== 'combat_ready') {
    const weaponReason =
      WEAPON_REASON_LABELS[assignedWeapon.notReadyReason || 'other'] ||
      WEAPON_REASON_LABELS.other;

    return {
      ready: false,
      reasonCode: 'weapon_not_ready',
      reasonLabel: `СГ НЕ БГ: ${weaponReason}`,
      assignedWeapon,
    };
  }

  return {
    ready: true,
    reasonCode: null,
    reasonLabel: null,
    assignedWeapon,
  };
}

export function isExplicitFirePositionBlock(
  reason: string | null | undefined,
): boolean {
  return (
    !!reason &&
    Object.prototype.hasOwnProperty.call(FIRE_POSITION_BLOCKS, reason)
  );
}
