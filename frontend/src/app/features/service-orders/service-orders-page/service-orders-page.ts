import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EventFeedService } from '../../../core/event-feed.service';
import { formatKyivDateTime, isSameKyivDate, minutesSince } from '../../../core/kyiv-time.util';
import { finalize, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { ToastService } from '../../../core/toast.service';
import { AuthService, LoginResponse } from '../../auth/auth.service';
import { FirePositionCard } from '../../fire-positions/fire-position-card.model';
import { FirePositionsService } from '../../fire-positions/fire-positions.service';
import { ShellCompatibleCharge } from '../../shell-compatible-charges/shell-compatible-charge.model';
import { ShellCompatibleChargesService } from '../../shell-compatible-charges/shell-compatible-charges.service';
import { ReconPuarProposal } from '../../recon/recon.model';
import { ReconService } from '../../recon/recon.service';
import { ServiceOrder } from '../service-order.model';
import {
 ServiceOrderAirPayloadVariant,
ServiceOrderSuggestion,
ServiceOrderSuggestionVariant,
ServiceOrdersService,
} from '../service-orders.service';

interface CompletionShellOption {
  id: string;
  marking: string;
  quantity: number;
}

interface CompletionChargeOption {
  id: string;
  marking: string;
  quantity: number;
  chargeKind: 'unit' | 'modular';
  modulesPerCharge: number | null;
  maxUsableModules: number | null;
}

interface CompletionAmmoFormItem {
  shellId: string;
  chargeId: string;
  quantity: string;
  chargeModulesPerShot: string;
}

@Component({
  selector: 'app-service-orders-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './service-orders-page.html',
  styleUrl: './service-orders-page.css',
})
export class ServiceOrdersPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private readonly viewModeKey = 'euclida_service_orders_view_mode';
  private readonly problemFilterKey = 'euclida_service_orders_problem_filter';

  currentUser: LoginResponse['user'] | null = null;
  items: ServiceOrder[] = [];
  loading = true;
  refreshing = false;
  errorMessage = '';
  lastSyncLabel = '—';
  expandedSuggestionIds: Record<string, boolean> = {};
  openedActionsOrderId: string | null = null;
  readonly pageSkeleton = Array.from({ length: 6 });

  selectedDetailsOrderId: string | null = null;

  get selectedDetailsOrder(): ServiceOrder | null {
    return (
      this.activeItems.find((item) => item.id === this.selectedDetailsOrderId) ||
      this.activeItems[0] ||
      null
    );
  }

  selectOrderDetails(order: ServiceOrder): void {
    this.selectedDetailsOrderId = order.id;
  }

  get activeCount(): number {
    return this.activeItems.length;
  }

  get inProgressCount(): number {
    return this.items.filter((item) => item.status === 'in_progress').length;
  }

  get waitingCount(): number {
    return this.items.filter(
      (item) =>
        item.status === 'draft' ||
        item.status === 'proposed' ||
        item.status === 'sent' ||
        item.status === 'sent_to_division' ||
        item.status === 'sent_to_battery' ||
        item.status === 'accepted',
    ).length;
  }

  get completedTodayCount(): number {
    return this.items.filter(
      (item) =>
        item.status === 'completed' && !!item.completedAt && isSameKyivDate(item.completedAt),
    ).length;
  }

  get criticalOrdersCount(): number {
    return this.activeItems.filter(
      (item) =>
        !this.hasSelectedExecutor(item) ||
        this.isOrderOverdue(item) ||
        (item.status === 'in_progress' && minutesSince(item.startedAt || item.updatedAt) >= 120) ||
        item.status === 'rejected',
    ).length;
  }

  createModalOpen = false;
  modalSubmitting = false;
  createStep = 1;
  cancelModalOrder: ServiceOrder | null = null;
  completeModalOrder: ServiceOrder | null = null;
  rejectModalOrder: ServiceOrder | null = null;

  expandedHistoryOrderId: string | null = null;
  selectedOrderId: string | null = null;
  focusedOrderId: string | null = null;
  suggestions: ServiceOrderSuggestion[] = [];
  suggestionsLoading = false;
  viewMode: 'cards' | 'list' = 'list';
  problemFilter = '';
  orderBoardTab: 'active' | 'in_progress' | 'completed' | 'cancelled' | 'history' | 'planned_puar' = 'active';
  plannedPuarProposals: ReconPuarProposal[] = [];
  targetDateFilter = this.getTodayDateTimeFilter();

  cancelReasonByOrderId: Record<string, string> = {};
  rejectReasonByOrderId: Record<string, string> = {};

  historyFilters = {
    ...this.getTodayDateTimeFilter(),
    status: '',
    resultType: '',
    search: '',
  };

  completeFormByOrderId: Record<
    string,
    {
      startedAt: string;
      completedAt: string;
      actualQuantity: string;
      actualShellId: string;
      actualChargeId: string;
      chargeModulesPerShot: string;
      actualAmmoItems: CompletionAmmoFormItem[];
      resultType: string;
      resultComment: string;
    }
  > = {};
  compatibleCharges: ShellCompatibleCharge[] = [];
  completeStockByOrderId: Record<
    string,
    {
      shells: CompletionShellOption[];
      charges: CompletionChargeOption[];
    }
  > = {};
  completeStockLoadingByOrderId: Record<string, boolean> = {};

  form = this.getEmptyForm();

  constructor(
    private readonly service: ServiceOrdersService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly eventFeed: EventFeedService,
    private readonly auth: AuthService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly firePositions: FirePositionsService,
    private readonly compatibleChargesService: ShellCompatibleChargesService,
    private readonly reconService: ReconService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getUser();
    this.restoreViewPreferences();
    this.loadCompatibleCharges();
    this.loadPlannedPuar();
    this.load();
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('create') === 'true') {
        this.openCreateModal();

        const lat = Number(params.get('lat'));
        const lng = Number(params.get('lng'));

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          this.form.coordinateMode = 'decimal';
          this.form.targetLat = String(lat);
          this.form.targetLng = String(lng);
        }
      }

      const filter = params.get('filter');
      const view = params.get('view');
      const orderId = params.get('orderId');

      if (filter !== null) {
        this.problemFilter = filter;
        this.saveViewPreferences();
      }

      if (view === 'cards' || view === 'list') {
        this.viewMode = view;
        this.saveViewPreferences();
      }

      if (orderId) {
        this.focusedOrderId = orderId;
        this.scrollFocusedOrderIntoView();
      } else {
        this.focusedOrderId = null;
      }
    });

    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all', 'missions', 'recon'], () => {
        this.closeActions();
        this.load(true);
        this.loadPlannedPuar();
      }),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
  }

  load(silent = false): void {
    const firstLoad = this.items.length === 0;

    if (firstLoad) {
      this.loading = true;
      this.refreshing = false;
    } else {
      this.loading = false;
      this.refreshing = true;
    }

    this.errorMessage = '';

    this.service.getAll().subscribe({
      next: (items) => {
        this.items = items;
        this.syncOpenOrderReferences(items);
        this.loading = false;
        this.refreshing = false;
        this.lastSyncLabel = formatKyivDateTime(new Date().toISOString());
        this.scrollFocusedOrderIntoView();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;
        this.refreshing = false;

        if (silent) {
          this.errorMessage =
            this.items.length > 0
              ? 'Вогневі завдання не вдалося оновити. Показані останні доступні дані.'
              : 'Не вдалося завантажити вогневі завдання';
          this.cdr.detectChanges();
          return;
        }

        this.fail(error, 'Не вдалося завантажити вогневі завдання');
      },
    });
  }

  private loadCompatibleCharges(): void {
    this.compatibleChargesService.getAll().subscribe({
      next: (items) => {
        this.compatibleCharges = items;
      },
      error: () => {
        this.compatibleCharges = [];
      },
    });
  }

  private loadPlannedPuar(): void {
    this.reconService.getPuar().subscribe({
      next: (items) => {
        this.plannedPuarProposals = items.filter((item) => item.status === 'draft');
        this.cdr.detectChanges();
      },
      error: () => {
        this.plannedPuarProposals = [];
      },
    });
  }

  acceptPuarProposal(proposal: ReconPuarProposal): void {
    this.service.acceptPuarProposal(proposal.id).subscribe({
      next: (order) => {
        this.toast.show('Чернетку ВГЗ з ПУАР створено', 'success');
        this.orderBoardTab = 'active';
        this.focusedOrderId = order.id;
        this.loadPlannedPuar();
        this.load();
      },
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося прийняти ПУАР у ВГЗ'),
    });
  }

  getPuarSnapshotValue(proposal: ReconPuarProposal, key: 'mgrs' | 'targetType'): string {
    const target = proposal.payload?.['target'] as Record<string, unknown> | undefined;
    const observation = proposal.payload?.['observation'] as Record<string, unknown> | undefined;
    return String(target?.[key] || observation?.[key] || '—');
  }

  get hasBlockingError(): boolean {
    return !!this.errorMessage && this.items.length === 0;
  }

  create(): void {
    if (this.modalSubmitting) {
      return;
    }

    this.errorMessage = '';

    if (!this.form.orderNumber.trim()) {
      this.errorMessage = 'Вкажіть номер вогневого завдання';
      return;
    }

    if (this.form.coordinateMode === 'decimal' && (!this.form.targetLat || !this.form.targetLng)) {
      this.errorMessage = 'Вкажіть Lat/Lng';
      return;
    }

    if (this.form.coordinateMode === 'mgrs') {
      this.normalizeFormMgrs();
    }

    if (this.form.coordinateMode === 'mgrs' && !this.form.targetMgrs.trim()) {
      this.errorMessage = 'Вкажіть MGRS';
      return;
    }

    if (this.form.coordinateMode === 'mgrs' && !this.isValidMgrs(this.form.targetMgrs)) {
      this.errorMessage = 'Некоректний MGRS. Формат: 36U XB 11111 22222';
      return;
    }

    if (!this.form.taskType.trim()) {
      this.errorMessage = 'Вкажіть характер вогневого завдання';
      return;
    }

    if (
      Number(this.form.plannedQuantity) <= 0 ||
      !Number.isInteger(Number(this.form.plannedQuantity))
    ) {
      this.errorMessage = 'Кількість має бути цілим числом більше 0';
      return;
    }

    this.modalSubmitting = true;

    this.service
      .create({
        orderNumber: this.form.orderNumber.trim(),
        ...(this.form.coordinateMode === 'decimal'
          ? {
              targetLat: Number(this.form.targetLat),
              targetLng: Number(this.form.targetLng),
            }
          : {
              targetMgrs: this.formatMgrs(this.form.targetMgrs),
            }),
        targetSettlement: this.form.targetSettlement.trim() || undefined,
        taskType: this.form.taskType.trim(),
        plannedQuantity: Number(this.form.plannedQuantity),
      })
      .pipe(finalize(() => this.finishModalRequest()))
      .subscribe({
        next: () => {
          this.toast.show('Вогневе завдання створено', 'success');
          this.eventFeed.add({
            type: 'success',
            title: `Створено вогневе завдання ${this.form.orderNumber.trim()}`,
            details: `Район: ${this.form.targetSettlement.trim() || '?'}, планова кількість: ${this.form.plannedQuantity}`,
            route: '/service-orders',
          });
          this.form = this.getEmptyForm();
          this.modalSubmitting = false;
          this.closeCreateModal();
          this.closeActions();
          this.load();
        },
        error: (error) => {
          this.fail(error, error?.error?.message || 'Не вдалося створити вогневе завдання');
        },
      });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => {
        this.toast.show('Вогневе завдання видалено', 'success');
        this.eventFeed.add({
          type: 'warning',
          title: 'Вогневе завдання видалено',
          details: `ID: ${id}`,
          route: '/service-orders',
        });
        this.closeActions();
        this.load();
      },
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося видалити вогневе завдання'),
    });
  }

  loadSuggestions(order: ServiceOrder): void {
    this.selectedOrderId = order.id;
    this.selectedDetailsOrderId = order.id;
    this.focusedOrderId = order.id;
    this.suggestions = [];
    this.expandedSuggestionIds = {};
    this.suggestionsLoading = true;
    this.errorMessage = '';

    this.service.getSuggestions(order.id).subscribe({
      next: (suggestions) => {
        this.suggestions = suggestions;
        this.suggestionsLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.suggestionsLoading = false;
        this.fail(error, error?.error?.message || 'Не вдалося підібрати точку');
      },
    });
  }

  canSelectSuggestion(order: ServiceOrder): boolean {
    return order.status === 'draft' || order.status === 'proposed' || order.status === 'rejected';
  }

selectSuggestion(
  order: ServiceOrder,
  suggestion: ServiceOrderSuggestion,
  variant: ServiceOrderSuggestionVariant,
): void {
  this.errorMessage = '';

  if (suggestion.executorType !== 'fire_position' || !suggestion.firePosition) {
    this.errorMessage = 'Цей варіант не є ВП';
    return;
  }

  const firePosition = suggestion.firePosition;

  this.service
    .selectPosition(order.id, {
      firePositionId: firePosition.id,
      shellId: variant.shellId,
      chargeId: variant.chargeId,
      zoneId: variant.zoneId,
    })
    .subscribe({
      next: () => {
        this.toast.show('Варіант обрано', 'success');
        this.eventFeed.add({
          type: 'success',
          title: `Для ${order.orderNumber} обрано ВП ${firePosition.name}`,
          details: `${variant.shell.marking} + ${variant.charge.marking}, ${this.getZoneLabel(variant.zone)}, запас ${variant.rangeReserveM} м`,
          route: '/map',
          queryParams: this.getMapQueryParams(order),
        });

        this.selectedOrderId = null;
        this.suggestions = [];
        this.closeActions();
        this.load();
      },
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося обрати варіант'),
    });
}



  accept(order: ServiceOrder): void {
    this.errorMessage = '';

    this.service.accept(order.id).subscribe({
      next: () => {
        this.toast.show('Вогневе завдання прийнято', 'success');
        this.eventFeed.add({
          type: 'success',
          title: `Вогневе завдання ${order.orderNumber} прийнято`,
          details: `\u0412\u041f: ${order.selectedFirePosition?.name || '\u2014'}, \u0440\u0430\u0439\u043e\u043d: ${order.targetSettlement || '\u2014'}`,
          route: '/map',
          queryParams: this.getMapQueryParams(order),
        });
        this.closeActions();
        this.load();
      },
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося прийняти вогневе завдання'),
    });
  }

  reject(order: ServiceOrder): void {
    if (this.modalSubmitting) {
      return;
    }

    this.errorMessage = '';

    const reason = this.rejectReasonByOrderId[order.id]?.trim() || '';

    if (!reason) {
      this.errorMessage =
        '\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u043f\u0440\u0438\u0447\u0438\u043d\u0443 \u0432\u0456\u0434\u0445\u0438\u043b\u0435\u043d\u043d\u044f';
      return;
    }

    this.modalSubmitting = true;

    this.service
      .reject(order.id, reason)
      .pipe(finalize(() => this.finishModalRequest()))
      .subscribe({
        next: () => {
          this.toast.show('Вогневе завдання відхилено', 'warning');
          this.eventFeed.add({
            type: 'warning',
            title: `Вогневе завдання ${order.orderNumber} відхилено`,
            details: `\u0412\u041f: ${order.selectedFirePosition?.name || '\u2014'}, \u043f\u0440\u0438\u0447\u0438\u043d\u0430: ${reason}`,
            route: '/service-orders',
          });
          this.rejectReasonByOrderId[order.id] = '';
          this.modalSubmitting = false;
          this.closeRejectModal();
          this.closeActions();
          this.load();
        },
        error: (error) => {
          this.modalSubmitting = false;
          this.fail(error, error?.error?.message || 'Не вдалося відхилити вогневе завдання');
        },
      });
  }

  reopen(order: ServiceOrder): void {
    this.errorMessage = '';

    this.service.reopen(order.id).subscribe({
      next: () => {
        this.toast.show('Вогневе завдання повернуто в роботу', 'success');
        this.eventFeed.add({
          type: 'info',
          title: `Вогневе завдання ${order.orderNumber} повернуто до підбору`,
          details: `\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0412\u041f: ${order.selectedFirePosition?.name || '\u2014'}`,
          route: '/service-orders',
        });
        this.closeActions();
        this.load();
      },
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося повернути вогневе завдання в роботу'),
    });
  }

  start(order: ServiceOrder): void {
    this.errorMessage = '';

    this.service.start(order.id).subscribe({
      next: () => {
        this.toast.show(
          '\u0412\u0438\u043a\u043e\u043d\u0430\u043d\u043d\u044f \u0440\u043e\u0437\u043f\u043e\u0447\u0430\u0442\u043e',
          'success',
        );
        this.eventFeed.add({
          type: 'info',
          title: `\u0412\u0438\u043a\u043e\u043d\u0430\u043d\u043d\u044f ${order.orderNumber} \u0440\u043e\u0437\u043f\u043e\u0447\u0430\u0442\u043e`,
          details: `\u0412\u041f ${order.selectedFirePosition?.name || '\u2014'} \u043f\u0435\u0440\u0435\u0439\u0448\u043b\u0430 \u0432 \u0440\u043e\u0431\u043e\u0442\u0443`,
          route: '/map',
          queryParams: this.getMapQueryParams(order),
        });
        this.closeActions();
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося почати виконання'),
    });
  }

  complete(order: ServiceOrder): void {
    if (this.modalSubmitting) {
      return;
    }

    this.errorMessage = '';

    const form = this.getCompleteForm(order);

    if (!form.resultType) {
      this.errorMessage = 'Оберіть результат виконання';
      return;
    }

    const actualAmmoItems = form.actualAmmoItems.map((item) => ({
      shellId: item.shellId,
      chargeId: item.chargeId,
      quantity: Number(item.quantity),
      chargeModulesPerShot: Number(item.chargeModulesPerShot),
    }));

    if (
      actualAmmoItems.length === 0 ||
      actualAmmoItems.some(
        (item) =>
          !item.shellId ||
          !item.chargeId ||
          item.quantity <= 0 ||
          !Number.isInteger(item.quantity),
      )
    ) {
      this.errorMessage = 'Фактична витрата має бути цілим числом більше 0';
      return;
    }

    for (const item of actualAmmoItems) {
      const selectedCharge = this.getCompletionChargeOption(order, item.chargeId);

      if (
        selectedCharge?.chargeKind === 'modular' &&
        (!Number.isInteger(item.chargeModulesPerShot) || item.chargeModulesPerShot <= 0)
      ) {
        this.errorMessage = 'Вкажіть кількість модулів заряду на постріл';
        return;
      }
    }

    this.modalSubmitting = true;
    const actualQuantity = actualAmmoItems.reduce((sum, item) => sum + item.quantity, 0);
    const firstItem = actualAmmoItems[0];

    this.service
      .complete(order.id, {
        startedAt: new Date(form.startedAt).toISOString(),
        completedAt: new Date(form.completedAt).toISOString(),
        actualQuantity,
        actualShellId: firstItem.shellId,
        actualChargeId: firstItem.chargeId,
        actualAmmoItems: actualAmmoItems.map((item) => {
          const selectedCharge = this.getCompletionChargeOption(order, item.chargeId);
          return {
            shellId: item.shellId,
            chargeId: item.chargeId,
            quantity: item.quantity,
            ...(selectedCharge?.chargeKind === 'modular'
              ? { chargeModulesPerShot: item.chargeModulesPerShot }
              : {}),
          };
        }),
        resultType: form.resultType,
        resultComment: form.resultComment.trim() || undefined,
      })
      .pipe(finalize(() => this.finishModalRequest()))
      .subscribe({
        next: () => {
          this.toast.show(
            order.status === 'completed' ? 'Результат оновлено' : 'Вогневе завдання завершено',
            'success',
          );
          this.eventFeed.add({
            type: 'success',
            title: `Вогневе завдання ${order.orderNumber} завершено`,
            details: `Факт: ${actualQuantity}, результат: ${this.getResultTypeLabel(form.resultType)}, ВП: ${order.selectedFirePosition?.name || '?'}`,
            route: '/map',
            queryParams: this.getMapQueryParams(order),
          });
          delete this.completeFormByOrderId[order.id];
          this.modalSubmitting = false;
          this.closeCompleteModal();
          this.closeActions();
          this.load();
        },
        error: (error) => {
          this.fail(error, error?.error?.message || 'Не вдалося завершити вогневе завдання');
        },
      });
  }

  cancel(order: ServiceOrder): void {
    if (this.modalSubmitting) {
      return;
    }

    this.errorMessage = '';

    const reason = this.cancelReasonByOrderId[order.id]?.trim() || '';

    this.modalSubmitting = true;

    this.service
      .cancel(order.id, reason || undefined)
      .pipe(finalize(() => this.finishModalRequest()))
      .subscribe({
        next: () => {
          this.toast.show('Вогневе завдання скасовано', 'warning');
          this.eventFeed.add({
            type: 'warning',
            title: `Вогневе завдання ${order.orderNumber} скасовано`,
            details: `Причина: ${reason || 'причину не вказано'}, ВП: ${order.selectedFirePosition?.name || '?'}`,
            route: '/service-orders',
          });
          this.cancelReasonByOrderId[order.id] = '';
          this.modalSubmitting = false;
          this.closeCancelModal();
          this.closeActions();
          this.load();
        },
        error: (error) => {
          this.fail(error, error?.error?.message || 'Не вдалося скасувати вогневе завдання');
        },
      });
  }

  canControlOrder(): boolean {
    return this.currentUser?.role === 'admin' || this.currentUser?.scope === 'main';
  }

  canExecuteOrder(order: ServiceOrder): boolean {
    return (
      this.currentUser?.role === 'operator' &&
      this.currentUser?.scope === 'battery' &&
      !!this.currentUser?.unitId &&
      order.assignedUnitId === this.currentUser.unitId
    );
  }

  hasPrimaryAction(order: ServiceOrder): boolean {
    if (['draft', 'proposed', 'rejected'].includes(order.status)) {
      return this.canControlOrder();
    }

    if (
      order.status === 'sent' ||
      order.status === 'sent_to_division' ||
      order.status === 'sent_to_battery' ||
      order.status === 'accepted' ||
      order.status === 'in_progress'
    ) {
      return this.canExecuteOrder(order);
    }

    return false;
  }

  getPrimaryActionLabel(order: ServiceOrder): string {
    if (order.status === 'draft') return 'Підібрати ВП';
    if (order.status === 'proposed') return 'Надіслати на ПУВБ';
    if (
      order.status === 'sent' ||
      order.status === 'sent_to_division' ||
      order.status === 'sent_to_battery'
    ) {
      return 'Прийняти завдання';
    }
    if (order.status === 'accepted') return 'Почати виконання';
    if (order.status === 'rejected') return 'Підібрати іншу ВП';
    if (order.status === 'in_progress') return 'Завершити завдання';

    return '';
  }

  runPrimaryAction(order: ServiceOrder): void {
    this.closeActions();

    if ((order.status === 'draft' || order.status === 'rejected') && this.canControlOrder()) {
      this.loadSuggestions(order);
      return;
    }

    if (order.status === 'proposed' && this.canControlOrder()) {
      this.sendToUnit(order);
      return;
    }

    if (!this.canExecuteOrder(order)) {
      this.errorMessage =
        '\u0421\u0442\u0430\u0440\u0448\u0456 \u043f\u0443\u043d\u043a\u0442\u0438 \u0443\u043f\u0440\u0430\u0432\u043b\u0456\u043d\u043d\u044f \u0442\u0456\u043b\u044c\u043a\u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044e\u044e\u0442\u044c \u0432\u0438\u043a\u043e\u043d\u0430\u043d\u043d\u044f. \u0412\u0438\u043a\u043e\u043d\u0430\u0432\u0447\u0456 \u0434\u0456\u0457 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0456 \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0443 \u0431\u0430\u0442\u0430\u0440\u0435\u0457/\u0412\u041f.';
      return;
    }

    if (
      order.status === 'sent' ||
      order.status === 'sent_to_division' ||
      order.status === 'sent_to_battery'
    ) {
      this.accept(order);
      return;
    }

    if (order.status === 'accepted') {
      this.start(order);
      return;
    }

    if (order.status === 'in_progress') {
      this.openCompleteModal(order);
    }
  }

  getCompleteForm(order: ServiceOrder) {
    if (!this.completeFormByOrderId[order.id]) {
      const nowLocal = this.toLocalDatetimeValue(new Date());

      this.completeFormByOrderId[order.id] = {
        startedAt: order.startedAt
          ? this.toLocalDatetimeValue(new Date(order.startedAt))
          : nowLocal,
        completedAt: order.completedAt
          ? this.toLocalDatetimeValue(new Date(order.completedAt))
          : nowLocal,
        actualQuantity: String(order.actualQuantity ?? order.plannedQuantity ?? 1),
        actualShellId: order.selectedShellId || order.selectedShell?.id || '',
        actualChargeId: order.selectedChargeId || order.selectedCharge?.id || '',
        chargeModulesPerShot: String(
          order.actualChargeModulesPerShot ||
            order.selectedCharge?.maxUsableModules ||
            order.selectedCharge?.modulesPerCharge ||
            '',
        ),
        actualAmmoItems: [
          {
            shellId: order.selectedShellId || order.selectedShell?.id || '',
            chargeId: order.selectedChargeId || order.selectedCharge?.id || '',
            quantity: String(order.actualQuantity ?? order.plannedQuantity ?? 1),
            chargeModulesPerShot: String(
              order.actualChargeModulesPerShot ||
                order.selectedCharge?.maxUsableModules ||
                order.selectedCharge?.modulesPerCharge ||
                '',
            ),
          },
        ],
        resultType: order.resultType || '',
        resultComment: order.resultComment || '',
      };
    }

    return this.completeFormByOrderId[order.id];
  }

  openCreateModal(): void {
    this.form = this.getEmptyForm();
    this.createStep = 1;
    this.createModalOpen = true;
    this.modalSubmitting = false;
    this.errorMessage = '';
  }

  closeCreateModal(): void {
    if (this.modalSubmitting) {
      return;
    }

    this.createModalOpen = false;
    this.createStep = 1;
    this.clearCreateQueryParams();
  }

  onModalBackdropClick(): void {
    if (this.completeModalOrder) {
      this.closeCompleteModal();
      return;
    }

    if (this.cancelModalOrder) {
      this.closeCancelModal();
      return;
    }

    if (this.rejectModalOrder) {
      this.closeRejectModal();
      return;
    }

    if (this.createModalOpen) {
      this.closeCreateModal();
    }
  }

  onModalCardClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  nextCreateStep(): void {
    this.errorMessage = '';

    if (this.createStep === 1 && !this.form.orderNumber.trim()) {
      this.errorMessage = 'Вкажіть номер вогневого завдання';
      return;
    }

    if (
      this.createStep === 1 &&
      this.form.coordinateMode === 'decimal' &&
      (!this.form.targetLat || !this.form.targetLng)
    ) {
      this.errorMessage = '\u0412\u043a\u0430\u0436\u0456\u0442\u044c Lat/Lng';
      return;
    }

    if (this.createStep === 1 && this.form.coordinateMode === 'mgrs') {
      this.normalizeFormMgrs();
    }

    if (
      this.createStep === 1 &&
      this.form.coordinateMode === 'mgrs' &&
      !this.form.targetMgrs.trim()
    ) {
      this.errorMessage = '\u0412\u043a\u0430\u0436\u0456\u0442\u044c MGRS';
      return;
    }

    if (
      this.createStep === 1 &&
      this.form.coordinateMode === 'mgrs' &&
      !this.isValidMgrs(this.form.targetMgrs)
    ) {
      this.errorMessage = 'Некоректний MGRS. Формат: 36U XB 11111 22222';
      return;
    }

    if (this.createStep === 2 && !this.form.taskType.trim()) {
      this.errorMessage = 'Вкажіть характер вогневого завдання';
      return;
    }

    this.createStep = Math.min(this.createStep + 1, 3);
  }

  prevCreateStep(): void {
    this.errorMessage = '';
    this.createStep = Math.max(this.createStep - 1, 1);
  }

  openCompleteModal(order: ServiceOrder): void {
    this.completeModalOrder = order;
    this.modalSubmitting = false;
    this.errorMessage = '';

    this.completeFormByOrderId[order.id] = {
      startedAt: order.startedAt
        ? this.toLocalDatetimeValue(new Date(order.startedAt))
        : this.toLocalDatetimeValue(new Date()),
      completedAt: order.completedAt
        ? this.toLocalDatetimeValue(new Date(order.completedAt))
        : this.toLocalDatetimeValue(new Date()),
      actualQuantity: String(order.actualQuantity ?? order.plannedQuantity ?? 1),
      actualShellId: order.selectedShellId || order.selectedShell?.id || '',
      actualChargeId: order.selectedChargeId || order.selectedCharge?.id || '',
      chargeModulesPerShot: String(
        order.actualChargeModulesPerShot ||
          order.selectedCharge?.maxUsableModules ||
          order.selectedCharge?.modulesPerCharge ||
          '',
      ),
      actualAmmoItems: [
        {
          shellId: order.selectedShellId || order.selectedShell?.id || '',
          chargeId: order.selectedChargeId || order.selectedCharge?.id || '',
          quantity: String(order.actualQuantity ?? order.plannedQuantity ?? 1),
          chargeModulesPerShot: String(
            order.actualChargeModulesPerShot ||
              order.selectedCharge?.maxUsableModules ||
              order.selectedCharge?.modulesPerCharge ||
              '',
          ),
        },
      ],
      resultType: order.resultType || '',
      resultComment: order.resultComment || '',
    };

    this.loadCompletionStock(order);
  }

  loadCompletionStock(order: ServiceOrder): void {
    if (!order.selectedFirePositionId) {
      return;
    }

    this.completeStockLoadingByOrderId[order.id] = true;

    this.firePositions
      .getCard(order.selectedFirePositionId)
      .pipe(
        finalize(() => {
          this.completeStockLoadingByOrderId[order.id] = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (card) => {
          this.completeStockByOrderId[order.id] = this.mapCompletionStock(order, card);
          this.ensureCompletionDefaults(order);
        },
        error: () => {
          this.completeStockByOrderId[order.id] = this.mapCompletionStock(order, null);
        },
      });
  }

  private mapCompletionStock(
    order: ServiceOrder,
    card: FirePositionCard | null,
  ): {
    shells: CompletionShellOption[];
    charges: CompletionChargeOption[];
  } {
    const shells = new Map<string, CompletionShellOption>();
    const charges = new Map<string, CompletionChargeOption>();

    for (const item of card?.localStock.shells || []) {
      if (!item.shellId) continue;
      shells.set(item.shellId, {
        id: item.shellId,
        marking: item.shell?.marking || item.shellId,
        quantity: Number(item.quantity || 0),
      });
    }

    for (const item of card?.localStock.charges || []) {
      if (!item.chargeId) continue;
      charges.set(item.chargeId, {
        id: item.chargeId,
        marking: item.charge?.marking || item.chargeId,
        quantity: Number(item.quantity || 0),
        chargeKind: item.charge?.chargeKind || 'unit',
        modulesPerCharge: item.charge?.modulesPerCharge ?? null,
        maxUsableModules: item.charge?.maxUsableModules ?? null,
      });
    }

    if (order.selectedShellId && order.selectedShell && !shells.has(order.selectedShellId)) {
      shells.set(order.selectedShellId, {
        id: order.selectedShellId,
        marking: order.selectedShell.marking,
        quantity: 0,
      });
    }

    if (order.selectedChargeId && order.selectedCharge && !charges.has(order.selectedChargeId)) {
      charges.set(order.selectedChargeId, {
        id: order.selectedChargeId,
        marking: order.selectedCharge.marking,
        quantity: 0,
        chargeKind: order.selectedCharge.chargeKind || 'unit',
        modulesPerCharge: order.selectedCharge.modulesPerCharge ?? null,
        maxUsableModules: order.selectedCharge.maxUsableModules ?? null,
      });
    }

    return {
      shells: Array.from(shells.values()).sort((a, b) => a.marking.localeCompare(b.marking)),
      charges: Array.from(charges.values()).sort((a, b) => a.marking.localeCompare(b.marking)),
    };
  }

  private ensureCompletionDefaults(order: ServiceOrder): void {
    const form = this.getCompleteForm(order);
    const stock = this.completeStockByOrderId[order.id];

    if (!form.actualShellId && stock?.shells[0]) {
      form.actualShellId = stock.shells[0].id;
    }

    if (!form.actualChargeId && stock?.charges[0]) {
      form.actualChargeId = stock.charges[0].id;
    }

    if (form.actualAmmoItems.length === 0) {
      form.actualAmmoItems.push({
        shellId: form.actualShellId,
        chargeId: form.actualChargeId,
        quantity: form.actualQuantity || '1',
        chargeModulesPerShot: form.chargeModulesPerShot,
      });
    }

    form.actualAmmoItems.forEach((_, index) => this.onCompletionShellChanged(order, index));
    this.onCompletionChargeChanged(order);
  }

  getCompletionShellOptions(order: ServiceOrder): CompletionShellOption[] {
    return this.completeStockByOrderId[order.id]?.shells || [];
  }

  getCompletionChargeOptions(order: ServiceOrder): CompletionChargeOption[] {
    return this.completeStockByOrderId[order.id]?.charges || [];
  }

  getCompletionChargeOption(order: ServiceOrder, chargeId: string): CompletionChargeOption | null {
    return this.getCompletionChargeOptions(order).find((item) => item.id === chargeId) || null;
  }

  addCompletionAmmoItem(order: ServiceOrder): void {
    const form = this.getCompleteForm(order);
    form.actualAmmoItems.push({
      shellId: this.getCompletionShellOptions(order)[0]?.id || '',
      chargeId: '',
      quantity: '1',
      chargeModulesPerShot: '',
    });
    this.onCompletionShellChanged(order, form.actualAmmoItems.length - 1);
  }

  removeCompletionAmmoItem(order: ServiceOrder, index: number): void {
    const form = this.getCompleteForm(order);
    if (form.actualAmmoItems.length <= 1) return;
    form.actualAmmoItems.splice(index, 1);
  }

  onCompletionShellChanged(order: ServiceOrder, index: number): void {
    const item = this.getCompleteForm(order).actualAmmoItems[index];
    if (!item) return;

    const charges = this.getCompatibleCompletionChargeOptions(order, item.shellId);
    if (!charges.some((charge) => charge.id === item.chargeId)) {
      item.chargeId = charges[0]?.id || '';
    }

    this.onCompletionAmmoChargeChanged(order, index);
  }

  onCompletionAmmoChargeChanged(order: ServiceOrder, index: number): void {
    const item = this.getCompleteForm(order).actualAmmoItems[index];
    if (!item) return;

    const charge = this.getCompletionChargeOption(order, item.chargeId);
    if (!charge || charge.chargeKind !== 'modular') {
      item.chargeModulesPerShot = '';
      return;
    }

    const current = Number(item.chargeModulesPerShot);
    const maxModules = this.getCompletionChargeMaxModules(charge);

    if (!Number.isInteger(current) || current <= 0 || current > maxModules) {
      item.chargeModulesPerShot = String(maxModules);
    }
  }

  getCompatibleCompletionChargeOptions(
    order: ServiceOrder,
    shellId: string,
  ): CompletionChargeOption[] {
    const charges = this.getCompletionChargeOptions(order);
    if (!shellId) return charges;

    const compatibleChargeIds = new Set(
      this.compatibleCharges
        .filter((item) => item.shellId === shellId)
        .map((item) => item.chargeId),
    );

    return compatibleChargeIds.size > 0
      ? charges.filter((charge) => compatibleChargeIds.has(charge.id))
      : charges;
  }

  getCompletionAmmoChargeWriteOff(order: ServiceOrder, item: CompletionAmmoFormItem): string {
    const shotQuantity = Number(item.quantity);
    const charge = this.getCompletionChargeOption(order, item.chargeId);

    if (!Number.isFinite(shotQuantity) || shotQuantity <= 0 || !charge) {
      return '—';
    }

    if (charge.chargeKind !== 'modular') {
      return String(shotQuantity);
    }

    const modulesPerCharge = Number(charge.modulesPerCharge || 0);
    const modulesPerShot = Number(item.chargeModulesPerShot);

    if (modulesPerCharge <= 0 || modulesPerShot <= 0) {
      return '—';
    }

    return ((shotQuantity * modulesPerShot) / modulesPerCharge).toFixed(3);
  }

  getCompletionAmmoTotal(order: ServiceOrder): number {
    return this.getCompleteForm(order).actualAmmoItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0,
    );
  }

  onCompletionChargeChanged(order: ServiceOrder): void {
    const form = this.getCompleteForm(order);
    const charge = this.getCompletionChargeOption(order, form.actualChargeId);

    if (!charge || charge.chargeKind !== 'modular') {
      form.chargeModulesPerShot = '';
      return;
    }

    const current = Number(form.chargeModulesPerShot);
    const maxModules = this.getCompletionChargeMaxModules(charge);

    if (!Number.isInteger(current) || current <= 0 || current > maxModules) {
      form.chargeModulesPerShot = String(maxModules);
    }
  }

  getCompletionChargeMaxModules(charge: CompletionChargeOption): number {
    return Math.max(1, Number(charge.maxUsableModules || charge.modulesPerCharge || 1));
  }

  getCompletionChargeModuleOptions(order: ServiceOrder): number[] {
    const charge = this.getCompletionChargeOption(
      order,
      this.getCompleteForm(order).actualChargeId,
    );

    if (!charge || charge.chargeKind !== 'modular') return [];

    return Array.from(
      { length: this.getCompletionChargeMaxModules(charge) },
      (_, index) => index + 1,
    );
  }

  getCompletionAmmoModuleOptions(order: ServiceOrder, item: CompletionAmmoFormItem): number[] {
    const charge = this.getCompletionChargeOption(order, item.chargeId);

    if (!charge || charge.chargeKind !== 'modular') return [];

    return Array.from(
      { length: this.getCompletionChargeMaxModules(charge) },
      (_, index) => index + 1,
    );
  }

  getCompletionChargeWriteOff(order: ServiceOrder): string {
    const form = this.getCompleteForm(order);
    const shotQuantity = Number(form.actualQuantity);
    const charge = this.getCompletionChargeOption(order, form.actualChargeId);

    if (!Number.isFinite(shotQuantity) || shotQuantity <= 0 || !charge) {
      return '—';
    }

    if (charge.chargeKind !== 'modular') {
      return String(shotQuantity);
    }

    const modulesPerCharge = Number(charge.modulesPerCharge || 0);
    const modulesPerShot = Number(form.chargeModulesPerShot);

    if (modulesPerCharge <= 0 || modulesPerShot <= 0) {
      return '—';
    }

    return ((shotQuantity * modulesPerShot) / modulesPerCharge).toFixed(3);
  }

  closeCompleteModal(): void {
    if (this.modalSubmitting) {
      return;
    }

    this.completeModalOrder = null;
  }

  saveCompleteModal(): void {
    if (!this.completeModalOrder) return;

    this.complete(this.completeModalOrder);
  }

  openCancelModal(order: ServiceOrder): void {
    this.cancelModalOrder = order;
    this.cancelReasonByOrderId[order.id] = '';
    this.errorMessage = '';
    this.modalSubmitting = false;
    this.closeActions();
  }

  closeCancelModal(): void {
    if (this.modalSubmitting) {
      return;
    }

    this.cancelModalOrder = null;
  }

  saveCancelModal(): void {
    if (!this.cancelModalOrder) return;

    this.cancel(this.cancelModalOrder);
  }

  openRejectModal(order: ServiceOrder): void {
    this.rejectModalOrder = order;
    this.rejectReasonByOrderId[order.id] = '';
    this.errorMessage = '';
    this.modalSubmitting = false;
    this.closeActions();
  }

  closeRejectModal(): void {
    if (this.modalSubmitting) {
      return;
    }

    this.rejectModalOrder = null;
  }

  saveRejectModal(): void {
    if (!this.rejectModalOrder) return;

    this.reject(this.rejectModalOrder);
  }

  toggleActions(order: ServiceOrder): void {
    this.openedActionsOrderId = this.openedActionsOrderId === order.id ? null : order.id;
  }

  closeActions(): void {
    this.openedActionsOrderId = null;
  }

  private finishModalRequest(): void {
    this.modalSubmitting = false;
  }

  private syncOpenOrderReferences(items: ServiceOrder[]): void {
    const findFreshOrder = (id: string): ServiceOrder | null =>
      items.find((item) => item.id === id) || null;

    if (this.completeModalOrder) {
      this.completeModalOrder = findFreshOrder(this.completeModalOrder.id);
    }

    if (this.cancelModalOrder) {
      this.cancelModalOrder = findFreshOrder(this.cancelModalOrder.id);
    }

    if (this.rejectModalOrder) {
      this.rejectModalOrder = findFreshOrder(this.rejectModalOrder.id);
    }

    if (this.selectedOrderId && !findFreshOrder(this.selectedOrderId)) {
      this.selectedOrderId = null;
      this.suggestions = [];
    }
  }

  private scrollFocusedOrderIntoView(): void {
    if (!this.focusedOrderId || typeof document === 'undefined') {
      return;
    }

    setTimeout(() => {
      const element = document.getElementById(`service-order-${this.focusedOrderId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  private clearCreateQueryParams(): void {
    const snapshot = this.route.snapshot.queryParamMap;

    if (!snapshot.has('create') && !snapshot.has('lat') && !snapshot.has('lng')) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { create: null, lat: null, lng: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  toggleHistory(order: ServiceOrder): void {
    this.expandedHistoryOrderId = this.expandedHistoryOrderId === order.id ? null : order.id;
  }

  resetHistoryFilters(): void {
    this.historyFilters = {
      ...this.getTodayDateTimeFilter(),
      status: '',
      resultType: '',
      search: '',
    };
  }

  canEditCompleted(order: ServiceOrder): boolean {
    if (order.status !== 'completed' || !order.completedAt) {
      return false;
    }

    const completedAt = new Date(order.completedAt).getTime();

    return Date.now() - completedAt <= 30 * 60 * 1000;
  }

  get activeItems(): ServiceOrder[] {
    return this.items
      .filter((item) => {
        if (item.status === 'completed' || item.status === 'cancelled') {
          return false;
        }

        if (this.problemFilter === 'needs_action') {
          return [
            'draft',
            'proposed',
            'sent',
            'sent_to_division',
            'sent_to_battery',
            'accepted',
            'rejected',
            'in_progress',
          ].includes(item.status);
        }

        if (this.problemFilter === 'no_position') {
          return !this.hasSelectedExecutor(item);
        }

        if (this.problemFilter === 'overdue') {
          return this.isOrderOverdue(item);
        }

        if (this.problemFilter === 'today') {
          return isSameKyivDate(item.createdAt);
        }

        if (this.problemFilter === 'no_assignee') {
          return !item.assignedUnitId;
        }

        if (this.problemFilter === 'long_progress') {
          return (
            item.status === 'in_progress' && minutesSince(item.startedAt || item.updatedAt) >= 120
          );
        }

        if (this.problemFilter === 'rejected') {
          return item.status === 'rejected';
        }

        if (this.problemFilter === 'in_progress') {
          return item.status === 'in_progress';
        }

        if (this.problemFilter === 'sent') {
          return (
            item.status === 'sent' ||
            item.status === 'sent_to_division' ||
            item.status === 'sent_to_battery'
          );
        }

        return true;
      })
      .sort((a, b) => this.getOrderPriority(b) - this.getOrderPriority(a));
  }

  get historyItems(): ServiceOrder[] {
    return this.items.filter((item) => {
      if (item.status !== 'completed' && item.status !== 'cancelled') {
        return false;
      }

      if (this.historyFilters.status && item.status !== this.historyFilters.status) {
        return false;
      }

      if (this.historyFilters.resultType && item.resultType !== this.historyFilters.resultType) {
        return false;
      }

      if (!this.isWithinHistoryDateFilter(item)) {
        return false;
      }

      const search = this.historyFilters.search.trim().toLowerCase();

      if (search) {
        const text = [
          item.orderNumber,
          item.targetSettlement,
          item.resultComment,
          item.rejectionReason,
          item.taskType,
          item.selectedFirePosition?.name,
          item.selectedShell?.marking,
          item.selectedCharge?.marking,
          item.selectedZone
            ? `Зона ${item.selectedZone.zoneNumber} ${item.selectedZone.distanceFromM}-${item.selectedZone.distanceToM}`
            : null,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!text.includes(search)) {
          return false;
        }
      }

      return true;
    });
  }

  formatKyivDateTime(value: string | Date | null | undefined): string {
    return formatKyivDateTime(value);
  }

  private isOrderOverdue(order: ServiceOrder): boolean {
    if (order.status === 'completed' || order.status === 'cancelled') return false;

    const ageMinutes = minutesSince(order.createdAt);
    const workMinutes = minutesSince(order.startedAt || order.updatedAt);

    if (order.status === 'draft') return ageMinutes >= 60;
    if (order.status === 'proposed') return ageMinutes >= 45;
    if (['sent', 'sent_to_division', 'sent_to_battery'].includes(order.status))
      return ageMinutes >= 90;
    if (order.status === 'accepted') return ageMinutes >= 120;
    if (order.status === 'in_progress') return workMinutes >= 180;
    if (order.status === 'rejected') return ageMinutes >= 60;

    return false;
  }

  getStatusLabel(status: string): string {
    if (status === 'draft') return 'Чернетка';
    if (status === 'proposed') return 'На розгляді';
    if (status === 'sent') return 'Надіслано';
    if (status === 'sent_to_division') return 'Надіслано дивізіону';
    if (status === 'sent_to_battery') return 'Надіслано батареї';
    if (status === 'accepted') return 'Прийнято';
    if (status === 'rejected') return 'Відхилено';
    if (status === 'in_progress') return 'У роботі';
    if (status === 'completed') return 'Завершено';
    if (status === 'cancelled') return 'Скасовано';

    return status;
  }

  getStatusClass(status: string): string {
    if (status === 'draft') return 'draft';
    if (status === 'proposed') return 'warning';
    if (status === 'sent' || status === 'sent_to_division' || status === 'sent_to_battery') {
      return 'sent';
    }
    if (status === 'accepted') return 'accepted';
    if (status === 'in_progress') return 'progress';
    if (status === 'completed') return 'ready';
    if (status === 'rejected' || status === 'cancelled') return 'danger';

    return 'unknown';
  }

  getTaskTypeLabel(type: string): string {
    if (type === 'service') return 'Бойове обслуговування';
    if (type === 'training') return 'Тренування';
    if (type === 'smoke') return 'Димова завіса';
    if (type === 'illumination') return 'Освітлення';
    if (type === 'other') return 'Інше';

    return type;
  }

  getResultTypeLabel(type: string | null): string {
    if (type === 'mining') return 'Мінування';
    if (type === 'area_denial') return 'Закриття зони';
    if (type === 'hit') return 'Ураження';
    if (type === 'destroyed') return 'Знищено';
    if (type === 'suppression') return 'Придушення';
    if (type === 'smoke') return 'Димова завіса';
    if (type === 'fire') return 'Пожежа';
    if (type === 'illumination') return 'Освітлення';

    return '?';
  }

  getZoneLabel(
    zone: {
      id: string;
      zoneNumber: number;
      distanceFromM: number;
      distanceToM: number;
    } | null,
  ): string {
    if (!zone) return '?';

    return `Зона ${zone.zoneNumber} (${zone.distanceFromM}-${zone.distanceToM} м)`;
  }

  getSelectedZoneLabel(order: ServiceOrder): string {
    return this.getZoneLabel(order.selectedZone);
  }

 isSuggestionExpanded(suggestion: ServiceOrderSuggestion, index: number): boolean {
  const key = this.getSuggestionKey(suggestion);

  if (this.expandedSuggestionIds[key] === undefined) {
    return index === 0;
  }

  return this.expandedSuggestionIds[key];
}

 toggleSuggestion(suggestion: ServiceOrderSuggestion): void {
  const key = this.getSuggestionKey(suggestion);
  const current = this.expandedSuggestionIds[key];

  this.expandedSuggestionIds[key] = current === undefined ? false : !current;
}

getSuggestionKey(suggestion: ServiceOrderSuggestion): string {
  return suggestion.firePosition?.id || suggestion.airAssetPosition?.id || 'unknown';
}

getSuggestionTitle(suggestion: ServiceOrderSuggestion): string {
  if (suggestion.executorType === 'air_asset_position') {
    return (
      suggestion.airAssetPosition?.callsign ||
      suggestion.airAssetPosition?.name ||
      'Бойовий БпЛА'
    );
  }

  return suggestion.firePosition?.name || 'ВП';
}

getSuggestionExecutorLabel(suggestion: ServiceOrderSuggestion): string {
  return suggestion.executorType === 'air_asset_position' ? 'Бойовий БпЛА' : 'ВП';
}

getSuggestionUnitName(suggestion: ServiceOrderSuggestion): string {
  return (
    suggestion.firePosition?.unit?.name ||
    suggestion.airAssetPosition?.unit?.name ||
    '—'
  );
}

getSuggestionVariantCount(suggestion: ServiceOrderSuggestion): number {
  return suggestion.executorType === 'air_asset_position'
    ? suggestion.payloadVariants?.length || 0
    : suggestion.variants.length;
}

getPayloadLabel(payload: ServiceOrderAirPayloadVariant): string {
  return `${payload.droneModel?.name || 'Борт'} + ${payload.warheadType?.name || 'БЧ'}`;
}


  setOrderBoardTab(tab: 'active' | 'in_progress' | 'completed' | 'cancelled' | 'history' | 'planned_puar'): void {
    this.orderBoardTab = tab;

    if (tab === 'planned_puar') {
      this.loadPlannedPuar();
      return;
    }

    if (tab === 'active') {
      this.setProblemFilter('');
      this.historyFilters.status = '';
      return;
    }

    if (tab === 'in_progress') {
      this.setProblemFilter('in_progress');
      this.historyFilters.status = '';
      return;
    }

    if (tab === 'completed') {
      this.historyFilters.status = 'completed';
      return;
    }

    if (tab === 'cancelled') {
      this.historyFilters.status = 'cancelled';
      return;
    }

    this.historyFilters.status = '';
  }

  get boardActiveItems(): ServiceOrder[] {
    if (
      this.orderBoardTab === 'history' ||
      this.orderBoardTab === 'completed' ||
      this.orderBoardTab === 'cancelled'
    ) {
      return [];
    }

    return this.activeItems;
  }

  get boardHistoryItems(): ServiceOrder[] {
    if (this.orderBoardTab === 'active' || this.orderBoardTab === 'in_progress') {
      return [];
    }

    return this.historyItems;
  }

  setViewMode(mode: 'cards' | 'list'): void {
    this.viewMode = mode;
    this.saveViewPreferences();
  }

  setProblemFilter(value: string): void {
    this.problemFilter = value;
    this.saveViewPreferences();
  }

  setTodayDateFilter(): void {
    this.targetDateFilter = this.getTodayDateTimeFilter();
  }

  clearDateFilter(): void {
    this.targetDateFilter = { from: '', to: '' };
  }

  setTodayHistoryFilter(): void {
    this.historyFilters = {
      ...this.historyFilters,
      ...this.getTodayDateTimeFilter(),
    };
  }

  clearHistoryDateFilter(): void {
    this.historyFilters = {
      ...this.historyFilters,
      from: '',
      to: '',
    };
  }

  showOnMap(order: ServiceOrder): void {
    void this.router.navigate(['/map'], {
      queryParams: this.getMapQueryParams(order),
    });
  }

  getSuggestionReason(
    suggestion: ServiceOrderSuggestion,
    variant: ServiceOrderSuggestionVariant,
  ): string {
    return [
      'Є рішення',
      `відстань ${Math.round(suggestion.distanceM)} м`,
      `запас ${Math.round(variant.rangeReserveM)} м`,
      `наявно ${variant.availableQuantity}`,
      `виконано ВГЗ: ${suggestion.completedVgzCount}`,
    ].join(' · ');
  }

  getShortCoordinates(order: ServiceOrder): string {
    return this.getDecimalCoordinates(order) !== '—'
      ? this.getDecimalCoordinates(order)
      : this.getMgrsCoordinates(order);
  }

  getDecimalCoordinates(order: ServiceOrder): string {
    const lat = Number(order.targetLat);
    const lng = Number(order.targetLng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return '—';
    }

    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  getMgrsCoordinates(order: ServiceOrder): string {
    return this.formatMgrs(order.targetMgrs);
  }

  onTargetMgrsInput(value: string): void {
    this.form.targetMgrs = this.formatMgrs(value, '');
  }

  normalizeFormMgrs(): void {
    this.form.targetMgrs = this.formatMgrs(this.form.targetMgrs, '');
  }

  isValidMgrs(value: string | null | undefined): boolean {
    const compact = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    return /^\d{1,2}[C-X][A-Z]{2}\d{10}$/.test(compact);
  }

  formatMgrs(value: string | null | undefined, emptyValue = '—'): string {
    const raw = (value ?? '').trim();

    if (!raw) {
      return emptyValue;
    }

    const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = compact.match(/^(\d{1,2}[C-X])([A-Z]{2})(\d{5})(\d{5})$/);

    if (!match) {
      return raw.toUpperCase().replace(/\s+/g, ' ');
    }

    const [, zone, square, easting, northing] = match;

    return `${zone} ${square} ${easting} ${northing}`;
  }

  getCoordinateSummary(order: ServiceOrder): string {
    const decimal = this.getDecimalCoordinates(order);
    const mgrs = this.getMgrsCoordinates(order);

    if (decimal !== '—' && mgrs !== '—') {
      return `${decimal} · MGRS ${mgrs}`;
    }

    if (decimal !== '—') {
      return decimal;
    }

    return mgrs;
  }

  getAmmoSummary(order: ServiceOrder): string {
    const parts = [
      order.selectedShell?.marking,
      order.selectedCharge?.marking,
      this.getSelectedZoneLabel(order),
    ].filter((value) => value && value !== '?');

    return parts.length > 0 ? parts.join(' · ') : 'БК не обрано';
  }

  getOperatorHint(order: ServiceOrder): string {
    if (order.status === 'rejected') {
      return `Відхилено: ${order.rejectionReason || 'причину не вказано'}`;
    }

    if (!order.selectedFirePosition) {
      return `Вже ${this.minutesSince(order.createdAt)} хв без підібраної ВП`;
    }

    if (
      order.status === 'sent' ||
      order.status === 'sent_to_division' ||
      order.status === 'sent_to_battery'
    ) {
      return `Очікує відповіді: ${order.selectedFirePosition.unit?.name || 'підрозділ не вказано'}`;
    }

    if (order.status === 'in_progress') {
      return `У роботі ${this.minutesSince(order.startedAt || order.updatedAt)} хв з моменту початку виконання`;
    }

    if (order.status === 'accepted') {
      return 'Потрібно розпочати виконання або закрити вогневе завдання';
    }

    return `Пріоритет: ${this.getOrderPriority(order)}`;
  }

  hasSelectedExecutor(order: ServiceOrder): boolean {
    return order.executorType === 'air_asset_position'
      ? !!order.selectedAirAssetPosition
      : !!order.selectedFirePosition;
  }

  getExecutorName(order: ServiceOrder): string {
    if (order.executorType === 'air_asset_position') {
      return order.selectedAirAssetPosition?.callsign || order.selectedAirAssetPosition?.name || '—';
    }

    return order.selectedFirePosition?.name || '—';
  }

  getExecutorUnitName(order: ServiceOrder): string {
    if (order.executorType === 'air_asset_position') {
      return order.selectedAirAssetPosition?.unit?.name || 'підрозділ не вказано';
    }

    return order.selectedFirePosition?.unit?.name || 'підрозділ не вказано';
  }

  getOrderPriority(order: ServiceOrder): number {
    let priority = 0;

    if (order.status === 'rejected') priority += 100;
    if (!this.hasSelectedExecutor(order)) priority += 90;

    if (
      order.status === 'sent' ||
      order.status === 'sent_to_division' ||
      order.status === 'sent_to_battery'
    ) {
      priority += 70;
    }

    if (order.status === 'accepted') priority += 65;
    if (order.status === 'in_progress') priority += 60;
    if (order.status === 'draft') priority += 50;

    priority += Math.min(this.minutesSince(order.createdAt), 120) / 10;

    return priority;
  }

  private isWithinTargetDateFilter(order: ServiceOrder): boolean {
    return this.isWithinDateTimeRange(
      order.createdAt,
      this.targetDateFilter.from,
      this.targetDateFilter.to,
    );
  }

  private isWithinHistoryDateFilter(order: ServiceOrder): boolean {
    const value = order.completedAt || order.updatedAt || order.createdAt;
    return this.isWithinDateTimeRange(value, this.historyFilters.from, this.historyFilters.to);
  }

  private isWithinDateTimeRange(
    value: string | Date | null | undefined,
    from: string,
    to: string,
  ): boolean {
    if (!value) {
      return false;
    }

    const time = new Date(value).getTime();

    if (!Number.isFinite(time)) {
      return false;
    }

    if (from) {
      const fromTime = new Date(from).getTime();
      if (Number.isFinite(fromTime) && time < fromTime) {
        return false;
      }
    }

    if (to) {
      const toTime = new Date(to).getTime();
      if (Number.isFinite(toTime) && time > toTime) {
        return false;
      }
    }

    return true;
  }

  private getTodayDateTimeFilter(): { from: string; to: string } {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return {
      from: this.toLocalDatetimeValue(start),
      to: this.toLocalDatetimeValue(end),
    };
  }

  private getMapQueryParams(order: ServiceOrder) {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      lat: order.targetLat,
      lng: order.targetLng,
      positionId: order.selectedFirePosition?.id || '',
      airAssetId: order.selectedAirAssetPosition?.id || '',
    };
  }

  private restoreViewPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const viewMode = localStorage.getItem(this.viewModeKey);

    if (viewMode === 'list') {
      this.viewMode = 'list';
    } else if (viewMode === 'cards' || viewMode === 'split') {
      this.viewMode = 'list';
      localStorage.setItem(this.viewModeKey, 'list');
    }

    this.problemFilter = localStorage.getItem(this.problemFilterKey) || '';
  }

  private saveViewPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(this.viewModeKey, this.viewMode);
    localStorage.setItem(this.problemFilterKey, this.problemFilter);
  }

  private minutesSince(date: string): number {
    return Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  }

  private getEmptyForm() {
    return {
      orderNumber: '',
      coordinateMode: 'decimal',
      targetLat: '',
      targetLng: '',
      targetMgrs: '',
      targetSettlement: '',
      taskType: '',
      plannedQuantity: '1',
    };
  }

  private toLocalDatetimeValue(date: Date): string {
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;

    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  private fail(error: unknown, message: string): void {
    this.errorMessage = message;
    this.toast.show(message, 'danger');
    this.loading = false;
    this.cdr.detectChanges();
  }

selectAirAssetSuggestion(
  order: ServiceOrder,
  suggestion: ServiceOrderSuggestion,
  payload: ServiceOrderAirPayloadVariant,
): void {
  this.errorMessage = '';

  if (!suggestion.airAssetPosition?.id) {
    this.errorMessage = 'Повітряний розрахунок не визначено';
    return;
  }

  if (!order.targetLat || !order.targetLng) {
    this.errorMessage = 'Для бойової задачі БпЛА потрібні координати цілі';
    return;
  }

 this.service
  .selectAirAsset(order.id, {
    airAssetPositionId: suggestion.airAssetPosition.id,
    droneModelId: payload.droneModelId,
    warheadTypeId: payload.warheadTypeId,
  })
    .subscribe({
      next: () => {
  this.toast.show('Бойовий БпЛА обрано для ВГЗ', 'success');
  this.eventFeed.add({
    type: 'success',
    title: `Для ${order.orderNumber} обрано бойовий БпЛА`,
    details: `${suggestion.airAssetPosition?.callsign || suggestion.airAssetPosition?.name} · ${this.getPayloadLabel(payload)}`,
    route: '/service-orders',
  });

  this.selectedOrderId = null;
  this.suggestions = [];
  this.closeActions();
  this.load();
},
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося створити бойову задачу БпЛА'),
    });
}

sendToUnit(order: ServiceOrder): void {
  this.errorMessage = '';

  this.service.sendToUnit(order.id).subscribe({
    next: () => {
      this.toast.show('Вогневе завдання передано на ПУВБ', 'success');
      this.eventFeed.add({
        type: 'info',
        title: `Вогневе завдання ${order.orderNumber} передано на ПУВБ`,
        details:
          order.executorType === 'air_asset_position'
            ? 'Виконавець: бойовий БпЛА'
            : `ВП: ${order.selectedFirePosition?.name || '—'}. Система автоматично визначила батарею та дивізіон.`,
        route: '/service-orders',
      });

      this.closeActions();
      this.load();
    },
    error: (error) =>
      this.fail(error, error?.error?.message || 'Не вдалося передати вогневе завдання на ПУВБ'),
  });
}

}
