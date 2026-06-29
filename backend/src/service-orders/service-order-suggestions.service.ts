import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { ShellCompatibleCharge } from '../shell-compatible-charges/shell-compatible-charge.entity';
import { ServiceOrder } from './service-order.entity';
import { Shell } from '../shells/shell.entity';
import { Charge } from '../charges/charge.entity';
import { Zone } from '../zones/zone.entity';


export interface ServiceOrderSuggestionVariant {
  shellId: string;
  chargeId: string;
  zoneId: string | null;
  maxRangeM: number;
  rangeReserveM: number;
  availableQuantity: number;
  shell: Shell;
  charge: Charge;
  zone: Zone | null;
  priority: number;
}

export interface ServiceOrderSuggestion {
  firePosition: FirePosition;
  distanceM: number;
  completedVgzCount: number;
  variants: ServiceOrderSuggestionVariant[];
}

@Injectable()
export class ServiceOrderSuggestionsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getSuggestions(order: ServiceOrder): Promise<ServiceOrderSuggestion[]> {
    const positions = await this.dataSource.getRepository(FirePosition).find({
      relations: {
        unit: true,
        ammoDepot: true,
      },
      where: {
        hasSg: true,
        readinessStatus: 'ready',
      },
    });


    
    const suggestions: ServiceOrderSuggestion[] = [];

    for (const position of positions) {
      if (!position.ammoDepotId) continue;
const activeStatuses = ['proposed', 'sent', 'accepted', 'in_progress'];

const activeOrder = await this.dataSource
  .getRepository(ServiceOrder)
  .createQueryBuilder('serviceOrder')
  .where('serviceOrder.selectedFirePositionId = :firePositionId', {
    firePositionId: position.id,
  })
  .andWhere('serviceOrder.status IN (:...statuses)', {
    statuses: activeStatuses,
  })
  .getOne();

if (activeOrder) {
  continue;
}
      if (!this.isTargetInsideSector(position, order.targetLat, order.targetLng)) {
        continue;
      }

      const distanceM = Math.ceil(
  this.getDistanceM(
    position.lat,
    position.lng,
    order.targetLat,
    order.targetLng,
  ),
);

      const variants = await this.findResourcePairs(
  position.ammoDepotId,
  distanceM,
  Number(order.plannedQuantity),
  
);

if (variants.length === 0) {
  continue;
}

suggestions.push({
  firePosition: position,
  distanceM,
  completedVgzCount: position.completedVgzCount ?? 0,
  variants,
});
    }

   return suggestions.sort((a, b) => {
  const bestA = a.variants[0];
  const bestB = b.variants[0];

  if (bestA.maxRangeM !== bestB.maxRangeM) {
    return bestA.maxRangeM - bestB.maxRangeM;
  }

  if (bestA.rangeReserveM !== bestB.rangeReserveM) {
    return bestA.rangeReserveM - bestB.rangeReserveM;
  }

  if (a.completedVgzCount !== b.completedVgzCount) {
    return a.completedVgzCount - b.completedVgzCount;
  }

  return bestB.availableQuantity - bestA.availableQuantity;
});
  }

  private async findResourcePairs(
  depotId: string,
  distanceM: number,
  plannedQuantity: number,
  
): Promise<ServiceOrderSuggestionVariant[]> {
  const shells = await this.dataSource.getRepository(DepotShellStock).find({
    where: { depotId },
  });

  const charges = await this.dataSource.getRepository(DepotChargeStock).find({
    where: { depotId },
  });

  const availableShells = shells.filter(
    (item) => Number(item.quantity) >= plannedQuantity,
  );

  const availableCharges = charges.filter(
    (item) => Number(item.quantity) >= plannedQuantity,
  );

  const shellIds = availableShells.map((item) => item.shellId);
  const chargeIds = availableCharges.map((item) => item.chargeId);

  if (shellIds.length === 0 || chargeIds.length === 0) {
    return [];
  }

  const roundedDistanceM = Math.ceil(distanceM);

  const compatiblePairs = await this.dataSource
    .getRepository(ShellCompatibleCharge)
    .createQueryBuilder('compatibility')
    .leftJoinAndSelect('compatibility.shell', 'shell')
    .leftJoinAndSelect('compatibility.charge', 'charge')
    .leftJoinAndSelect('compatibility.zone', 'zone')
    .where('compatibility.shellId IN (:...shellIds)', { shellIds })
    .andWhere('compatibility.chargeId IN (:...chargeIds)', { chargeIds })
    .andWhere('compatibility.maxRangeM >= :distanceM', {
      distanceM: roundedDistanceM,
    })
    .orderBy('compatibility.maxRangeM', 'ASC')
    .getMany();

  const variants = compatiblePairs.map((pair) => {
    const shellStock = availableShells.find(
      (item) => item.shellId === pair.shellId,
    );

    const chargeStock = availableCharges.find(
      (item) => item.chargeId === pair.chargeId,
    );

    const availableQuantity = Math.min(
      Number(shellStock?.quantity ?? 0),
      Number(chargeStock?.quantity ?? 0),
    );

    return {
      shellId: pair.shellId,
      chargeId: pair.chargeId,
      zoneId: pair.zoneId,
      maxRangeM: Number(pair.maxRangeM),
      rangeReserveM: Number(pair.maxRangeM) - roundedDistanceM,
      availableQuantity,
      shell: pair.shell,
      charge: pair.charge,
      zone: pair.zone,
      priority: 0,
    };
  });

 return variants
  .sort((a, b) => {
    if (a.maxRangeM !== b.maxRangeM) {
      return a.maxRangeM - b.maxRangeM;
    }

    if (a.rangeReserveM !== b.rangeReserveM) {
      return a.rangeReserveM - b.rangeReserveM;
    }

    return b.availableQuantity - a.availableQuantity;
  })
  .map((variant, index) => ({
    ...variant,
    priority: index + 1,
  }));
}

  private isTargetInsideSector(
    position: FirePosition,
    targetLat: number,
    targetLng: number,
  ): boolean {
    if (
      position.sectorLeftDegrees === null ||
      position.sectorRightDegrees === null
    ) {
      return false;
    }

    const bearing = this.getBearingDegrees(
      position.lat,
      position.lng,
      targetLat,
      targetLng,
    );

    return this.isAngleBetween(
      bearing,
      position.sectorLeftDegrees,
      position.sectorRightDegrees,
    );
  }

  private isAngleBetween(angle: number, left: number, right: number): boolean {
    if (left <= right) {
      return angle >= left && angle <= right;
    }

    return angle >= left || angle <= right;
  }

  private getDistanceM(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const earthRadiusM = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private getBearingDegrees(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const y =
      Math.sin(this.toRad(lng2 - lng1)) * Math.cos(this.toRad(lat2));

    const x =
      Math.cos(this.toRad(lat1)) * Math.sin(this.toRad(lat2)) -
      Math.sin(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.cos(this.toRad(lng2 - lng1));

    return (this.toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private toDeg(value: number): number {
    return (value * 180) / Math.PI;
  }
}