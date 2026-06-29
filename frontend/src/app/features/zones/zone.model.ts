import { WeaponModel } from '../weapon-models/weapon-model.model';

export interface Zone {
  id: string;
  weaponModelId: string;
  weaponModel?: WeaponModel;
  zoneNumber: number;
  distanceFromM: number;
  distanceToM: number;
  createdAt: string;
}