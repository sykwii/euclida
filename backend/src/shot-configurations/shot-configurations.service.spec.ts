import { BadRequestException } from '@nestjs/common';
import type { ShotConfiguration } from './shot-configuration.entity';
import { ShotConfigurationsService } from './shot-configurations.service';

describe('ShotConfigurationsService', () => {
  function createService() {
    const repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => ({
        id: value.id ?? 'config-1',
        ...value,
      })),
      remove: jest.fn(),
    };
    const chargeRepository = {
      delete: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const weaponModelRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'weapon-1', name: '2С3' }),
    };
    const shellRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'shell-1', marking: 'ОФ-1' }),
    };
    const fuzeRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'fuze-1', marking: 'В-90' }),
    };
    const primerRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'primer-1', marking: 'КВ-4' }),
    };
    const chargesRepository = {
      find: jest.fn().mockImplementation(
        async ({
          where,
        }: {
          where: { id: string[] | { value?: string[] } };
        }) => {
          const ids = Array.isArray(where.id) ? where.id : where.id.value ?? [];
          return ids.map((id) => ({
            id,
            marking: id === 'charge-module' ? 'М1' : 'Г-1',
            chargeKind: id === 'charge-module' ? 'modular' : 'unit',
          }));
        },
      ),
    };
    const realtimeEvents = {
      emitMany: jest.fn(),
    };

    const service = new ShotConfigurationsService(
      repository as never,
      chargeRepository as never,
      weaponModelRepository as never,
      shellRepository as never,
      fuzeRepository as never,
      primerRepository as never,
      chargesRepository as never,
      realtimeEvents as never,
    );

    return {
      service,
      mocks: {
        repository,
        chargeRepository,
        chargesRepository,
      },
    };
  }

  function createExistingConfiguration(): ShotConfiguration {
    return {
      id: 'config-1',
      name: 'Комплект 1',
      weaponModelId: 'weapon-1',
      shellId: 'shell-1',
      fuzeId: null,
      primerId: null,
      zoneId: null,
      zoneNumber: null,
      maxRangeM: 12000,
      isActive: false,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      weaponModel: { id: 'weapon-1', name: '2С3' } as never,
      shell: { id: 'shell-1', marking: 'ОФ-1' } as never,
      fuze: null,
      primer: null,
      charges: [
        {
          id: 'row-1',
          shotConfigurationId: 'config-1',
          chargeId: 'charge-piece',
          accountingUnit: 'piece',
          quantityPerShot: 1,
          sortOrder: 0,
          charge: {
            id: 'charge-piece',
            marking: 'Г-1',
            chargeKind: 'unit',
          },
        } as never,
      ],
    } as ShotConfiguration;
  }

  it('saves accounting units for mixed charge composition', async () => {
    const { service, mocks } = createService();
    mocks.repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'config-1',
        name: 'Комплект 1',
        weaponModelId: 'weapon-1',
        shellId: 'shell-1',
        fuzeId: 'fuze-1',
        primerId: 'primer-1',
        zoneId: null,
        zoneNumber: 3,
        maxRangeM: 12000,
        isActive: true,
        note: null,
        charges: [
          {
            chargeId: 'charge-piece',
            accountingUnit: 'piece',
            quantityPerShot: 1,
            sortOrder: 0,
            charge: { id: 'charge-piece', marking: 'Г-1', chargeKind: 'unit' },
          },
          {
            chargeId: 'charge-module',
            accountingUnit: 'module',
            quantityPerShot: 2,
            sortOrder: 1,
            charge: { id: 'charge-module', marking: 'М1', chargeKind: 'modular' },
          },
        ],
        weaponModel: { id: 'weapon-1', name: '2С3' },
        shell: { id: 'shell-1', marking: 'ОФ-1' },
        fuze: { id: 'fuze-1', marking: 'В-90' },
        primer: { id: 'primer-1', marking: 'КВ-4' },
      });

    await service.create({
      name: 'Комплект 1',
      weaponModelId: 'weapon-1',
      shellId: 'shell-1',
      fuzeId: 'fuze-1',
      primerId: 'primer-1',
      zoneNumber: 3,
      maxRangeM: 12000,
      isActive: true,
      note: null,
      charges: [
        {
          chargeId: 'charge-piece',
          quantityPerShot: 1,
          accountingUnit: 'piece',
          sortOrder: 0,
        },
        {
          chargeId: 'charge-module',
          quantityPerShot: 2,
          accountingUnit: 'module',
          sortOrder: 1,
        },
      ],
    });

    expect(mocks.chargeRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        chargeId: 'charge-piece',
        accountingUnit: 'piece',
        quantityPerShot: 1,
      }),
      expect.objectContaining({
        chargeId: 'charge-module',
        accountingUnit: 'module',
        quantityPerShot: 2,
      }),
    ]);
  });

  it('rejects activation of incomplete legacy configuration', async () => {
    const { service, mocks } = createService();
    mocks.repository.findOne.mockResolvedValue(createExistingConfiguration());

    await expect(service.activate('config-1', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects mismatched accounting unit for modular charge', async () => {
    const { service, mocks } = createService();
    mocks.repository.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        name: 'Комплект 2',
        weaponModelId: 'weapon-1',
        shellId: 'shell-1',
        fuzeId: 'fuze-1',
        primerId: 'primer-1',
        zoneNumber: 4,
        maxRangeM: 15000,
        isActive: true,
        note: null,
        charges: [
          {
            chargeId: 'charge-module',
            quantityPerShot: 1,
            accountingUnit: 'piece',
            sortOrder: 0,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
