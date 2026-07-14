import { OperationalNotificationsService } from './operational-notifications.service';
import { OperationalNotification } from './operational-notification.entity';
import { ServiceOrderDelivery } from '../service-orders/service-order-delivery.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';

type RepoMock<T> = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

function createRepoMock<T>(): RepoMock<T> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id ?? 'notification-1', ...value })),
    createQueryBuilder: jest.fn(),
  };
}

describe('OperationalNotificationsService', () => {
  let notificationRepository: RepoMock<OperationalNotification>;
  let deliveryRepository: RepoMock<ServiceOrderDelivery>;
  let weaponRepository: RepoMock<WeaponSystem>;
  let service: OperationalNotificationsService;
  const realtimeEvents = { emitMany: jest.fn() };

  beforeEach(() => {
    notificationRepository = createRepoMock<OperationalNotification>();
    deliveryRepository = createRepoMock<ServiceOrderDelivery>();
    weaponRepository = createRepoMock<WeaponSystem>();
    realtimeEvents.emitMany.mockClear();

    const dataSource = {
      query: jest.fn(),
      getRepository: jest.fn((entity) => {
        if (entity === ServiceOrderDelivery) return deliveryRepository;
        if (entity === WeaponSystem) return weaponRepository;
        return createRepoMock();
      }),
    };

    service = new OperationalNotificationsService(
      notificationRepository as unknown as never,
      { getAllowedUnitIds: jest.fn(), canAccessUnit: jest.fn() } as never,
      realtimeEvents as never,
      dataSource as never,
    );
  });

  it('creates scoped new target notifications for deliveries', async () => {
    deliveryRepository.find.mockResolvedValueOnce([
      {
        id: 'delivery-1',
        serviceOrderId: 'order-1',
        recipientUnitId: 'unit-1',
        recipientLevel: 'battery',
        serviceOrder: { orderNumber: 'ВГЗ-1' },
        recipientUnit: { name: '2 сабатр' },
      },
    ]);
    notificationRepository.findOne.mockResolvedValueOnce(null);

    await service.createForDeliveries('order-1', 'actor-1');

    expect(notificationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUnitId: 'unit-1',
        type: 'new_target',
        severity: 'attention',
        entityType: 'service_order_delivery',
        entityId: 'delivery-1',
      }),
    );
    expect(realtimeEvents.emitMany).toHaveBeenCalledWith(
      ['events'],
      'created',
      expect.objectContaining({
        entity: 'operational_notification',
        unitId: 'unit-1',
        reason: 'new_target',
      }),
    );
  });

  it('does not duplicate notifications with the same source key', async () => {
    deliveryRepository.find.mockResolvedValueOnce([
      {
        id: 'delivery-1',
        serviceOrderId: 'order-1',
        recipientUnitId: 'unit-1',
        recipientLevel: 'battery',
        serviceOrder: { orderNumber: 'ВГЗ-1' },
        recipientUnit: { name: '2 сабатр' },
      },
    ]);
    notificationRepository.findOne.mockResolvedValueOnce({ id: 'existing' });

    await service.createForDeliveries('order-1', 'actor-1');

    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(realtimeEvents.emitMany).not.toHaveBeenCalled();
  });

  it('creates critical notification for weapon ready to not ready transition', async () => {
    weaponRepository.findOne.mockResolvedValueOnce({
      id: 'weapon-1',
      unitId: 'unit-1',
      readinessStatus: 'not_combat_ready',
      notReadyReason: 'breakdown',
      callsign: 'Дід',
      serialNumber: null,
      currentFirePositionId: 'fp-1',
      currentFirePosition: { name: 'Вівас' },
      updatedAt: new Date('2026-07-14T10:00:00.000Z'),
    });
    notificationRepository.findOne.mockResolvedValueOnce(null);

    await service.notifyWeaponReadinessTransition('combat_ready', 'weapon-1', 'actor-1');

    expect(notificationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUnitId: 'unit-1',
        type: 'weapon_not_ready',
        severity: 'critical',
        entityType: 'weapon_system',
        entityId: 'weapon-1',
      }),
    );
  });

  it('stays silent when weapon readiness did not change', async () => {
    weaponRepository.findOne.mockResolvedValueOnce({
      id: 'weapon-1',
      unitId: 'unit-1',
      readinessStatus: 'not_combat_ready',
    });

    await service.notifyWeaponReadinessTransition('not_combat_ready', 'weapon-1', 'actor-1');

    expect(notificationRepository.save).not.toHaveBeenCalled();
  });
});
