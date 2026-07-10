export type ReconSource =
  | 'light_recon'
  | 'sound_recon'
  | 'counter_battery_complex'
  | 'air_recon'
  | 'allied_air_recon';

export type ReconInputProvider = 'manual' | 'delta_import' | 'api';

export type ReconTargetType = 'mortar' | 'tube_artillery' | 'mlrs';

export type ReconTargetStatus =
  | 'candidate'
  | 'active'
  | 'confirmed'
  | 'stale'
  | 'hidden'
  | 'processed'
  | 'false_target'
  | 'needs_recon';

export type ReconAssessmentStatus = 'proposed' | 'confirmed' | 'rejected';

export type ReconAssessmentType =
  | 'likely_firing_position'
  | 'likely_reserve_position'
  | 'likely_false_position'
  | 'requires_additional_recon'
  | 'no_assessment';

export const RECON_SOURCES: ReconSource[] = [
  'light_recon',
  'sound_recon',
  'counter_battery_complex',
  'air_recon',
  'allied_air_recon',
];

export const RECON_INPUT_PROVIDERS: ReconInputProvider[] = [
  'manual',
  'delta_import',
  'api',
];

export const RECON_TARGET_TYPES: ReconTargetType[] = [
  'mortar',
  'tube_artillery',
  'mlrs',
];

export const RECON_TARGET_STATUSES: ReconTargetStatus[] = [
  'candidate',
  'active',
  'confirmed',
  'stale',
  'hidden',
  'processed',
  'false_target',
  'needs_recon',
];
