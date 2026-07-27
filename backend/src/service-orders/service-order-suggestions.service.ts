import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { Charge } from '../charges/charge.entity';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { AirAssetDroneStock } from '../drone-logistics/air-asset-drone-stock.entity';
import { AirAssetWarheadStock } from '../drone-logistics/air-asset-warhead-stock.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { deriveFirePositionOperationalState } from '../fire-positions/fire-position-operational-state';
import { Fuze } from '../fuzes/fuze.entity';
import { Primer } from '../primers/primer.entity';
import { Shell } from '../shells/shell.entity';
import { ShotConfiguration } from '../shot-configurations/shot-configuration.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { ServiceOrder } from './service-order.entity';

export interface ServiceOrderSuggestionChargeComponent {
  chargeId: string;
  quantityPerShot: number;
  sortOrder: number;
  accountingUnit: 'piece' | 'module';
  charge: Charge;
}

export interface ServiceOrderSuggestionVariant {
  weaponModelId: string;
  shotConfigurationId: string;
  shotConfigurationName: string;
  shellId: string;
  chargeId: string;
  zoneId: string | null;
  zoneNumber: number | null;
  fuzeId: string | null;
  primerId: string | null;
  maxRangeM: number;
  rangeReserveM: number;
  availableQuantity: number;
  shell: Shell;
  charge: Charge;
  fuze: Fuze | null;
  primer: Primer | null;
  charges: ServiceOrderSuggestionChargeComponent[];
  priority: number;
  rejectionReasons: string[];
}

export interface ServiceOrderAirPayloadVariant {
  droneModelId: string;
  warheadTypeId: string;
  maxRangeM: number;
  rangeReserveM: number;
  availableQuantity: number;
  droneModel: AirAssetDroneStock['droneModel'];
  warheadType: AirAssetWarheadStock['warheadType'];
  priority: number;
}

export interface ServiceOrderSuggestion {
  executorType: 'fire_position' | 'air_asset_position';
  firePosition?: FirePosition;
  firePositionId?: string | null;
  weaponSystemId?: string;
  weapon?: {
    id: string;
    callsign: string | null;
    serialNumber: string | null;
    model: {
      id: string;
      name: string;
    };
  };
  readiness?: {
    status: string;
    reason: string | null;
  };
  stockSufficient?: boolean;
  compatibleKits?: ServiceOrderSuggestionVariant[];
  airAssetPosition?: AirAssetPosition;
  distanceM: number;
  completedVgzCount: number;
  variants: ServiceOrderSuggestionVariant[];
  payloadVariants?: ServiceOrderAirPayloadVariant[];
  rejectionReasons?: string[];
}

@Injectable()
export class ServiceOrderSuggestionsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getSuggestions(order: ServiceOrder): Promise<ServiceOrderSuggestion[]> {
    const readyStatuses = ['ready', 'combat_ready', 'ready_for_combat'];
    const activeStatuses = [
      'proposed',
      'sent',
      'sent_to_division',
      'sent_to_battery',
      'accepted',
      'in_progress',
    ];
    const plannedQuantity = Math.max(Number(order.plannedQuantity || 1), 1);

    const positions = await this.dataSource
      .getRepository(FirePosition)
      .createQueryBuilder('position')
      .leftJoinAndSelect('position.unit', 'unit')
      .leftJoinAndSelect('position.ammoDepot', 'ammoDepot')
      .innerJoin(
        'weapon_systems',
        'weapon',
        `weapon.current_fire_position_id = position.id
          AND weapon.deployment_status = 'at_fire_position'`,
      )
      .getMany();

    const suggestions: ServiceOrderSuggestion[] = [];

    for (const position of positions) {
      if (!position.ammoDepotId) {
        continue;
      }

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

      if (
        !this.isTargetInsideSector(position, order.targetLat, order.targetLng)
      ) {
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

      const kitResult = await this.findResourcePairs(
        position.id,
        position.ammoDepotId,
        distanceM,
        plannedQuantity,
      );

      for (const weapon of kitResult.weaponSystems) {
        const operationalState = deriveFirePositionOperationalState(
          position,
          weapon,
        );
        const weaponVariants = kitResult.variants.filter(
          (item) => item.weaponModelId === weapon.weaponModelId,
        );
        const compatibleKits = operationalState.ready
          ? weaponVariants.filter((item) => item.rejectionReasons.length === 0)
          : [];
        const rejectionReasons = Array.from(
          new Set([
            ...(operationalState.reasonLabel
              ? [operationalState.reasonLabel]
              : []),
            ...weaponVariants.flatMap((item) => item.rejectionReasons),
            ...(weaponVariants.length === 0 ? kitResult.rejectionReasons : []),
          ]),
        );

        suggestions.push({
          executorType: 'fire_position',
          firePosition: position,
          firePositionId: position.id,
          weaponSystemId: weapon.id,
          weapon: {
            id: weapon.id,
            callsign: weapon.callsign,
            serialNumber: weapon.serialNumber,
            model: {
              id: weapon.weaponModelId,
              name: weapon.weaponModel?.name || 'Модель не визначено',
            },
          },
          readiness: {
            status: operationalState.ready
              ? 'combat_ready'
              : 'not_combat_ready',
            reason: operationalState.reasonLabel,
          },
          stockSufficient: compatibleKits.some(
            (item) => item.availableQuantity >= plannedQuantity,
          ),
          compatibleKits,
          distanceM,
          completedVgzCount: position.completedVgzCount ?? 0,
          variants: compatibleKits,
          rejectionReasons,
        });
      }
    }

    const combatAssets = await this.dataSource
      .getRepository(AirAssetPosition)
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.unit', 'unit')
      .where('asset.assetGroup = :assetGroup', { assetGroup: 'combat' })
      .andWhere(
        '(asset.readinessStatus IS NULL OR asset.readinessStatus IN (:...readyStatuses))',
        { readyStatuses },
      )
      .getMany();

    for (const asset of combatAssets) {
      if (!this.isTargetInsideSector(asset, order.targetLat, order.targetLng)) {
        continue;
      }

      const distanceM = Math.ceil(
        this.getDistanceM(
          asset.lat,
          asset.lng,
          order.targetLat,
          order.targetLng,
        ),
      );

      const payloadVariants = await this.findCombatDronePayloadVariants(
        asset.id,
        distanceM,
        plannedQuantity,
      );

      if (payloadVariants.length === 0) {
        continue;
      }

      suggestions.push({
        executorType: 'air_asset_position',
        airAssetPosition: asset,
        distanceM,
        completedVgzCount: 0,
        variants: [],
        payloadVariants,
      });
    }

    if (suggestions.length === 0) {
      throw new BadRequestException('Немає БГ СГ');
    }

    return suggestions.sort((a, b) => {
      if (a.executorType !== b.executorType) {
        return a.executorType === 'fire_position' ? -1 : 1;
      }

      if (a.distanceM !== b.distanceM) {
        return a.distanceM - b.distanceM;
      }

      if (a.completedVgzCount !== b.completedVgzCount) {
        return a.completedVgzCount - b.completedVgzCount;
      }

      const availableA =
        a.variants[0]?.availableQuantity ??
        a.payloadVariants?.[0]?.availableQuantity ??
        0;

      const availableB =
        b.variants[0]?.availableQuantity ??
        b.payloadVariants?.[0]?.availableQuantity ??
        0;

      if (availableA !== availableB) {
        return availableB - availableA;
      }

      const idA = a.firePosition?.id ?? a.airAssetPosition?.id ?? '';
      const idB = b.firePosition?.id ?? b.airAssetPosition?.id ?? '';
      return idA.localeCompare(idB);
    });
  }

  private async findResourcePairs(
    firePositionId: string,
    depotId: string,
    distanceM: number,
    plannedQuantity: number,
  ): Promise<{
    variants: ServiceOrderSuggestionVariant[];
    rejectionReasons: string[];
    weaponSystems: WeaponSystem[];
  }> {
    const weaponSystems = await this.dataSource
      .getRepository(WeaponSystem)
      .find({
        where: {
          currentFirePositionId: firePositionId,
          deploymentStatus: 'at_fire_position',
        },
        relations: {
          weaponModel: true,
        },
        order: {
          callsign: 'ASC',
          serialNumber: 'ASC',
          id: 'ASC',
        },
      });

    const weaponModelIds = Array.from(
      new Set(
        weaponSystems
          .map((item) => item.weaponModelId)
          .filter((item): item is string => Boolean(item)),
      ),
    );

    if (weaponModelIds.length === 0) {
      return {
        variants: [],
        rejectionReasons: [
          'На ВП немає прибулої СГ з визначеною моделлю озброєння',
        ],
        weaponSystems: [],
      };
    }

    const configurations = await this.dataSource
      .getRepository(ShotConfiguration)
      .find({
        where: weaponModelIds.map((weaponModelId) => ({
          weaponModelId,
        })),
        relations: {
          shell: true,
          fuze: true,
          primer: true,
          charges: {
            charge: true,
          },
        },
        order: {
          maxRangeM: 'ASC',
          charges: {
            sortOrder: 'ASC',
          },
        },
      });

    if (configurations.length === 0) {
      return {
        variants: [],
        rejectionReasons: ['Для моделі СГ немає комплектів пострілу'],
        weaponSystems,
      };
    }

    const [shells, charges, fuzes, primers] = await Promise.all([
      this.dataSource
        .getRepository(DepotShellStock)
        .find({ where: { depotId } }),
      this.dataSource
        .getRepository(DepotChargeStock)
        .find({ where: { depotId } }),
      this.dataSource
        .getRepository(DepotFuzeStock)
        .find({ where: { depotId } }),
      this.dataSource
        .getRepository(DepotPrimerStock)
        .find({ where: { depotId } }),
    ]);

    const shellStock = new Map<string, number>(
      shells.map((item) => [item.shellId, Number(item.quantity)]),
    );
    const chargeStock = new Map<string, number>(
      charges.map((item) => [item.chargeId, Number(item.quantity)]),
    );
    const fuzeStock = new Map<string, number>(
      fuzes.map((item) => [item.fuzeId, Number(item.quantity)]),
    );
    const primerStock = new Map<string, number>(
      primers.map((item) => [item.primerId, Number(item.quantity)]),
    );

    const allVariants = configurations
      .filter((configuration) => configuration.charges.length > 0)
      .map((configuration) => {
        const primaryCharge = configuration.charges[0];
        const availableQuantity = this.getAvailableShotsForConfiguration(
          configuration,
          shellStock,
          chargeStock,
          fuzeStock,
          primerStock,
        );
        const rejectionReasons = this.getConfigurationRejectionReasons(
          configuration,
          distanceM,
          plannedQuantity,
          availableQuantity,
          shellStock,
          chargeStock,
          fuzeStock,
          primerStock,
        );

        return {
          weaponModelId: configuration.weaponModelId,
          shotConfigurationId: configuration.id,
          shotConfigurationName: configuration.name,
          shellId: configuration.shellId,
          chargeId: primaryCharge.chargeId,
          zoneId: configuration.zoneId,
          zoneNumber: configuration.zoneNumber,
          fuzeId: configuration.fuzeId,
          primerId: configuration.primerId,
          maxRangeM: Number(configuration.maxRangeM),
          rangeReserveM: Math.max(
            Number(configuration.maxRangeM) - Math.ceil(distanceM),
            0,
          ),
          availableQuantity,
          shell: configuration.shell,
          charge: primaryCharge.charge,
          fuze: configuration.fuze,
          primer: configuration.primer,
          charges: configuration.charges.map((component) => ({
            chargeId: component.chargeId,
            quantityPerShot: Number(component.quantityPerShot),
            sortOrder: Number(component.sortOrder),
            accountingUnit:
              component.accountingUnit ??
              this.normalizeChargeAccountingUnit(component.charge),
            charge: component.charge,
          })),
          priority: 0,
          rejectionReasons,
        };
      })
      .sort((a, b) => {
        if (a.rejectionReasons.length === 0 && b.rejectionReasons.length > 0) {
          return -1;
        }

        if (a.rejectionReasons.length > 0 && b.rejectionReasons.length === 0) {
          return 1;
        }

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

    const rejectionReasons = Array.from(
      new Set([
        ...this.collectRejectionReasons(allVariants),
        ...configurations
          .filter((configuration) => configuration.charges.length === 0)
          .flatMap((configuration) =>
            this.getConfigurationRejectionReasons(
              configuration,
              distanceM,
              plannedQuantity,
              0,
              shellStock,
              chargeStock,
              fuzeStock,
              primerStock,
            ),
          ),
      ]),
    );

    return {
      variants: allVariants,
      rejectionReasons,
      weaponSystems,
    };
  }

  private getAvailableShotsForConfiguration(
    configuration: ShotConfiguration,
    shellStock: Map<string, number>,
    chargeStock: Map<string, number>,
    fuzeStock: Map<string, number>,
    primerStock: Map<string, number>,
  ): number {
    const totals: number[] = [];
    totals.push(Math.floor(Number(shellStock.get(configuration.shellId) ?? 0)));

    if (configuration.fuzeId) {
      totals.push(Math.floor(Number(fuzeStock.get(configuration.fuzeId) ?? 0)));
    }

    if (configuration.primerId) {
      totals.push(
        Math.floor(Number(primerStock.get(configuration.primerId) ?? 0)),
      );
    }

    for (const component of configuration.charges) {
      const available = Number(chargeStock.get(component.chargeId) ?? 0);
      totals.push(Math.floor(available / Number(component.quantityPerShot)));
    }

    return totals.length > 0 ? Math.max(Math.min(...totals), 0) : 0;
  }

  private getConfigurationRejectionReasons(
    configuration: ShotConfiguration,
    distanceM: number,
    plannedQuantity: number,
    availableQuantity: number,
    shellStock: Map<string, number>,
    chargeStock: Map<string, number>,
    fuzeStock: Map<string, number>,
    primerStock: Map<string, number>,
  ): string[] {
    const reasons: string[] = [];
    const requiredShots = Math.max(plannedQuantity, 1);
    const availableShells = Math.floor(
      Number(shellStock.get(configuration.shellId) ?? 0),
    );

    if (!configuration.isActive) {
      reasons.push(`Комплект "${configuration.name}" не активний`);
    }

    if (!configuration.fuzeId) {
      reasons.push(`Комплект "${configuration.name}" без підривника`);
    }

    if (!configuration.primerId) {
      reasons.push(`Комплект "${configuration.name}" без праймера`);
    }

    if (configuration.zoneNumber == null) {
      reasons.push(`Комплект "${configuration.name}" без номера зони`);
    }

    if (configuration.charges.length === 0) {
      reasons.push(`Комплект "${configuration.name}" не містить зарядів`);
    }

    if (Number(configuration.maxRangeM) < Math.ceil(distanceM)) {
      reasons.push(
        `Комплект "${configuration.name}" не покриває дальність: потрібно ${Math.ceil(distanceM)} м, максимум ${Number(configuration.maxRangeM)} м`,
      );
    }

    if (availableShells < requiredShots) {
      reasons.push(
        `Недостатньо снарядів: потрібно ${requiredShots}, доступно ${availableShells}`,
      );
    }

    if (configuration.fuzeId) {
      const availableFuzes = Math.floor(
        Number(fuzeStock.get(configuration.fuzeId) ?? 0),
      );
      if (availableFuzes < requiredShots) {
        reasons.push(
          `Недостатньо підривників: потрібно ${requiredShots}, доступно ${availableFuzes}`,
        );
      }
    }

    if (configuration.primerId) {
      const availablePrimers = Math.floor(
        Number(primerStock.get(configuration.primerId) ?? 0),
      );
      if (availablePrimers < requiredShots) {
        reasons.push(
          `Недостатньо праймерів: потрібно ${requiredShots}, доступно ${availablePrimers}`,
        );
      }
    }

    for (const component of configuration.charges) {
      const availableCharge = Math.floor(
        Number(chargeStock.get(component.chargeId) ?? 0),
      );
      const requiredCharge = Number(component.quantityPerShot) * requiredShots;
      if (availableCharge < requiredCharge) {
        reasons.push(
          `Недостатньо заряду ${component.charge.marking}: потрібно ${requiredCharge}, доступно ${availableCharge}`,
        );
      }
    }

    if (availableQuantity < requiredShots && reasons.length === 0) {
      reasons.push(
        `Недостатньо повних комплектів пострілу: потрібно ${requiredShots}, доступно ${availableQuantity}`,
      );
    }

    return reasons;
  }

  private collectRejectionReasons(
    variants: ServiceOrderSuggestionVariant[],
  ): string[] {
    return Array.from(
      new Set(variants.flatMap((item) => item.rejectionReasons)),
    );
  }

  private normalizeChargeAccountingUnit(charge: Charge): 'piece' | 'module' {
    return charge.chargeKind === 'modular' ? 'module' : 'piece';
  }

  private async findCombatDronePayloadVariants(
    airAssetPositionId: string,
    distanceM: number,
    plannedQuantity: number,
  ): Promise<ServiceOrderAirPayloadVariant[]> {
    const drones = await this.dataSource
      .getRepository(AirAssetDroneStock)
      .find({
        where: { airAssetPositionId },
      });

    const warheads = await this.dataSource
      .getRepository(AirAssetWarheadStock)
      .find({
        where: { airAssetPositionId },
      });

    const availableDrones = drones.filter((row) => {
      const quantity = Number(row.quantity || 0);
      const maxRangeM = Number(row.droneModel?.maxRangeM || 0);

      return (
        quantity >= plannedQuantity && maxRangeM > 0 && distanceM <= maxRangeM
      );
    });

    const availableWarheads = warheads.filter((row) => {
      const quantity = Number(row.quantity || 0);
      const measureUnit = row.warheadType?.measureUnit;

      if (measureUnit === 'kg') {
        return quantity > 0;
      }

      return quantity >= plannedQuantity;
    });

    const variants: ServiceOrderAirPayloadVariant[] = [];

    for (const drone of availableDrones) {
      for (const warhead of availableWarheads) {
        const maxRangeM = Number(drone.droneModel?.maxRangeM || 0);
        const warheadQuantity = Number(warhead.quantity || 0);
        const droneQuantity = Number(drone.quantity || 0);
        const availableQuantity =
          warhead.warheadType?.measureUnit === 'kg'
            ? droneQuantity
            : Math.min(droneQuantity, warheadQuantity);

        variants.push({
          droneModelId: drone.droneModelId,
          warheadTypeId: warhead.warheadTypeId,
          maxRangeM,
          rangeReserveM: maxRangeM - distanceM,
          availableQuantity,
          droneModel: drone.droneModel,
          warheadType: warhead.warheadType,
          priority: variants.length + 1,
        });
      }
    }

    return variants.sort((a, b) => {
      if (a.maxRangeM !== b.maxRangeM) {
        return a.maxRangeM - b.maxRangeM;
      }

      if (a.rangeReserveM !== b.rangeReserveM) {
        return a.rangeReserveM - b.rangeReserveM;
      }

      return b.availableQuantity - a.availableQuantity;
    });
  }

  private isTargetInsideSector(
    position: Pick<
      FirePosition | AirAssetPosition,
      'lat' | 'lng' | 'sectorLeftDegrees' | 'sectorRightDegrees'
    >,
    targetLat: number,
    targetLng: number,
  ): boolean {
    if (
      position.sectorLeftDegrees === null ||
      position.sectorRightDegrees === null
    ) {
      return true;
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
    const y = Math.sin(this.toRad(lng2 - lng1)) * Math.cos(this.toRad(lat2));

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
