import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RealtimeService } from '../../core/realtime.service';
import { ExecutionRecordsService } from '../service-orders/execution-records.service';
import { ExecutionRecord } from '../service-orders/execution-record.model';
import { FirePosition } from '../fire-positions/fire-position.model';
import { FirePositionsService } from '../fire-positions/fire-positions.service';
import { MapPage } from '../map/map-page/map-page';
import {
  OperationalNotification,
  OperationalNotificationsService,
} from '../notifications/operational-notifications.service';
import { ServiceOrder } from '../service-orders/service-order.model';
import { ServiceOrdersService } from '../service-orders/service-orders.service';
import { WeaponSystem } from '../weapon-systems/weapon-system.model';
import { WeaponSystemsService } from '../weapon-systems/weapon-systems.service';

type QueueSectionKey = 'new_target' | 'decision' | 'working' | 'problems';
type SelectedEntityType = 'target' | 'weapon' | 'fire_position';
type TimelineType =
  | 'target_received'
  | 'target_accepted'
  | 'weapon_moved'
  | 'fp_ready'
  | 'weapon_ready'
  | 'fire_started'
  | 'fire_completed'
  | 'maintenance_started'
  | 'maintenance_completed';
type Tone = 'critical' | 'action' | 'ready' | 'progress' | 'neutral';

interface QueueSection {
  key: QueueSectionKey;
  title: string;
  items: QueueItem[];
}

interface QueueItem {
  id: string;
  order: ServiceOrder;
  priority: Tone;
  targetNumber: string;
  weaponOrFp: string;
  time: string;
  status: string;
  section: QueueSectionKey;
}

interface SelectedEntity {
  type: SelectedEntityType;
  id: string;
}

interface TimelineItem {
  id: string;
  type: TimelineType;
  tone: Tone;
  title: string;
  context: string;
  at: string;
}

@Component({
  selector: 'app-c2-workspace-page',
  standalone: true,
  imports: [CommonModule, DatePipe, MapPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './c2-workspace-page.html',
  styleUrl: './c2-workspace-page.css',
})
export class C2WorkspacePage implements OnInit, OnDestroy {
  orders: ServiceOrder[] = [];
  firePositions: FirePosition[] = [];
  weapons: WeaponSystem[] = [];
  notifications: OperationalNotification[] = [];
  executionRecords: ExecutionRecord[] = [];
  selected: SelectedEntity | null = null;
  focusedQueueIndex = 0;
  timelineCollapsed = false;
  isLoading = false;
  errorMessage = '';

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly serviceOrders: ServiceOrdersService,
    private readonly firePositionsService: FirePositionsService,
    private readonly weaponSystemsService: WeaponSystemsService,
    private readonly notificationsService: OperationalNotificationsService,
    private readonly executionRecordsService: ExecutionRecordsService,
    private readonly realtime: RealtimeService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadWorkspace();
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const orderId = params.get('orderId') || params.get('serviceOrderId');
        const deliveryId = params.get('deliveryId');
        const weaponId = params.get('weaponId');
        const firePositionId = params.get('firePositionId');

        if (orderId) {
          this.selectEntity({ type: 'target', id: orderId });
        } else if (deliveryId) {
          this.selectDelivery(deliveryId);
        } else if (weaponId) {
          this.selectEntity({ type: 'weapon', id: weaponId });
        } else if (firePositionId) {
          this.selectEntity({ type: 'fire_position', id: firePositionId });
        }
      }),
    );
    this.subscriptions.add(
      this.realtime.watchMany(['missions', 'events']).subscribe((event) => {
        if (event.entity === 'operational_notification' && event.action === 'created') {
          this.loadNotifications();
          return;
        }

        if (event.scope === 'missions') {
          this.loadOrders();
        }
      }),
    );
    this.subscriptions.add(
      this.realtime.watchMany(['map', 'weapons']).subscribe((event) => {
        if (event.entity === 'weapon_system' || event.scope === 'weapons') {
          this.loadWeapons();
        }

        if (event.entity === 'fire_position' || event.scope === 'map') {
          this.loadFirePositions();
        }
      }),
    );
    this.subscriptions.add(
      this.realtime.watchMany(['all']).subscribe((event) => {
        if (event.entity === 'system' && event.reason === 'reconnect') {
          this.loadWorkspace();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  closePanel(): void {
    this.selected = null;
    this.executionRecords = [];
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.arrowdown', ['$event'])
  moveQueueDown(event: Event): void {
    this.moveQueueFocus(1);
    event.preventDefault();
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  moveQueueUp(event: Event): void {
    this.moveQueueFocus(-1);
    event.preventDefault();
  }

  @HostListener('document:keydown.enter')
  openFocusedQueueItem(): void {
    const item = this.flatQueue[this.focusedQueueIndex];
    if (item) {
      this.selectOrder(item.order);
    }
  }

  get queueSections(): QueueSection[] {
    const sections: QueueSection[] = [
      { key: 'new_target', title: 'Нова ціль', items: [] },
      { key: 'decision', title: 'Потребує рішення', items: [] },
      { key: 'working', title: 'В роботі', items: [] },
      { key: 'problems', title: 'Проблеми', items: [] },
    ];

    for (const order of this.orders) {
      const item = this.toQueueItem(order);
      sections.find((section) => section.key === item.section)?.items.push(item);
    }

    return sections;
  }

  get flatQueue(): QueueItem[] {
    return this.queueSections.flatMap((section) => section.items);
  }

  get selectedOrder(): ServiceOrder | null {
    if (this.selected?.type !== 'target') {
      return null;
    }

    return this.orders.find((order) => order.id === this.selected?.id) ?? null;
  }

  get selectedWeapon(): WeaponSystem | null {
    if (this.selected?.type === 'weapon') {
      return this.weapons.find((weapon) => weapon.id === this.selected?.id) ?? null;
    }

    const order = this.selectedOrder;
    if (!order?.selectedFirePositionId) {
      return null;
    }

    return this.weaponForFirePosition(order.selectedFirePositionId);
  }

  get selectedFirePosition(): FirePosition | null {
    if (this.selected?.type === 'fire_position') {
      return this.firePositions.find((position) => position.id === this.selected?.id) ?? null;
    }

    const order = this.selectedOrder;
    if (!order?.selectedFirePositionId) {
      return null;
    }

    return this.firePositions.find((position) => position.id === order.selectedFirePositionId) ?? null;
  }

  get timeline(): TimelineItem[] {
    const items: TimelineItem[] = [
      ...this.orders.flatMap((order) => this.orderTimeline(order)),
      ...this.weapons.flatMap((weapon) => this.weaponTimeline(weapon)),
      ...this.firePositions.flatMap((position) => this.firePositionTimeline(position)),
    ];

    return items
      .filter((item) => Boolean(item.at))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 80);
  }

  loadWorkspace(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    forkJoin({
      orders: this.serviceOrders.getAll().pipe(catchError(() => of([]))),
      firePositions: this.firePositionsService.getAll().pipe(catchError(() => of([]))),
      weapons: this.weaponSystemsService.getAll().pipe(catchError(() => of([]))),
      notifications: this.notificationsService.getAll(true).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ orders, firePositions, weapons, notifications }) => {
        this.orders = orders;
        this.firePositions = firePositions;
        this.weapons = weapons;
        this.notifications = notifications;
        this.ensureSelection();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити оперативне робоче місце.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadOrders(): void {
    this.serviceOrders.getAll().subscribe({
      next: (orders) => {
        this.orders = orders;
        this.ensureSelection();
        if (this.selectedOrder) {
          this.loadExecutionRecords(this.selectedOrder.id);
        }
        this.cdr.markForCheck();
      },
    });
  }

  loadFirePositions(): void {
    this.firePositionsService.getAll().subscribe({
      next: (positions) => {
        this.firePositions = positions;
        this.cdr.markForCheck();
      },
    });
  }

  loadWeapons(): void {
    this.weaponSystemsService.getAll().subscribe({
      next: (weapons) => {
        this.weapons = weapons;
        this.cdr.markForCheck();
      },
    });
  }

  loadNotifications(): void {
    this.notificationsService.getAll(true).subscribe({
      next: (items) => {
        this.notifications = items;
        this.cdr.markForCheck();
      },
    });
  }

  selectOrder(order: ServiceOrder): void {
    this.selectEntity({ type: 'target', id: order.id });
  }

  selectWeapon(weapon: WeaponSystem): void {
    this.selectEntity({ type: 'weapon', id: weapon.id });
  }

  selectFirePosition(position: FirePosition): void {
    this.selectEntity({ type: 'fire_position', id: position.id });
  }

  openNotification(item: OperationalNotification): void {
    this.notificationsService.markRead(item.id).subscribe({
      next: (updated) => {
        this.notifications = this.notifications.map((current) =>
          current.id === updated.id ? updated : current,
        );
        this.cdr.markForCheck();
      },
    });

    if (item.entityType === 'weapon_system') {
      this.selectEntity({ type: 'weapon', id: item.entityId });
      return;
    }

    if (item.entityType === 'fire_position') {
      this.selectEntity({ type: 'fire_position', id: item.entityId });
      return;
    }

    this.selectDelivery(item.entityId);
  }

  acknowledgeNotification(item: OperationalNotification, event: Event): void {
    event.stopPropagation();
    this.notificationsService.acknowledge(item.id).subscribe({
      next: (updated) => {
        this.notifications = this.notifications.filter((current) => current.id !== updated.id);
        this.cdr.markForCheck();
      },
    });
  }

  openEntity(): void {
    if (this.selected?.type === 'target') {
      void this.router.navigate(['/service-orders'], { queryParams: { orderId: this.selected.id } });
    } else if (this.selected?.type === 'weapon') {
      void this.router.navigate(['/weapon-systems'], { queryParams: { weaponId: this.selected.id } });
    } else if (this.selected?.type === 'fire_position') {
      void this.router.navigate(['/fire-positions'], { queryParams: { firePositionId: this.selected.id } });
    }
  }

  startOrder(order: ServiceOrder): void {
    this.serviceOrders.start(order.id).subscribe({
      next: (updated) => this.replaceOrder(updated),
    });
  }

  acceptOrder(order: ServiceOrder): void {
    this.serviceOrders.accept(order.id).subscribe({
      next: (updated) => this.replaceOrder(updated),
    });
  }

  confirmFpReady(position: FirePosition): void {
    this.firePositionsService.confirmReadiness(position.id).subscribe({
      next: (updated) => this.replaceFirePosition(updated),
    });
  }

  confirmWeaponReady(weapon: WeaponSystem): void {
    this.weaponSystemsService.confirmReadiness(weapon.id, {
      readinessStatus: 'combat_ready',
      notReadyReason: null,
    }).subscribe({
      next: (updated) => this.replaceWeapon(updated),
    });
  }

  toggleTimeline(): void {
    this.timelineCollapsed = !this.timelineCollapsed;
  }

  trackQueueSection(_: number, section: QueueSection): string {
    return section.key;
  }

  trackQueueItem(_: number, item: QueueItem): string {
    return item.id;
  }

  trackNotification(_: number, item: OperationalNotification): string {
    return item.id;
  }

  trackTimeline(_: number, item: TimelineItem): string {
    return item.id;
  }

  isSelected(item: QueueItem): boolean {
    return this.selected?.type === 'target' && this.selected.id === item.order.id;
  }

  statusLabel(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      draft: 'Чернетка',
      proposed: 'Підготовлено',
      sent: 'Надіслано',
      sent_to_division: 'На дивізіоні',
      sent_to_battery: 'На батареї',
      accepted: 'Прийнято',
      rejected: 'Відхилено',
      in_progress: 'В роботі',
      completed: 'Завершено',
      cancelled: 'Скасовано',
      combat_ready: 'БГ',
      not_combat_ready: 'НЕ БГ',
      reserve_area: 'РЗ',
      moving_to_fire_position: 'Рух до ВП',
      at_fire_position: 'На ВП',
      moving_to_reserve_area: 'Рух до РЗ',
      draft_execution: 'Чернетка',
      posted: 'Проведено',
      reversed: 'Сторновано',
      cancelled_execution: 'Скасовано',
    };

    return labels[status ?? ''] ?? 'Невідомо';
  }

  reasonLabel(reason: string | null | undefined): string {
    const labels: Record<string, string> = {
      breakdown: 'Поломка',
      threat: 'Загроза',
      crew: 'Екіпаж',
      maintenance: 'ТО/ремонт',
      damaged: 'Пошкоджена',
      not_prepared: 'Не підготовлена',
      occupied: 'Зайнята',
      other: 'Інше',
    };

    return labels[reason ?? ''] ?? 'Причина не вказана';
  }

  purposeLabel(purpose: string): string {
    const labels: Record<string, string> = {
      barrel_warmup: 'Прогрів',
      adjustment: 'Пристрілка',
      main_fire: 'Основний',
      additional_fire: 'Додатковий',
      other: 'Інше',
    };

    return labels[purpose] ?? purpose;
  }

  notificationTitle(item: OperationalNotification): string {
    const labels: Record<string, string> = {
      new_target: 'Нова ціль',
      weapon_not_ready: 'СГ → НЕ БГ',
      weapon_ready: 'СГ → БГ',
      fire_position_not_ready: 'ВП → НЕ БГ',
      fire_position_ready: 'ВП → БГ',
      target_accepted: 'Ціль прийнято',
      target_rejected: 'Ціль відхилено',
      firing_blocked: 'Вогонь заблоковано',
    };

    return labels[item.type] ?? 'Повідомлення';
  }

  toneForOrder(order: ServiceOrder): Tone {
    if (order.status === 'rejected' || order.status === 'cancelled') return 'critical';
    if (!order.selectedFirePositionId && order.status !== 'completed') return 'action';
    if (order.status === 'in_progress') return 'progress';
    if (order.status === 'completed') return 'ready';
    return 'neutral';
  }

  queueStatus(order: ServiceOrder): string {
    if (!order.selectedFirePositionId && order.status !== 'completed') {
      return 'Потрібне рішення';
    }

    if (order.status === 'in_progress') {
      return 'Виконується';
    }

    return this.statusLabel(order.status);
  }

  weaponName(weapon: { callsign?: string | null; serialNumber?: string | null } | null | undefined): string {
    return weapon?.callsign || weapon?.serialNumber || 'СГ';
  }

  firePositionName(position: FirePosition | null | undefined): string {
    return position?.name || 'ВП не призначена';
  }

  selectedOrderShotKit(order: ServiceOrder): string {
    return order.selectedShotConfiguration?.name
      || order.selectedShell?.marking
      || 'Комплект не обрано';
  }

  private selectEntity(entity: SelectedEntity): void {
    this.selected = entity;
    if (entity.type === 'target') {
      this.loadExecutionRecords(entity.id);
    } else {
      this.executionRecords = [];
    }
    this.cdr.markForCheck();
  }

  private selectDelivery(deliveryId: string): void {
    const notification = this.notifications.find((item) => item.entityId === deliveryId);
    const orderId = this.stringValue(notification?.payload?.['serviceOrderId'])
      || this.orders.find((order) => order.id === deliveryId)?.id
      || '';

    if (orderId) {
      this.selectEntity({ type: 'target', id: orderId });
    }
  }

  private loadExecutionRecords(orderId: string): void {
    this.executionRecordsService.list(orderId).pipe(catchError(() => of([]))).subscribe({
      next: (items) => {
        if (this.selected?.type === 'target' && this.selected.id === orderId) {
          this.executionRecords = items;
          this.cdr.markForCheck();
        }
      },
    });
  }

  private ensureSelection(): void {
    if (this.selected) {
      return;
    }

    const first = this.flatQueue[0];
    if (first) {
      this.selected = { type: 'target', id: first.order.id };
      this.loadExecutionRecords(first.order.id);
    }
  }

  private toQueueItem(order: ServiceOrder): QueueItem {
    const section = this.queueSection(order);
    const position = order.selectedFirePosition || this.firePositions.find((item) => item.id === order.selectedFirePositionId);
    const weapon = order.selectedFirePositionId ? this.weaponForFirePosition(order.selectedFirePositionId) : null;

    return {
      id: order.id,
      order,
      priority: this.toneForOrder(order),
      targetNumber: order.orderNumber,
      weaponOrFp: [this.weaponName(weapon), this.firePositionName(position as FirePosition | null)]
        .filter((part) => part && part !== 'СГ')
        .join(' · ') || 'Не призначено',
      time: order.updatedAt || order.createdAt,
      status: this.queueStatus(order),
      section,
    };
  }

  private queueSection(order: ServiceOrder): QueueSectionKey {
    if (order.status === 'rejected' || order.status === 'cancelled') return 'problems';
    if (!order.selectedFirePositionId && order.status !== 'completed') return 'decision';
    if (order.status === 'in_progress' || order.status === 'accepted') return 'working';
    if (order.status === 'draft' || order.status === 'proposed' || order.status === 'sent') return 'new_target';
    return 'working';
  }

  private weaponForFirePosition(firePositionId: string): WeaponSystem | null {
    return this.weapons.find((weapon) =>
      weapon.currentFirePositionId === firePositionId
      && weapon.deploymentStatus === 'at_fire_position',
    ) ?? null;
  }

  private orderTimeline(order: ServiceOrder): TimelineItem[] {
    const items: TimelineItem[] = [
      {
        id: `order-${order.id}-received`,
        type: 'target_received',
        tone: 'action',
        title: 'Ціль отримано',
        context: `ВГЗ ${order.orderNumber}`,
        at: order.createdAt,
      },
    ];

    if (order.acceptedByUserId || order.status === 'accepted' || order.status === 'in_progress' || order.status === 'completed') {
      items.push({
        id: `order-${order.id}-accepted`,
        type: 'target_accepted',
        tone: 'ready',
        title: 'Ціль прийнято',
        context: `ВГЗ ${order.orderNumber}`,
        at: order.updatedAt,
      });
    }

    if (order.startedAt) {
      items.push({
        id: `order-${order.id}-started`,
        type: 'fire_started',
        tone: 'progress',
        title: 'Вогонь розпочато',
        context: `ВГЗ ${order.orderNumber}`,
        at: order.startedAt,
      });
    }

    if (order.completedAt) {
      items.push({
        id: `order-${order.id}-completed`,
        type: 'fire_completed',
        tone: 'ready',
        title: 'Вогонь завершено',
        context: `ВГЗ ${order.orderNumber} · ${order.actualQuantity ?? 0}`,
        at: order.completedAt,
      });
    }

    return items;
  }

  private weaponTimeline(weapon: WeaponSystem): TimelineItem[] {
    const items: TimelineItem[] = [];
    const name = this.weaponName(weapon);

    if (weapon.deploymentStatus === 'at_fire_position' && weapon.currentFirePositionId) {
      items.push({
        id: `weapon-${weapon.id}-moved`,
        type: 'weapon_moved',
        tone: 'progress',
        title: 'СГ на ВП',
        context: name,
        at: weapon.updatedAt,
      });
    }

    if (weapon.readinessStatus === 'combat_ready') {
      items.push({
        id: `weapon-${weapon.id}-ready`,
        type: 'weapon_ready',
        tone: 'ready',
        title: 'СГ БГ',
        context: name,
        at: weapon.updatedAt,
      });
    }

    for (const maintenance of weapon.maintenances ?? []) {
      if (maintenance.status === 'in_progress') {
        items.push({
          id: `maintenance-${maintenance.id}-started`,
          type: 'maintenance_started',
          tone: 'critical',
          title: 'ТО/ремонт розпочато',
          context: name,
          at: maintenance.startedAt,
        });
      }

      if (maintenance.status === 'completed' && maintenance.completedAt) {
        items.push({
          id: `maintenance-${maintenance.id}-completed`,
          type: 'maintenance_completed',
          tone: 'neutral',
          title: 'ТО/ремонт завершено',
          context: name,
          at: maintenance.completedAt,
        });
      }
    }

    return items;
  }

  private firePositionTimeline(position: FirePosition): TimelineItem[] {
    if (position.readinessStatus !== 'combat_ready') {
      return [];
    }

    return [{
      id: `fp-${position.id}-ready`,
      type: 'fp_ready',
      tone: 'ready',
      title: 'ВП БГ',
      context: position.name,
      at: new Date().toISOString(),
    }];
  }

  private moveQueueFocus(direction: number): void {
    const items = this.flatQueue;
    if (items.length === 0) {
      this.focusedQueueIndex = 0;
      return;
    }

    this.focusedQueueIndex = (this.focusedQueueIndex + direction + items.length) % items.length;
    this.cdr.markForCheck();
  }

  private replaceOrder(updated: ServiceOrder): void {
    this.orders = this.orders.map((order) => order.id === updated.id ? updated : order);
    this.cdr.markForCheck();
  }

  private replaceFirePosition(updated: FirePosition): void {
    this.firePositions = this.firePositions.map((position) => position.id === updated.id ? updated : position);
    this.cdr.markForCheck();
  }

  private replaceWeapon(updated: WeaponSystem): void {
    this.weapons = this.weapons.map((weapon) => weapon.id === updated.id ? updated : weapon);
    this.cdr.markForCheck();
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }
}
