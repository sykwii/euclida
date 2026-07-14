import { EMPTY, of } from 'rxjs';
import { RealtimeService } from '../../core/realtime.service';
import {
  OperationalNotification,
  OperationalNotificationsService,
} from './operational-notifications.service';
import { OperationalNotificationOverlayComponent } from './operational-notification-overlay.component';

function notification(id: string): OperationalNotification {
  return {
    id,
    recipientUserId: null,
    recipientUnitId: 'unit-1',
    recipientLevel: 'battery',
    type: 'new_target',
    severity: 'attention',
    title: 'Нова ціль',
    message: 'Надійшла ВГЗ',
    entityType: 'service_order_delivery',
    entityId: `delivery-${id}`,
    actionUrl: null,
    sourceEventKey: `key-${id}`,
    createdAt: '2026-07-14T10:00:00.000Z',
    readAt: null,
    acknowledgedAt: null,
    actorUserId: null,
    payload: {},
  };
}

describe('OperationalNotificationOverlayComponent', () => {
  it('shows maximum three cards and overflow count', () => {
    const service = {
      getAll: () => of([notification('1'), notification('2'), notification('3'), notification('4')]),
      getById: () => of(notification('5')),
      markRead: () => of(notification('1')),
      acknowledge: () => of(notification('1')),
    } as unknown as OperationalNotificationsService;
    const realtime = {
      watchMany: () => EMPTY,
    } as unknown as RealtimeService;
    const router = {
      navigate: () => Promise.resolve(true),
      navigateByUrl: () => Promise.resolve(true),
    };

    const component = new OperationalNotificationOverlayComponent(
      service,
      realtime,
      router as never,
    );

    component.ngOnInit();

    expect(component.visible).toHaveLength(3);
    expect(component.overflowCount).toBe(1);

    component.ngOnDestroy();
  });
});
