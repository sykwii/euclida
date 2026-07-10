import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/auth-user.types';
import { Unit } from '../units/unit.entity';

@Injectable()
export class AccessScopeService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,
  ) {}

  async getAllowedUnitIds(user: AuthUser): Promise<string[] | null> {
    if (user.role === 'admin' || user.scope === 'main') {
      return null;
    }

    if (!user.unitId) {
      return [];
    }

    if (user.scope === 'battery' || user.scope === 'ew') {
      return [user.unitId];
    }

    if (user.scope === 'division') {
      const childUnits = await this.unitsRepository.find({
        where: {
          parentId: user.unitId,
        },
      });

      return [user.unitId, ...childUnits.map((unit) => unit.id)];
    }

    return [];
  }

  async getVisibleDepotUnitIds(user: AuthUser): Promise<string[] | null> {
    const allowedUnitIds = await this.getAllowedUnitIds(user);

    if (allowedUnitIds === null) {
      return null;
    }

    if (!user.unitId) {
      return [];
    }

    const ids = new Set(allowedUnitIds);
    const ownUnit = await this.unitsRepository.findOne({
      where: {
        id: user.unitId,
      },
    });

    if (ownUnit?.parentId) {
      ids.add(ownUnit.parentId);
    }

    return Array.from(ids);
  }

  async canAccessUnit(
    user: AuthUser,
    unitId: string | null | undefined,
  ): Promise<boolean> {
    if (!unitId) {
      return false;
    }

    const allowedUnitIds = await this.getAllowedUnitIds(user);

    if (allowedUnitIds === null) {
      return true;
    }

    return allowedUnitIds.includes(unitId);
  }

  canWrite(user: AuthUser): boolean {
    return user.role === 'admin' || user.role === 'operator';
  }

  canOnlyRead(user: AuthUser): boolean {
    return user.role === 'observer';
  }
}
