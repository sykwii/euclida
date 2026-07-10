export const DEFAULT_RECON_SETTINGS = {
  clusteringRadiusM: {
    mortar: 350,
    tube_artillery: 550,
    mlrs: 900,
  },
  staleHours: {
    mortar: 24,
    tube_artillery: 36,
    mlrs: 48,
  },
  sourceWeights: {
    light_recon: 0.75,
    sound_recon: 0.7,
    counter_battery_complex: 0.9,
    air_recon: 0.85,
    allied_air_recon: 0.9,
  },
  indexWeights: {
    confidence: 0.35,
    activity: 0.2,
    freshness: 0.2,
    threat: 0.25,
  },
  targetThresholds: {
    low: 30,
    medium: 55,
    high: 75,
    confirmed: 90,
  },
  correlation: {
    maxDistanceM: 3000,
    maxTimeDeltaHours: 72,
    maxRangeM: {
      mortar: 7000,
      tube_artillery: 30000,
      mlrs: 80000,
    },
    weights: {
      distance: 0.28,
      timeDelta: 0.22,
      targetType: 0.16,
      maxRange: 0.14,
      freshness: 0.1,
      confidence: 0.1,
    },
    minScore: 35,
  },
  heatmap: {
    gridPrecision: 3,
    maxPoints: 2000,
    weights: {
      confidence: 0.4,
      freshness: 0.3,
      count: 0.3,
    },
  },
  pagination: {
    defaultLimit: 200,
    maxLimit: 1000,
  },
};
