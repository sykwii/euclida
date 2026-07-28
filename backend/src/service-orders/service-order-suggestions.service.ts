import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
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
import {
  compareSuggestionCandidates,
  evaluateSuggestionCandidate,
  SuggestionCandidateInput,
  SuggestionStockSnapshot,
} from './service-order-suggestion-evaluator';

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
  candidateType?:
    | 'fire_position'
    | 'standalone_weapon'
    | 'air_asset_position';
  stableId?: string;
  firePosition?: Pick<
    FirePosition,
    'id' | 'name' | 'unitId' | 'completedVgzCount'
  > & {
    unit: FirePosition['unit'];
  };
  firePositionId?: string | null;
  weaponSystemId?: string;
  weaponModelId?: string;
  callsign?: string | null;
  unitId?: string | null;
  ready?: boolean;
  score?: number;
  rank?: number;
  stockSummary?: {
    sufficient: boolean;
    requiredShots: number;
    availableShots: number;
  };
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
  rejectionReasonLabels?: string[];
}

@Injectable()
export class ServiceOrderSuggestionsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getSuggestions(
    order: ServiceOrder,
    allowedUnitIds: string[] | null = null,
  ): Promise<ServiceOrderSuggestion[]> {
    const readyStatuses = ['ready', 'combat_ready', 'ready_for_combat'];
    const plannedQuantity = Math.max(Number(order.plannedQuantity || 1), 1);
    const suggestions = await this.getArtillerySuggestions(
      order,
      allowedUnitIds,
    );

    const combatAssetsQuery = this.dataSource
      .getRepository(AirAssetPosition)
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.unit', 'unit')
      .where('asset.assetGroup = :assetGroup', { assetGroup: 'combat' })
      .andWhere(
        '(asset.readinessStatus IS NULL OR asset.readinessStatus IN (:...readyStatuses))',
        { readyStatuses },
      );
    if (allowedUnitIds !== null) {
      if (allowedUnitIds.length === 0) {
        combatAssetsQuery.andWhere('1 = 0');
      } else {
        combatAssetsQuery.andWhere('asset.unitId IN (:...allowedUnitIds)', {
          allowedUnitIds,
        });
      }
    }
    const combatAssets = await combatAssetsQuery.getMany();

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
        candidateType: 'air_asset_position',
        stableId: asset.id,
        airAssetPosition: asset,
        ready: true,
        score: 0,
        distanceM,
        completedVgzCount: 0,
        variants: [],
        payloadVariants,
      });
    }

    if (suggestions.length === 0) {
      throw new BadRequestException(
        'Немає кандидатів у дозволених підрозділах',
      );
    }

    const artillery = suggestions
      .filter((item) => item.candidateType !== 'air_asset_position')
      .sort(compareSuggestionCandidates);
    const air = suggestions
      .filter((item) => item.candidateType === 'air_asset_position')
      .sort(
        (a, b) =>
          a.distanceM - b.distanceM ||
          (a.stableId ?? '').localeCompare(b.stableId ?? ''),
      );
    return [...artillery, ...air].map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }

  private async getArtillerySuggestions(
    order: ServiceOrder,
    allowedUnitIds: string[] | null,
  ): Promise<ServiceOrderSuggestion[]> {
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    const weaponRepository = this.dataSource.getRepository(WeaponSystem);
    const weapons = await weaponRepository.find({
      where:
        allowedUnitIds === null
          ? { isArchived: false }
          : { unitId: In(allowedUnitIds), isArchived: false },
      relations: {
        weaponModel: true,
        unit: true,
        maintenances: true,
      },
      order: { callsign: 'ASC', id: 'ASC' },
    });
    const canonicalWeapons = weapons.filter(
      (weapon) =>
        weapon.currentFirePositionId &&
        weapon.deploymentStatus === 'at_fire_position',
    );
    const positionWhere =
      allowedUnitIds === null
        ? {}
        : { unitId: In(allowedUnitIds) };
    const positions = await this.dataSource.getRepository(FirePosition).find({
      where: positionWhere,
      relations: { unit: true, ammoDepot: true },
      order: { id: 'ASC' },
    });
    const positionIds = positions.map((position) => position.id);
    const activePositionIds = await this.findActiveOrderPositionIds(
      order.id,
      positionIds,
    );
    const weaponModelIds = Array.from(
      new Set(weapons.map((weapon) => weapon.weaponModelId).filter(Boolean)),
    );
    const configurations =
      weaponModelIds.length > 0
        ? await this.dataSource.getRepository(ShotConfiguration).find({
            where: { weaponModelId: In(weaponModelIds) },
            relations: {
              shell: true,
              fuze: true,
              primer: true,
              charges: { charge: true },
            },
            order: { id: 'ASC', charges: { sortOrder: 'ASC' } },
          })
        : [];
    const depotIds = Array.from(
      new Set(
        positions
          .map((position) => position.ammoDepotId)
          .filter((id): id is string => !!id),
      ),
    );
    const stockByDepot = await this.loadStockByDepot(depotIds);
    const kitsByModel = new Map<string, ShotConfiguration[]>();
    for (const configuration of configurations) {
      const items = kitsByModel.get(configuration.weaponModelId) ?? [];
      items.push(configuration);
      kitsByModel.set(configuration.weaponModelId, items);
    }
    const weaponsByPosition = new Map<string, WeaponSystem[]>();
    for (const weapon of canonicalWeapons) {
      const firePositionId = weapon.currentFirePositionId!;
      const items = weaponsByPosition.get(firePositionId) ?? [];
      items.push(weapon);
      weaponsByPosition.set(firePositionId, items);
    }

    const requiredShots = Math.max(Number(order.plannedQuantity || 1), 1);
    const result: ServiceOrderSuggestion[] = [];
    for (const position of positions) {
      if (activePositionIds.has(position.id)) {
        continue;
      }
      const assignedWeapons = (
        weaponsByPosition.get(position.id) ?? []
      ).sort((a, b) => a.id.localeCompare(b.id));
      const weapon = assignedWeapons[0] ?? null;
      result.push(
        this.buildArtillerySuggestion({
          candidateType: 'fire_position',
          position,
          weapon,
          assignedWeaponCount: assignedWeapons.length,
          order,
          requiredShots,
          configurations: weapon
            ? kitsByModel.get(weapon.weaponModelId) ?? configurations
            : configurations,
          stock: position.ammoDepotId
            ? stockByDepot.get(position.ammoDepotId)
            : undefined,
          insideScope: true,
        }),
      );
    }

    for (const weapon of weapons.filter(
      (item) => item.currentFirePositionId === null,
    )) {
      const projected = weapon as WeaponSystem & {
        lat?: number | null;
        lng?: number | null;
        ammoDepotId?: string | null;
      };
      result.push(
        this.buildArtillerySuggestion({
          candidateType: 'standalone_weapon',
          position: null,
          weapon,
          assignedWeaponCount: 0,
          order,
          requiredShots,
          configurations:
            kitsByModel.get(weapon.weaponModelId) ?? configurations,
          stock: projected.ammoDepotId
            ? stockByDepot.get(projected.ammoDepotId)
            : undefined,
          standaloneCoordinates: {
            lat: projected.lat,
            lng: projected.lng,
            depotId: projected.ammoDepotId,
          },
          insideScope: true,
        }),
      );
    }
    return result;
  }

  private async findActiveOrderPositionIds(
    orderId: string,
    positionIds: string[],
  ): Promise<Set<string>> {
    if (positionIds.length === 0) {
      return new Set();
    }

    const rows = await this.dataSource
      .getRepository(ServiceOrder)
      .createQueryBuilder('serviceOrder')
      .select('serviceOrder.selectedFirePositionId', 'firePositionId')
      .where('serviceOrder.selectedFirePositionId IN (:...positionIds)', {
        positionIds,
      })
      .andWhere('serviceOrder.status IN (:...statuses)', {
        statuses: [
          'proposed',
          'sent',
          'sent_to_division',
          'sent_to_battery',
          'accepted',
          'in_progress',
        ],
      })
      .andWhere('serviceOrder.id <> :orderId', { orderId })
      .getRawMany<{ firePositionId: string }>();

    return new Set(rows.map((row) => row.firePositionId));
  }

  private async loadStockByDepot(
    depotIds: string[],
  ): Promise<Map<string, SuggestionStockSnapshot>> {
    const result = new Map<string, SuggestionStockSnapshot>();
    for (const depotId of depotIds) {
      result.set(depotId, this.emptyStockSnapshot());
    }
    if (depotIds.length === 0) {
      return result;
    }

    const [shells, charges, fuzes, primers] = await Promise.all([
      this.dataSource
        .getRepository(DepotShellStock)
        .find({ where: { depotId: In(depotIds) } }),
      this.dataSource
        .getRepository(DepotChargeStock)
        .find({ where: { depotId: In(depotIds) } }),
      this.dataSource
        .getRepository(DepotFuzeStock)
        .find({ where: { depotId: In(depotIds) } }),
      this.dataSource
        .getRepository(DepotPrimerStock)
        .find({ where: { depotId: In(depotIds) } }),
    ]);

    for (const item of shells) {
      (result.get(item.depotId)!.shells as Map<string, number>).set(
        item.shellId,
        Number(item.quantity),
      );
    }
    for (const item of charges) {
      (result.get(item.depotId)!.charges as Map<string, number>).set(
        item.chargeId,
        Number(item.quantity),
      );
    }
    for (const item of fuzes) {
      (result.get(item.depotId)!.fuzes as Map<string, number>).set(
        item.fuzeId,
        Number(item.quantity),
      );
    }
    for (const item of primers) {
      (result.get(item.depotId)!.primers as Map<string, number>).set(
        item.primerId,
        Number(item.quantity),
      );
    }
    return result;
  }

  private buildArtillerySuggestion(args: {
    candidateType: 'fire_position' | 'standalone_weapon';
    position: FirePosition | null;
    weapon: WeaponSystem | null;
    assignedWeaponCount: number;
    order: ServiceOrder;
    requiredShots: number;
    configurations: ShotConfiguration[];
    stock?: SuggestionStockSnapshot;
    standaloneCoordinates?: {
      lat?: number | null;
      lng?: number | null;
      depotId?: string | null;
    };
    insideScope: boolean;
  }): ServiceOrderSuggestion {
    const { position, weapon } = args;
    const lat =
      args.candidateType === 'fire_position'
        ? position?.lat
        : args.standaloneCoordinates?.lat;
    const lng =
      args.candidateType === 'fire_position'
        ? position?.lng
        : args.standaloneCoordinates?.lng;
    const coordinatesValid =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Number(lat) >= -90 &&
      Number(lat) <= 90 &&
      Number(lng) >= -180 &&
      Number(lng) <= 180;
    const distanceM = coordinatesValid
      ? Math.ceil(
          this.getDistanceM(
            Number(lat),
            Number(lng),
            args.order.targetLat,
            args.order.targetLng,
          ),
        )
      : null;
    const operationalState = position
      ? deriveFirePositionOperationalState(position, weapon)
      : null;
    const explicitFirePositionBlock =
      operationalState?.reasonCode?.startsWith('fp_')
        ? operationalState.reasonLabel
        : null;
    const stock = args.stock ?? this.emptyStockSnapshot();
    const kitInputs = args.configurations.map((configuration) => ({
      id: configuration.id,
      name: configuration.name,
      weaponModelId: configuration.weaponModelId,
      isActive: configuration.isActive,
      shellId: configuration.shellId,
      fuzeId: configuration.fuzeId,
      primerId: configuration.primerId,
      maxRangeM: Number(configuration.maxRangeM),
      charges: configuration.charges.map((component) => ({
        chargeId: component.chargeId,
        marking: component.charge?.marking ?? component.chargeId,
        quantityPerShot: Number(component.quantityPerShot),
      })),
    }));
    const input: SuggestionCandidateInput = {
      candidateType: args.candidateType,
      stableId: weapon?.id ?? `fp:${position?.id ?? 'missing'}`,
      callsign: weapon?.callsign ?? position?.name ?? null,
      weaponModelId: weapon?.weaponModelId ?? null,
      weaponReadinessStatus: weapon?.readinessStatus ?? null,
      weaponReadinessLabel:
        operationalState?.reasonCode === 'weapon_not_ready'
          ? operationalState.reasonLabel
          : null,
      activeMaintenance: this.hasActiveMaintenance(weapon),
      explicitFirePositionBlock,
      assignedWeaponCount: args.assignedWeaponCount,
      insideScope: args.insideScope,
      coordinatesValid,
      hasStockDepot:
        args.candidateType === 'fire_position'
          ? Boolean(position?.ammoDepotId)
          : Boolean(args.standaloneCoordinates?.depotId),
      standalonePermitted:
        args.candidateType === 'standalone_weapon'
          ? this.isStandalonePermitted(weapon)
          : undefined,
      distanceM,
      requiredShots: args.requiredShots,
      kits: kitInputs,
      stock,
    };
    const evaluated = evaluateSuggestionCandidate(input);
    const evaluatedById = new Map(
      evaluated.kits.map((kit) => [kit.id, kit]),
    );
    const compatibleKits = args.configurations
      .filter(
        (configuration) =>
          evaluatedById.get(configuration.id)?.rejections.length === 0,
      )
      .map((configuration, index) =>
        this.mapSuggestionVariant(
          configuration,
          evaluatedById.get(configuration.id)!.availableShots,
          evaluated.distanceM,
          index + 1,
        ),
      );
    const stableId = input.stableId;

    return {
      executorType: 'fire_position',
      candidateType: args.candidateType,
      stableId,
      firePosition: position
        ? {
            id: position.id,
            name: position.name,
            unitId: position.unitId,
            completedVgzCount: position.completedVgzCount,
            unit: position.unit,
          }
        : undefined,
      firePositionId: position?.id ?? null,
      weaponSystemId: weapon?.id,
      weaponModelId: weapon?.weaponModelId,
      callsign: input.callsign,
      unitId: weapon?.unitId ?? position?.unitId ?? null,
      ready: evaluated.ready,
      score: evaluated.score,
      stockSummary: {
        sufficient: evaluated.stockSufficient,
        requiredShots: args.requiredShots,
        availableShots: evaluated.availableShots,
      },
      weapon: weapon
        ? {
            id: weapon.id,
            callsign: weapon.callsign,
            serialNumber: weapon.serialNumber,
            model: {
              id: weapon.weaponModel.id,
              name: weapon.weaponModel.name,
            },
          }
        : undefined,
      readiness: {
        status: evaluated.ready ? 'combat_ready' : 'not_combat_ready',
        reason: evaluated.rejections[0]?.label ?? null,
      },
      stockSufficient: evaluated.stockSufficient,
      compatibleKits,
      distanceM: evaluated.distanceM,
      completedVgzCount: position?.completedVgzCount ?? 0,
      variants: compatibleKits,
      rejectionReasons: evaluated.rejections.map((item) => item.code),
      rejectionReasonLabels: evaluated.rejections.map((item) => item.label),
    };
  }

  private mapSuggestionVariant(
    configuration: ShotConfiguration,
    availableQuantity: number,
    distanceM: number,
    priority: number,
  ): ServiceOrderSuggestionVariant {
    const primaryCharge = configuration.charges[0];
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
      rangeReserveM: Math.max(Number(configuration.maxRangeM) - distanceM, 0),
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
      priority,
      rejectionReasons: [],
    };
  }

  private emptyStockSnapshot(): SuggestionStockSnapshot {
    return {
      shells: new Map<string, number>(),
      charges: new Map<string, number>(),
      fuzes: new Map<string, number>(),
      primers: new Map<string, number>(),
    };
  }

  private hasActiveMaintenance(weapon: WeaponSystem | null): boolean {
    if (!weapon) {
      return false;
    }
    return (weapon.maintenances ?? []).some(
      (item) => item.status === 'opened' || item.status === 'in_progress',
    );
  }

  private isStandalonePermitted(weapon: WeaponSystem | null): boolean {
    const type = weapon?.weaponModel?.systemType?.toLowerCase();
    return ['self_propelled', 'mlrs', 'mobile', 'standalone'].includes(
      type ?? '',
    );
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
