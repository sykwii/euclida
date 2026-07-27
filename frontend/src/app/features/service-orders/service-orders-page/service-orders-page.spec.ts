import { Subject } from 'rxjs';
import { ServiceOrder } from '../service-order.model';
import { ServiceOrderSuggestion, ServiceOrderSuggestionVariant } from '../service-orders.service';
import { ServiceOrdersPage } from './service-orders-page';

function makeOrder(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: 'order-1',
    orderNumber: 'ВГЗ-001',
    status: 'draft',
    createdByUserId: 'user-main',
    assignedUnitId: null,
    assignedScope: null,
    sentByUserId: null,
    acceptedByUserId: null,
    completedByUserId: null,
    actualQuantity: null,
    actualChargeQuantity: null,
    actualChargeModulesPerShot: null,
    targetLat: 50,
    targetLng: 30,
    targetMgrs: null,
    targetSettlement: 'Район 1',
    taskType: 'suppression',
    plannedResourceAId: null,
    plannedResourceBId: null,
    plannedQuantity: 4,
    selectedFirePositionId: null,
    selectedShellId: null,
    selectedChargeId: null,
    selectedZoneId: null,
    selectedShotConfigurationId: null,
    rejectionReason: null,
    rejectedByUnitName: null,
    rejectedAt: null,
    startedAt: null,
    completedAt: null,
    resultType: null,
    resultComment: null,
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-07-15T08:00:00.000Z',
    selectedFirePosition: null,
    selectedShell: null,
    selectedCharge: null,
    selectedZone: null,
    ...overrides,
  };
}

function makePage(
  service: Record<string, unknown> = {},
  executionRecords: Record<string, unknown> = {},
): ServiceOrdersPage {
  const page = new ServiceOrdersPage(
    service as never,
    { detectChanges: vi.fn(), markForCheck: vi.fn() } as never,
    { queryParamMap: new Subject() } as never,
    { events: new Subject(), navigate: vi.fn() } as never,
    { show: vi.fn() } as never,
    { add: vi.fn() } as never,
    { getUser: vi.fn() } as never,
    { watch: vi.fn() } as never,
    {} as never,
    {} as never,
    executionRecords as never,
    {} as never,
  );
  page.deliveries = [];
  page.suggestions = [];
  return page;
}

function assignMainUser(page: ServiceOrdersPage): void {
  page.currentUser = { id: 'user-main', role: 'admin', scope: 'main', unitId: null } as never;
}

function assignExecutor(page: ServiceOrdersPage): void {
  page.currentUser = { id: 'user-battery', role: 'operator', scope: 'battery', unitId: 'unit-1' } as never;
}

function makeKit(id: string): ServiceOrderSuggestionVariant {
  return {
    weaponModelId: 'model-1',
    shotConfigurationId: id,
    shotConfigurationName: `Комплект ${id}`,
    shellId: 'shell-1',
    chargeId: 'charge-1',
    zoneId: null,
    zoneNumber: 6,
    fuzeId: 'fuze-1',
    primerId: 'primer-1',
    maxRangeM: 17000,
    rangeReserveM: 8000,
    availableQuantity: 20,
    priority: 1,
    shell: { id: 'shell-1', marking: 'M107' },
    charge: { id: 'charge-1', marking: 'M119' },
    fuze: { id: 'fuze-1', marking: 'DM84' },
    primer: { id: 'primer-1', marking: 'M100' },
    charges: [],
  };
}

function makeSuggestion(weaponSystemId: string, kits: ServiceOrderSuggestionVariant[]): ServiceOrderSuggestion {
  return {
    executorType: 'fire_position',
    firePositionId: 'fp-1',
    weaponSystemId,
    weapon: {
      id: weaponSystemId,
      callsign: weaponSystemId,
      serialNumber: null,
      model: { id: 'model-1', name: 'M777' },
    },
    readiness: { status: 'combat_ready', reason: null },
    stockSufficient: kits.length > 0,
    firePosition: {
      id: 'fp-1',
      name: 'ВП-1',
      readinessStatus: 'ready',
      completedVgzCount: 0,
    },
    distanceM: 9000,
    completedVgzCount: 0,
    variants: kits,
    compatibleKits: kits,
  };
}

describe('ServiceOrdersPage contextual primary action', () => {
  it('maps draft selection and send prerequisites to one next action', () => {
    const page = makePage();
    assignMainUser(page);

    expect(page.getPrimaryAction(makeOrder())).toMatchObject({
      type: 'choose_executor',
      label: 'Підібрати виконавця',
      visualVariant: 'cyan',
      disabledReason: 'Не вибрано виконавця',
    });

    const selectedPosition = makeOrder({
      status: 'proposed',
      selectedFirePositionId: 'fp-1',
      selectedFirePosition: { id: 'fp-1', name: 'ВП-1' },
    });
    expect(page.getPrimaryAction(selectedPosition)).toMatchObject({
      type: 'choose_kit',
      label: 'Обрати комплект',
      disabledReason: 'Не вибрано комплект пострілу',
    });

    const selectedKit = makeOrder({
      ...selectedPosition,
      selectedShotConfigurationId: 'kit-1',
      selectedShellId: 'shell-1',
      selectedChargeId: 'charge-1',
    });
    expect(page.getPrimaryAction(selectedKit)).toMatchObject({
      type: 'send',
      label: 'Відправити на ПУВБ',
      visualVariant: 'blue',
    });
  });

  it('maps recipient and execution states for an authorized executor', () => {
    const page = makePage();
    assignExecutor(page);
    const assigned = { assignedUnitId: 'unit-1' };

    expect(page.getPrimaryAction(makeOrder({ ...assigned, status: 'sent' }))).toMatchObject({
      type: 'accept',
      label: 'Прийняти',
      visualVariant: 'green',
    });
    expect(page.getPrimaryAction(makeOrder({ ...assigned, status: 'accepted' }))).toMatchObject({
      type: 'start',
      label: 'Почати виконання',
    });

    const active = makeOrder({ ...assigned, status: 'in_progress' });
    expect(page.getPrimaryAction(active)).toMatchObject({ type: 'add_execution', label: 'Додати виконання' });

    page.executionRecordsByOrderId[active.id] = [{ id: 'draft-1', status: 'draft' } as never];
    expect(page.getPrimaryAction(active)).toMatchObject({
      type: 'continue_execution',
      label: 'Продовжити виконання',
      visualVariant: 'amber',
    });

    page.executionRecordsByOrderId[active.id] = [{ id: 'posted-1', status: 'posted' } as never];
    expect(page.getPrimaryAction(active)).toMatchObject({
      type: 'complete',
      label: 'Завершити ВГЗ',
      visualVariant: 'green',
    });
  });

  it('hides unauthorized and terminal actions', () => {
    const page = makePage();
    page.currentUser = { id: 'viewer', role: 'operator', scope: 'division', unitId: 'other' } as never;

    expect(page.getPrimaryAction(makeOrder())).toBeNull();
    expect(page.getPrimaryAction(makeOrder({ status: 'sent', assignedUnitId: 'unit-1' }))).toBeNull();

    assignMainUser(page);
    for (const status of ['completed', 'cancelled', 'rejected']) {
      expect(page.getPrimaryAction(makeOrder({ status }))).toBeNull();
    }
  });

  it('prevents a repeated network action while the first request is in flight', () => {
    const request = new Subject<ServiceOrder>();
    const sendToUnit = vi.fn(() => request.asObservable());
    const page = makePage({ sendToUnit });
    assignMainUser(page);
    const order = makeOrder({ status: 'proposed' });

    page.sendToUnit(order);
    page.sendToUnit(order);

    expect(sendToUnit).toHaveBeenCalledTimes(1);
    expect(page.workflowActionOrderId).toBe(order.id);
    request.complete();
    expect(page.workflowActionOrderId).toBeNull();
  });

  it('moves executor to kit to send and clears an incompatible kit when executor changes', () => {
    const page = makePage();
    assignMainUser(page);
    const order = makeOrder();
    const first = makeSuggestion('weapon-1', [makeKit('kit-1'), makeKit('kit-2')]);
    const second = makeSuggestion('weapon-2', [makeKit('kit-3'), makeKit('kit-4')]);

    page.selectExecutor(order, first);
    expect(page.getPrimaryAction(order)).toMatchObject({ type: 'choose_kit' });
    page.selectSuggestion(order, first, first.compatibleKits![0]);
    expect(page.getPrimaryAction(order)).toMatchObject({ type: 'send' });

    page.selectExecutor(order, second);
    expect(page.selectedKitByOrderId[order.id]).toBeUndefined();
    expect(page.getPrimaryAction(order)).toMatchObject({ type: 'choose_kit' });
  });

  it('preselects a sole compatible kit and keeps manual fallback visible without kits', () => {
    const page = makePage();
    assignMainUser(page);
    const order = makeOrder();
    const oneKit = makeSuggestion('weapon-1', [makeKit('kit-1')]);

    page.selectExecutor(order, oneKit);
    expect(page.selectedKitByOrderId[order.id]?.shotConfigurationId).toBe('kit-1');
    expect(page.getPrimaryAction(order)).toMatchObject({ type: 'send' });

    const noKit = makeSuggestion('weapon-2', []);
    page.selectExecutor(order, noKit);
    expect(page.getPrimaryAction(order)).toMatchObject({
      type: 'choose_kit',
      disabledReason: 'Немає сумісного комплекту пострілу',
    });
  });

  it('preserves the expanded order and local selection through a realtime reconciliation', () => {
    const page = makePage();
    const order = makeOrder();
    page.selectedDetailsOrderId = order.id;
    page.selectedOrderId = order.id;
    page.selectedExecutorByOrderId[order.id] = makeSuggestion('weapon-1', [makeKit('kit-1')]);

    (page as unknown as { syncOpenOrderReferences: (items: ServiceOrder[]) => void })
      .syncOpenOrderReferences([{ ...order, updatedAt: '2026-07-27T10:00:00.000Z' }]);

    expect(page.selectedDetailsOrderId).toBe(order.id);
    expect(page.selectedOrderId).toBe(order.id);
    expect(page.selectedExecutorByOrderId[order.id]?.weaponSystemId).toBe('weapon-1');
  });

  it('ignores an older journal response after a newer targeted load', () => {
    const stale = new Subject<never[]>();
    const fresh = new Subject<never[]>();
    const list = vi
      .fn()
      .mockReturnValueOnce(stale.asObservable())
      .mockReturnValueOnce(fresh.asObservable());
    const page = makePage({}, { list });
    const order = makeOrder({ status: 'in_progress' });
    const draft = { id: 'draft-1', status: 'draft' } as never;

    page.loadExecutionRecords(order);
    page.executionLoadRequestByOrderId[order.id] += 1;
    page.executionLoadingByOrderId[order.id] = false;
    page.executionRecordsByOrderId[order.id] = [draft];
    page.loadExecutionRecords(order);
    fresh.next([draft]);
    stale.next([]);

    expect(page.executionRecordsByOrderId[order.id]).toEqual([draft]);
  });
});

describe('ServiceOrdersPage row action overlay', () => {
  it('prefers below placement and flips above near the viewport edge', () => {
    const page = makePage();
    expect(page.actionsMenuPositions[0]).toMatchObject({ originY: 'bottom', overlayY: 'top' });
    expect(page.actionsMenuPositions[1]).toMatchObject({ originY: 'top', overlayY: 'bottom' });
  });

  it('keeps only one menu open and closes on Escape', () => {
    const page = makePage();
    const firstTrigger = document.createElement('button');
    const secondTrigger = document.createElement('button');
    document.body.append(firstTrigger, secondTrigger);
    const eventFor = (trigger: HTMLButtonElement) =>
      ({ currentTarget: trigger, stopPropagation: vi.fn() }) as unknown as MouseEvent;

    page.toggleActions(makeOrder({ id: 'first' }), {} as never, eventFor(firstTrigger));
    page.toggleActions(makeOrder({ id: 'second' }), {} as never, eventFor(secondTrigger));
    expect(page.openedActionsOrderId).toBe('second');

    const escape = new KeyboardEvent('keydown', { key: 'Escape' });
    page.onActionsKeydown(escape);
    expect(page.openedActionsOrderId).toBeNull();
    firstTrigger.remove();
    secondTrigger.remove();
  });

  it('exposes a single contextual action model rather than independent workflow flags', () => {
    const page = makePage();
    assignMainUser(page);
    const action = page.getPrimaryAction(makeOrder());

    expect(action && Object.keys(action).sort()).toEqual(
      ['type', 'label', 'visualVariant', 'disabled', 'disabledReason', 'loading', 'handler'].sort(),
    );
  });
});
