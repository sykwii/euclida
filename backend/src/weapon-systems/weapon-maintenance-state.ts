import { DataSource, EntityManager, In } from 'typeorm';
import { WeaponMaintenance } from './weapon-maintenance.entity';

export async function getActiveMaintenance(
  dataSource: DataSource,
  weaponId: string,
  manager?: EntityManager,
): Promise<WeaponMaintenance | null> {
  const repository = manager
    ? manager.getRepository(WeaponMaintenance)
    : dataSource.getRepository(WeaponMaintenance);

  return repository.findOne({
    where: {
      weaponSystemId: weaponId,
      status: In(['opened', 'in_progress']),
    },
    order: {
      createdAt: 'DESC',
      id: 'DESC',
    },
  });
}

export function activeMaintenanceFromHistory(
  maintenances: WeaponMaintenance[] | null | undefined,
): WeaponMaintenance | null {
  return (
    (maintenances ?? [])
      .filter(
        (item) => item.status === 'opened' || item.status === 'in_progress',
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )[0] ?? null
  );
}
