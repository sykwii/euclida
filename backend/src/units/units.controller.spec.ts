import { ForbiddenException } from '@nestjs/common';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

describe('UnitsController scope isolation', () => {
  const main = { id: 'main', parentId: null };
  const divisionA = { id: 'division-a', parentId: 'main' };
  const batteryA = { id: 'battery-a', parentId: 'division-a' };
  const divisionB = { id: 'division-b', parentId: 'main' };
  const batteryB = { id: 'battery-b', parentId: 'division-b' };
  const user = {
    sub: 'user-a',
    login: 'operator-a',
    role: 'operator',
    scope: 'battery',
    unitId: 'battery-a',
  } as AuthUser;

  function controller() {
    return new UnitsController(
      {
        findAll: jest
          .fn()
          .mockResolvedValue([main, divisionA, batteryA, divisionB, batteryB]),
      } as unknown as UnitsService,
      {
        getAllowedUnitIds: jest.fn().mockResolvedValue(['battery-a']),
      } as unknown as AccessScopeService,
    );
  }

  it('returns the own unit and its ancestors without sibling units', async () => {
    await expect(controller().findAll(user)).resolves.toEqual([
      main,
      divisionA,
      batteryA,
    ]);
  });

  it('rejects direct access to a foreign unit ID', async () => {
    await expect(
      controller().findOne('battery-b', user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
