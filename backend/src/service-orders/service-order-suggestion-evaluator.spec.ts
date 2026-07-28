import {
  compareSuggestionCandidates,
  evaluateSuggestionCandidate,
  evaluateSuggestionKit,
  SuggestionCandidateInput,
  SuggestionKitInput,
  SuggestionStockSnapshot,
} from './service-order-suggestion-evaluator';

const completeKit: SuggestionKitInput = {
  id: 'kit-1',
  name: 'Kit 1',
  weaponModelId: 'model-1',
  isActive: true,
  shellId: 'shell-1',
  fuzeId: 'fuze-1',
  primerId: 'primer-1',
  maxRangeM: 10_000,
  charges: [
    { chargeId: 'charge-a', marking: 'A', quantityPerShot: 2 },
    { chargeId: 'charge-b', marking: 'B', quantityPerShot: 0.5 },
  ],
};

function stock(
  overrides: {
    shells?: number;
    fuzes?: number;
    primers?: number;
    chargeA?: number;
    chargeB?: number;
  } = {},
): SuggestionStockSnapshot {
  return {
    shells: new Map([['shell-1', overrides.shells ?? 20]]),
    fuzes: new Map([['fuze-1', overrides.fuzes ?? 20]]),
    primers: new Map([['primer-1', overrides.primers ?? 20]]),
    charges: new Map([
      ['charge-a', overrides.chargeA ?? 40],
      ['charge-b', overrides.chargeB ?? 10],
    ]),
  };
}

function candidate(
  overrides: Partial<SuggestionCandidateInput> = {},
): SuggestionCandidateInput {
  return {
    candidateType: 'fire_position',
    stableId: 'fp-1',
    callsign: 'Alpha',
    weaponModelId: 'model-1',
    weaponReadinessStatus: 'combat_ready',
    activeMaintenance: false,
    assignedWeaponCount: 1,
    insideScope: true,
    coordinatesValid: true,
    hasStockDepot: true,
    distanceM: 5_000,
    requiredShots: 4,
    kits: [completeKit],
    stock: stock(),
    ...overrides,
  };
}

describe('service order suggestion evaluator', () => {
  it('accepts a derived-ready FP and the exact max-range boundary', () => {
    const result = evaluateSuggestionCandidate(
      candidate({ distanceM: completeKit.maxRangeM }),
    );

    expect(result.ready).toBe(true);
    expect(result.rejections).toEqual([]);
  });

  it.each([
    [
      { weaponReadinessStatus: 'not_combat_ready' },
      'weapon_not_ready',
    ],
    [{ explicitFirePositionBlock: 'Повітряна загроза' }, 'fp_blocked'],
    [{ activeMaintenance: true }, 'active_maintenance'],
  ] as const)('rejects canonical candidate state with %s', (change, code) => {
    const result = evaluateSuggestionCandidate(candidate(change));
    expect(result.ready).toBe(false);
    expect(result.rejections.map((item) => item.code)).toContain(code);
  });

  it('rejects a candidate outside the allowed unit scope', () => {
    const result = evaluateSuggestionCandidate(
      candidate({ insideScope: false }),
    );

    expect(result.ready).toBe(false);
    expect(result.rejections.map((item) => item.code)).toContain(
      'outside_scope',
    );
  });

  it('rejects a candidate outside the allowed unit scope', () => {
    const result = evaluateSuggestionCandidate(
      candidate({ insideScope: false }),
    );

    expect(result.ready).toBe(false);
    expect(result.rejections.map((item) => item.code)).toContain(
      'outside_scope',
    );
  });

  it('accepts a permitted standalone weapon with coordinates and stock', () => {
    const result = evaluateSuggestionCandidate(
      candidate({
        candidateType: 'standalone_weapon',
        stableId: 'weapon-mobile',
        assignedWeaponCount: 0,
        standalonePermitted: true,
      }),
    );

    expect(result.ready).toBe(true);
  });

  it('excludes a wrong-model kit and explains an absent active kit', () => {
    const wrongModel = evaluateSuggestionCandidate(
      candidate({
        kits: [{ ...completeKit, weaponModelId: 'model-2' }],
      }),
    );
    const noKit = evaluateSuggestionCandidate(candidate({ kits: [] }));

    expect(wrongModel.rejections.map((item) => item.code)).toContain(
      'wrong_weapon_model',
    );
    expect(noKit.rejections.map((item) => item.code)).toContain(
      'no_active_kit',
    );
  });

  it('calculates mixed charge capacity from every component', () => {
    const result = evaluateSuggestionKit(
      completeKit,
      'model-1',
      5_000,
      4,
      stock({ shells: 50, fuzes: 50, primers: 50, chargeA: 18, chargeB: 6 }),
    );

    expect(result.availableShots).toBe(9);
    expect(result.sufficient).toBe(true);
  });

  it('returns the exact missing component reason', () => {
    const result = evaluateSuggestionKit(
      completeKit,
      'model-1',
      5_000,
      4,
      stock({ primers: 3 }),
    );

    expect(result.rejections).toEqual([
      expect.objectContaining({
        code: 'primer_shortage',
        label: expect.stringContaining('доступно 3'),
      }),
    ]);
  });

  it('sorts identically across repeated calls and uses callsign then UUID', () => {
    const candidates = [
      {
        ready: true,
        stockSummary: { sufficient: true, availableShots: 20 },
        distanceM: 5_000,
        callsign: 'Bravo',
        stableId: '0002',
      },
      {
        ready: true,
        stockSummary: { sufficient: true, availableShots: 20 },
        distanceM: 5_000,
        callsign: 'Alpha',
        stableId: '0003',
      },
      {
        ready: true,
        stockSummary: { sufficient: true, availableShots: 20 },
        distanceM: 5_000,
        callsign: 'Alpha',
        stableId: '0001',
      },
      {
        ready: false,
        stockSummary: { sufficient: false, availableShots: 100 },
        distanceM: 100,
        callsign: 'Rejected',
        stableId: '0000',
      },
    ];

    const orders = Array.from({ length: 5 }, () =>
      candidates
        .slice()
        .sort(compareSuggestionCandidates)
        .map((item) => item.stableId),
    );

    expect(new Set(orders.map((order) => JSON.stringify(order))).size).toBe(1);
    expect(orders[0]).toEqual(['0001', '0003', '0002', '0000']);
  });
});
