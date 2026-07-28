export type SuggestionRejectionCode =
  | 'fp_blocked'
  | 'weapon_missing'
  | 'weapon_not_ready'
  | 'active_maintenance'
  | 'wrong_weapon_model'
  | 'no_active_kit'
  | 'distance_exceeded'
  | 'shell_shortage'
  | 'charge_shortage'
  | 'fuze_shortage'
  | 'primer_shortage'
  | 'no_stock_depot'
  | 'outside_scope'
  | 'invalid_coordinates';

export interface SuggestionRejection {
  code: SuggestionRejectionCode;
  label: string;
}

export interface SuggestionStockSnapshot {
  shells: ReadonlyMap<string, number>;
  charges: ReadonlyMap<string, number>;
  fuzes: ReadonlyMap<string, number>;
  primers: ReadonlyMap<string, number>;
}

export interface SuggestionKitInput {
  id: string;
  name: string;
  weaponModelId: string;
  isActive: boolean;
  shellId: string | null;
  fuzeId: string | null;
  primerId: string | null;
  maxRangeM: number;
  charges: Array<{
    chargeId: string;
    marking: string;
    quantityPerShot: number;
  }>;
}

export interface EvaluatedSuggestionKit {
  id: string;
  availableShots: number;
  sufficient: boolean;
  rejections: SuggestionRejection[];
}

export interface SuggestionCandidateInput {
  candidateType: 'fire_position' | 'standalone_weapon';
  stableId: string;
  callsign: string | null;
  weaponModelId: string | null;
  weaponReadinessStatus: string | null;
  activeMaintenance: boolean;
  explicitFirePositionBlock?: string | null;
  assignedWeaponCount?: number;
  insideScope: boolean;
  coordinatesValid: boolean;
  hasStockDepot: boolean;
  standalonePermitted?: boolean;
  distanceM: number | null;
  requiredShots: number;
  kits: SuggestionKitInput[];
  stock: SuggestionStockSnapshot;
}

export interface EvaluatedSuggestionCandidate {
  ready: boolean;
  stockSufficient: boolean;
  distanceM: number;
  availableShots: number;
  score: number;
  rejections: SuggestionRejection[];
  kits: EvaluatedSuggestionKit[];
}

const LABELS: Record<SuggestionRejectionCode, string> = {
  fp_blocked: 'ВП має активне блокування',
  weapon_missing: 'СГ не призначена',
  weapon_not_ready: 'СГ не боєготова',
  active_maintenance: 'СГ перебуває на активному ТО або ремонті',
  wrong_weapon_model: 'Немає комплекту для моделі СГ',
  no_active_kit: 'Немає активного повного комплекту пострілу',
  distance_exceeded: 'Дальність до цілі перевищує можливості комплекту',
  shell_shortage: 'Недостатньо снарядів',
  charge_shortage: 'Недостатньо заряду',
  fuze_shortage: 'Недостатньо підривників',
  primer_shortage: 'Недостатньо праймерів',
  no_stock_depot: 'Для кандидата не визначено склад боєкомплекту',
  outside_scope: 'Кандидат поза дозволеним підрозділом',
  invalid_coordinates: 'Координати кандидата відсутні або некоректні',
};

export function rejection(
  code: SuggestionRejectionCode,
  detail?: string,
): SuggestionRejection {
  return {
    code,
    label: detail ? `${LABELS[code]}: ${detail}` : LABELS[code],
  };
}

export function evaluateSuggestionKit(
  kit: SuggestionKitInput,
  weaponModelId: string | null,
  distanceM: number,
  requiredShots: number,
  stock: SuggestionStockSnapshot,
): EvaluatedSuggestionKit {
  const rejections: SuggestionRejection[] = [];
  if (!weaponModelId || kit.weaponModelId !== weaponModelId) {
    rejections.push(rejection('wrong_weapon_model'));
  }
  if (
    !kit.isActive ||
    !kit.shellId ||
    !kit.fuzeId ||
    !kit.primerId ||
    kit.charges.length === 0
  ) {
    rejections.push(rejection('no_active_kit'));
  }
  if (distanceM > kit.maxRangeM) {
    rejections.push(
      rejection(
        'distance_exceeded',
        `потрібно ${Math.ceil(distanceM)} м, максимум ${kit.maxRangeM} м`,
      ),
    );
  }

  const componentCapacity: number[] = [];
  if (kit.shellId) {
    const available = stock.shells.get(kit.shellId) ?? 0;
    componentCapacity.push(Math.floor(available));
    if (available < requiredShots) {
      rejections.push(
        rejection(
          'shell_shortage',
          `потрібно ${requiredShots}, доступно ${Math.floor(available)}`,
        ),
      );
    }
  }
  if (kit.fuzeId) {
    const available = stock.fuzes.get(kit.fuzeId) ?? 0;
    componentCapacity.push(Math.floor(available));
    if (available < requiredShots) {
      rejections.push(
        rejection(
          'fuze_shortage',
          `потрібно ${requiredShots}, доступно ${Math.floor(available)}`,
        ),
      );
    }
  }
  if (kit.primerId) {
    const available = stock.primers.get(kit.primerId) ?? 0;
    componentCapacity.push(Math.floor(available));
    if (available < requiredShots) {
      rejections.push(
        rejection(
          'primer_shortage',
          `потрібно ${requiredShots}, доступно ${Math.floor(available)}`,
        ),
      );
    }
  }
  for (const charge of kit.charges) {
    const quantityPerShot = Number(charge.quantityPerShot);
    const available = stock.charges.get(charge.chargeId) ?? 0;
    const capacity =
      quantityPerShot > 0 ? Math.floor(available / quantityPerShot) : 0;
    componentCapacity.push(capacity);
    const required = quantityPerShot * requiredShots;
    if (quantityPerShot <= 0 || available < required) {
      rejections.push(
        rejection(
          'charge_shortage',
          `${charge.marking}: потрібно ${required}, доступно ${available}`,
        ),
      );
    }
  }

  const availableShots =
    componentCapacity.length > 0
      ? Math.max(Math.min(...componentCapacity), 0)
      : 0;
  return {
    id: kit.id,
    availableShots,
    sufficient: availableShots >= requiredShots,
    rejections: dedupeRejections(rejections),
  };
}

export function evaluateSuggestionCandidate(
  input: SuggestionCandidateInput,
): EvaluatedSuggestionCandidate {
  const rejections: SuggestionRejection[] = [];
  if (!input.insideScope) {
    rejections.push(rejection('outside_scope'));
  }
  if (!input.coordinatesValid || input.distanceM === null) {
    rejections.push(rejection('invalid_coordinates'));
  }
  if (!input.hasStockDepot) {
    rejections.push(rejection('no_stock_depot'));
  }
  if (
    input.candidateType === 'fire_position' &&
    input.explicitFirePositionBlock
  ) {
    rejections.push(
      rejection('fp_blocked', input.explicitFirePositionBlock),
    );
  }
  if (
    input.candidateType === 'fire_position' &&
    input.assignedWeaponCount !== 1
  ) {
    rejections.push(rejection('weapon_missing'));
  }
  if (
    input.candidateType === 'standalone_weapon' &&
    !input.standalonePermitted
  ) {
    rejections.push(
      rejection('weapon_not_ready', 'тип СГ не підтримує роботу без ВП'),
    );
  }
  if (input.weaponReadinessStatus !== 'combat_ready') {
    rejections.push(rejection('weapon_not_ready'));
  }
  if (input.activeMaintenance) {
    rejections.push(rejection('active_maintenance'));
  }

  const distanceM =
    input.distanceM !== null && Number.isFinite(input.distanceM)
      ? input.distanceM
      : Number.MAX_SAFE_INTEGER;
  const canEvaluateKits =
    input.coordinatesValid &&
    input.distanceM !== null &&
    input.hasStockDepot;
  const evaluatedKits = canEvaluateKits
    ? input.kits.map((kit) =>
        evaluateSuggestionKit(
          kit,
          input.weaponModelId,
          distanceM,
          input.requiredShots,
          input.stock,
        ),
      )
    : [];
  const modelKits = input.kits.filter(
    (kit) => kit.weaponModelId === input.weaponModelId,
  );
  if (input.kits.length > 0 && modelKits.length === 0) {
    rejections.push(rejection('wrong_weapon_model'));
  } else if (
    modelKits.length === 0 ||
    modelKits.every(
      (kit) =>
        !kit.isActive ||
        !kit.shellId ||
        !kit.fuzeId ||
        !kit.primerId ||
        kit.charges.length === 0,
    )
  ) {
    rejections.push(rejection('no_active_kit'));
  }

  const compatibleKits = evaluatedKits.filter(
    (kit) => kit.rejections.length === 0,
  );
  if (compatibleKits.length === 0 && evaluatedKits.length > 0) {
    rejections.push(
      ...evaluatedKits.flatMap((kit) => kit.rejections),
    );
  }
  const availableShots = evaluatedKits.reduce(
    (maximum, kit) => Math.max(maximum, kit.availableShots),
    0,
  );
  const normalizedRejections = dedupeRejections(rejections);
  const ready =
    normalizedRejections.length === 0 && compatibleKits.length > 0;
  const stockSufficient =
    compatibleKits.some((kit) => kit.sufficient) && ready;

  return {
    ready,
    stockSufficient,
    distanceM,
    availableShots,
    score:
      (ready ? 1_000_000_000 : 0) +
      (stockSufficient ? 100_000_000 : 0) -
      Math.min(Math.round(distanceM), 10_000_000) * 10 +
      Math.min(availableShots, 1_000_000),
    rejections: normalizedRejections,
    kits: evaluatedKits,
  };
}

export function compareSuggestionCandidates(
  a: {
    ready?: boolean;
    stockSummary?: { sufficient: boolean; availableShots: number };
    distanceM: number;
    stableId?: string;
    callsign?: string | null;
  },
  b: {
    ready?: boolean;
    stockSummary?: { sufficient: boolean; availableShots: number };
    distanceM: number;
    stableId?: string;
    callsign?: string | null;
  },
): number {
  const aReady = a.ready === true;
  const bReady = b.ready === true;
  const aStockSufficient = a.stockSummary?.sufficient === true;
  const bStockSufficient = b.stockSummary?.sufficient === true;
  const aAvailableShots = a.stockSummary?.availableShots ?? 0;
  const bAvailableShots = b.stockSummary?.availableShots ?? 0;
  if (aReady !== bReady) return aReady ? -1 : 1;
  if (aStockSufficient !== bStockSufficient) {
    return aStockSufficient ? -1 : 1;
  }
  if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
  if (aAvailableShots !== bAvailableShots) {
    return bAvailableShots - aAvailableShots;
  }
  const callsignComparison = (a.callsign ?? '').localeCompare(
    b.callsign ?? '',
    'uk',
  );
  if (callsignComparison !== 0) return callsignComparison;
  return (a.stableId ?? '').localeCompare(b.stableId ?? '');
}

function dedupeRejections(
  rejections: SuggestionRejection[],
): SuggestionRejection[] {
  const result = new Map<string, SuggestionRejection>();
  for (const item of rejections) {
    const key = `${item.code}:${item.label}`;
    if (!result.has(key)) {
      result.set(key, item);
    }
  }
  return Array.from(result.values());
}
