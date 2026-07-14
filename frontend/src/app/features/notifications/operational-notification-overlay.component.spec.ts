import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeEventPayload, RealtimeService } from '../../core/realtime.service';
import {
  OperationalNotification,
  OperationalNotificationsService,
} from './operational-notifications.service';
import { OperationalNotificationOverlayComponent } from './operational-notification-overlay.component';

function notification(
  id: string,
  overrides: Partial<OperationalNotification> = {},
): OperationalNotification {
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
    payload: { orderNumber: '№1452', targetMgrs: '36U WB 85438 79234' },
    ...overrides,
  };
}

function createComponent(options: {
  initial?: OperationalNotification[];
  byId?: Record<string, OperationalNotification>;
} = {}) {
  const events$ = new Subject<RealtimeEventPayload>();
  const service = {
    getAll: () => of(options.initial ?? []),
    getById: (id: string) => of(options.byId?.[id] ?? notification(id)),
    markRead: (id: string) => of(notification(id, { readAt: '2026-07-14T10:01:00.000Z' })),
    acknowledge: (id: string) =>
      of(notification(id, { acknowledgedAt: '2026-07-14T10:01:00.000Z' })),
  } as unknown as OperationalNotificationsService;
  const realtime = {
    watchMany: () => events$.asObservable(),
  } as unknown as RealtimeService;
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
    navigateByUrl: vi.fn().mockResolvedValue(true),
  };
  const cdr = { markForCheck: vi.fn() };
  const component = new OperationalNotificationOverlayComponent(
    service,
    realtime,
    router as never,
    cdr as never,
  );

  return { component, events$, router };
}

describe('OperationalNotificationOverlayComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows maximum three cards and overflow count', () => {
    const { component } = createComponent({
      initial: [notification('1'), notification('2'), notification('3'), notification('4')],
    });

    component.ngOnInit();

    expect(component.visible).toHaveLength(3);
    expect(component.overflowCount).toBe(1);

    component.ngOnDestroy();
  });

  it('localizes target content without raw ids', () => {
    const { component } = createComponent({ initial: [notification('1')] });

    component.ngOnInit();

    const card = component.visible[0];
    expect(component.typeLabel(card.item)).toBe('Нова ціль');
    expect(component.entityLine(card.item)).toBe('ВГЗ №1452');
    expect(component.contextLine(card.item)).toBe('36U WB 85438 79234');

    component.ngOnDestroy();
  });

  it('routes primary action to actionUrl', () => {
    const item = notification('1', { actionUrl: '/notifications?deliveryId=delivery-1' });
    const { component, router } = createComponent({ initial: [item] });

    component.ngOnInit();
    component.open(item);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/notifications?deliveryId=delivery-1');
    component.ngOnDestroy();
  });

  it('stacks duplicate entity/type events within two seconds', () => {
    const duplicate = notification('2', {
      entityId: 'delivery-1',
      sourceEventKey: 'key-2',
    });
    const { component, events$ } = createComponent({
      initial: [notification('1', { entityId: 'delivery-1' })],
      byId: { '2': duplicate },
    });

    component.ngOnInit();
    events$.next({
      version: 1,
      scope: 'events',
      entity: 'operational_notification',
      action: 'created',
      id: '2',
    });

    expect(component.visible[0].stackCount).toBe(2);
    component.ngOnDestroy();
  });

  it('does not hide critical cards on Escape', () => {
    const { component } = createComponent({
      initial: [notification('1', { severity: 'critical', type: 'weapon_not_ready' })],
    });

    component.ngOnInit();
    component.closeTransient();

    expect(component.visible).toHaveLength(1);
    component.ngOnDestroy();
  });

  it('hides info cards after timeout', () => {
    vi.useFakeTimers();
    const { component } = createComponent({
      initial: [notification('1', { severity: 'info', type: 'weapon_ready' })],
    });

    component.ngOnInit();
    vi.advanceTimersByTime(5000);

    expect(component.visible).toHaveLength(0);
    component.ngOnDestroy();
  });

  it('ignores unrelated realtime scopes', () => {
    const { component, events$ } = createComponent({ initial: [] });

    component.ngOnInit();
    events$.next({
      version: 1,
      scope: 'stock',
      entity: 'stock_movement',
      action: 'created',
      id: 'stock-1',
    });

    expect(component.visible).toHaveLength(0);
    component.ngOnDestroy();
  });
});
