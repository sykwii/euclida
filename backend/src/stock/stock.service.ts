import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { Depot } from '../depots/depot.entity';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Depot)
    private readonly depotsRepository: Repository<Depot>,

    @InjectRepository(DepotShellStock)
    private readonly shellStockRepository: Repository<DepotShellStock>,

    @InjectRepository(DepotChargeStock)
    private readonly chargeStockRepository: Repository<DepotChargeStock>,

    @InjectRepository(DepotFuzeStock)
    private readonly fuzeStockRepository: Repository<DepotFuzeStock>,

    @InjectRepository(DepotPrimerStock)
    private readonly primerStockRepository: Repository<DepotPrimerStock>,

    private readonly accessScope: AccessScopeService,
  ) {}

  async getByDepots(user: AuthUser) {
    const allowedUnitIds = await this.accessScope.getVisibleDepotUnitIds(user);
    const depotWhere = allowedUnitIds === null
      ? {}
      : allowedUnitIds.length > 0
        ? { unitId: In(allowedUnitIds) }
        : { id: In([]) };

    const depots = await this.depotsRepository.find({
      where: {
        ...depotWhere,
        isArchived: false,
      },
      relations: {
        unit: true,
        parent: true,
      },
      order: {
        name: 'ASC',
      },
    });

    const depotIds = depots.map((depot) => depot.id);

    if (depotIds.length === 0) {
      return [];
    }

    const shellStock = await this.shellStockRepository.find({
      where: {
        depotId: In(depotIds),
      },
      relations: {
        depot: true,
        shell: true,
      },
    });

    const chargeStock = await this.chargeStockRepository.find({
      where: {
        depotId: In(depotIds),
      },
      relations: {
        depot: true,
        charge: true,
      },
    });

    const fuzeStock = await this.fuzeStockRepository.find({
      where: {
        depotId: In(depotIds),
      },
      relations: {
        depot: true,
        fuze: true,
      },
    });

    const primerStock = await this.primerStockRepository.find({
      where: {
        depotId: In(depotIds),
      },
      relations: {
        depot: true,
        primer: true,
      },
    });

    return depots.map((depot) => ({
      depot,
      shells: shellStock
        .filter((item) => item.depotId === depot.id)
        .filter((item) => Number(item.quantity) > 0)
        .map((item) => ({
          id: item.shellId,
          stockId: item.id,
          marking: item.shell?.marking,
          quantity: Number(item.quantity),
        })),

      charges: chargeStock
        .filter((item) => item.depotId === depot.id)
        .filter((item) => Number(item.quantity) > 0)
        .map((item) => ({
          id: item.chargeId,
          stockId: item.id,
          marking: item.charge?.marking,
          quantity: Number(item.quantity),
        })),

      fuzes: fuzeStock
        .filter((item) => item.depotId === depot.id)
        .filter((item) => Number(item.quantity) > 0)
        .map((item) => ({
          id: item.fuzeId,
          stockId: item.id,
          marking: item.fuze?.marking,
          quantity: Number(item.quantity),
        })),

      primers: primerStock
        .filter((item) => item.depotId === depot.id)
        .filter((item) => Number(item.quantity) > 0)
        .map((item) => ({
          id: item.primerId,
          stockId: item.id,
          marking: item.primer?.marking,
          quantity: Number(item.quantity),
        })),
    }));
  }
}
