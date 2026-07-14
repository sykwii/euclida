import { convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeEventPayload } from '../../core/realtime.service';
import { ServiceOrder } from '../service-orders/service-order.model';
import { C2WorkspacePage } from './c2-workspace-page';

function order(id: string, overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id,
    orderNumber: `№${id}`,
    status: 'sent',
    createdByUserId: null,
    assignedUnitId: null,
    assignedScope: null,
    sentByUserId: null,
    acceptedByUserId: null,
    completedByUserId: null,
    actualQuantity: null,
    actualChargeQuantity: null,
    actualChargeModulesPerShot: null,
    targetLat: 49,
    targetLng: 36,
    targetMgrs: '36U WB 85438 79234',
    targetSettlement: null,
    taskType: 'fire',
    plannedResourceAId: null,
    plannedResourceBId: null,
    plannedQuantity: 1,
    selectedFirePositionId: null,
    executorType: 'fire_position',
    rejectionReason: null,
    rejectedByUnitName: null,
    rejectedAt: null,
    startedAt: null,
    completedAt: null,
    resultType: null,
    resultComment: null,
    createdAt: '2026-07-14T10:00:00.000Z',
    updatedAt: `2026-07-14T10:${String(Number(id) % 60).padStart(2, '0')}:00.000Z`,
    selectedFirePosition: null,
    selectedShell: null,
    selectedCharge: null,
    selectedZone: null,
    ...overrides,
  };
}

function createPage(options: { orders?: ServiceOrder[] } = {}) {
  const events$ = new Subject<RealtimeEventPayload>();
  const serviceOrders = {
    getAll: vi.fn(() => of(options.orders ?? [])),
    start: vi.fn((id: string) => of(order(id, { status: 'in_progress' }))),
    accept: vi.fn((id: string) => of(order(id, { status: 'accepted' }))),
  };
  const firePositions = {
    getAll: vi.fn(() => of([])),
    confirmReadiness: vi.fn(),
  };
  const weapons = {
    getAll: vi.fn(() => of([])),
    confirmReadiness: vi.fn(),
  };
  const notifications = {
    getAll: vi.fn(() => of([])),
    markRead: vi.fn((id: string) => of({
      id,
      type: 'new_target',
      severity: 'attention',
      title: 'Нова ціль',
      message: 'ВГЗ',
      entityType: 'service_order_delivery',
      entityId: 'delivery-1',
      actionUrl: null,
      recipientUserId: null,
      recipientUnitId: null,
      recipientLevel: null,
      sourceEventKey: 'k',
      createdAt: '2026-07-14T10:00:00.000Z',
      readAt: '2026-07-14T10:01:00.000Z',
      acknowledgedAt: null,
      actorUserId: null,
      payload: { serviceOrderId: '1' },
    })),
    acknowledge: vi.fn(),
  };
  const executionRecords = {
    list: vi.fn(() => of([])),
  };
  const realtime = {
    watchMany: vi.fn(() => events$.asObservable()),
  };
  const route = {
    queryParamMap: of(convertToParamMap({})),
  };
  const router = {
    navigate: vi.fn(),
  };
  const cdr = {
    markForCheck: vi.fn(),
  };
  const page = new C2WorkspacePage(
    serviceOrders as never,
    firePositions as never,
    weapons as never,
    notifications as never,
    executionRecords as never,
    realtime as never,
    route as never,
    router as never,
    cdr as never,
  );

  return { page, serviceOrders, firePositions, weapons, notifications, executionRecords, events$, cdr };
}

describe('C2WorkspacePage', () => {
  it('hides completed and cancelled orders by default', () => {
    const { page } = createPage({
      orders: [
        order('1', { status: 'sent' }),
        order('2', { status: 'completed' }),
        order('3', { status: 'cancelled' }),
      ],
    });

    page.ngOnInit();

    expect(page.completedOrdersCount).toBe(2);
    expect(page.flatQueue.map((item) => item.order.id)).toEqual(['1']);
    page.toggleCompletedOrders();
    expect(page.flatQueue.some((item) => item.order.id === '2')).toBe(true);
    page.ngOnDestroy();
  });

  it('limits sections to five rows and exposes hidden count', () => {
    const { page } = createPage({
      orders: Array.from({ length: 7 }, (_, index) => order(String(index + 1), { selectedFirePositionId: null })),
    });

    page.ngOnInit();

    const decision = page.queueSections.find((section) => section.key === 'decision');
    expect(decision?.visibleItems).toHaveLength(5);
    expect(decision?.hiddenCount).toBe(2);
    page.toggleSection(decision!);
    expect(page.queueSections.find((section) => section.key === 'decision')?.visibleItems).toHaveLength(7);
    page.ngOnDestroy();
  });

  it('sorts queue by severity and newest time', () => {
    const { page } = createPage({
      orders: [
        order('1', { status: 'sent', updatedAt: '2026-07-14T10:01:00.000Z' }),
        order('2', { status: 'rejected', updatedAt: '2026-07-14T10:02:00.000Z' }),
        order('3', { status: 'cancelled', updatedAt: '2026-07-14T10:03:00.000Z' }),
      ],
    });

    page.ngOnInit();
    page.toggleCompletedOrders();

    const problems = page.queueSections.find((section) => section.key === 'problems')?.visibleItems ?? [];
    expect(problems.map((item) => item.order.id)).toEqual(['3', '2']);
    page.ngOnDestroy();
  });

  it('synchronizes queue selection without reloading map data', () => {
    const { page, firePositions, weapons, executionRecords } = createPage({ orders: [order('1')] });

    page.ngOnInit();
    firePositions.getAll.mockClear();
    weapons.getAll.mockClear();
    page.selectOrder(page.orders[0]);

    expect(page.selectedOrder?.id).toBe('1');
    expect(executionRecords.list).toHaveBeenCalledWith('1');
    expect(firePositions.getAll).not.toHaveBeenCalled();
    expect(weapons.getAll).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('routes notification selection to the corresponding entity', () => {
    const { page, notifications } = createPage({ orders: [order('1')] });
    page.ngOnInit();
    page.notifications = [{
      id: 'n1',
      type: 'new_target',
      severity: 'attention',
      title: 'Нова ціль',
      message: 'ВГЗ',
      entityType: 'service_order_delivery',
      entityId: 'delivery-1',
      actionUrl: null,
      recipientUserId: null,
      recipientUnitId: null,
      recipientLevel: null,
      sourceEventKey: 'k',
      createdAt: '2026-07-14T10:00:00.000Z',
      readAt: null,
      acknowledgedAt: null,
      actorUserId: null,
      payload: { serviceOrderId: '1' },
    }];

    page.openNotification(page.notifications[0]);

    expect(notifications.markRead).toHaveBeenCalledWith('n1');
    expect(page.selectedOrder?.id).toBe('1');
    page.ngOnDestroy();
  });

  it('keeps timeline collapsed by default and limits compact events to fifteen', () => {
    const { page } = createPage({
      orders: Array.from({ length: 20 }, (_, index) =>
        order(String(index + 1), {
          status: 'completed',
          startedAt: `2026-07-14T10:${String(index).padStart(2, '0')}:00.000Z`,
          completedAt: `2026-07-14T10:${String(index + 1).padStart(2, '0')}:00.000Z`,
        }),
      ),
    });

    page.ngOnInit();

    expect(page.timelineCollapsed).toBe(true);
    expect(page.timeline.length).toBeLessThanOrEqual(15);
    page.toggleTimeline();
    expect(page.timelineCollapsed).toBe(false);
    expect(page.timeline.length).toBeGreaterThan(15);
    page.ngOnDestroy();
  });

  it('refreshes only affected widgets from realtime events', () => {
    const { page, serviceOrders, firePositions, events$ } = createPage({ orders: [order('1')] });
    page.ngOnInit();
    serviceOrders.getAll.mockClear();
    firePositions.getAll.mockClear();

    events$.next({ version: 1, scope: 'missions', entity: 'service_order', action: 'updated', id: '1' });

    expect(serviceOrders.getAll).toHaveBeenCalledTimes(1);
    expect(firePositions.getAll).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('ignores unrelated stock events to avoid full page rerender', () => {
    const { page, serviceOrders, firePositions, weapons, cdr, events$ } = createPage({ orders: [order('1')] });
    page.ngOnInit();
    serviceOrders.getAll.mockClear();
    firePositions.getAll.mockClear();
    weapons.getAll.mockClear();
    cdr.markForCheck.mockClear();

    events$.next({ version: 1, scope: 'stock', entity: 'stock_movement', action: 'created', id: 's1' });

    expect(serviceOrders.getAll).not.toHaveBeenCalled();
    expect(firePositions.getAll).not.toHaveBeenCalled();
    expect(weapons.getAll).not.toHaveBeenCalled();
    expect(cdr.markForCheck).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });
});
