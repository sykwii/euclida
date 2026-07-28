import { CommonModule } from '@angular/common';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationStart, Router } from '@angular/router';
import { EventFeedService } from '../../../core/event-feed.service';
import { formatKyivDateTime, isSameKyivDate, minutesSince } from '../../../core/kyiv-time.util';
import { filter, finalize, Subscription, switchMap } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { ToastService } from '../../../core/toast.service';
import { AuthService, LoginResponse } from '../../auth/auth.service';
import { FirePositionCard } from '../../fire-positions/fire-position-card.model';
import { FirePosition } from '../../fire-positions/fire-position.model';
import { FirePositionsService } from '../../fire-positions/fire-positions.service';
import { ReconPuarProposal } from '../../recon/recon.model';
import { ReconService } from '../../recon/recon.service';
import { WeaponSystem } from '../../weapon-systems/weapon-system.model';
import { WeaponSystemsService } from '../../weapon-systems/weapon-systems.service';
import { ExecutionRecord, ExecutionRecordPurpose } from '../execution-record.model';
import { ExecutionRecordsService } from '../execution-records.service';
import { ServiceOrder } from '../service-order.model';
import {
 ServiceOrderAirPayloadVariant,
ServiceOrderDelivery,
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

export type ServiceOrderPrimaryActionType =
  | 'choose_executor'
  | 'choose_kit'
  | 'send'
  | 'accept'
  | 'start'
  | 'add_execution'
  | 'continue_execution'
  | 'complete';

export interface ServiceOrderPrimaryAction {
  type: ServiceOrderPrimaryActionType;
  label: string;
  visualVariant: 'cyan' | 'blue' | 'green' | 'amber';
  disabled: boolean;
  disabledReason: string | null;
  loading: boolean;
  handler: () => void;
}

@Component({
  selector: 'app-service-orders-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkOverlayOrigin, CdkConnectedOverlay],
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
  actionsMenuOrder: ServiceOrder | null = null;
  actionsOverlayOrigin: CdkOverlayOrigin | null = null;
  workflowActionOrderId: string | null = null;
  readonly actionsMenuPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 6,
      panelClass: 'service-order-menu-below',
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -6,
      panelClass: 'service-order-menu-above',
    },
  ];
  @ViewChild('actionsMenu') private actionsMenu?: ElementRef<HTMLElement>;
  private actionsTrigger: HTMLButtonElement | null = null;
  private actionsAnchorObserver: IntersectionObserver | null = null;
  readonly pageSkeleton = Array.from({ length: 6 });
  deliveries: ServiceOrderDelivery[] = [];
  deliveriesLoading = false;
  unreadDeliveryCount = 0;
  selectedDeliveryId: string | null = null;
  firePositionCandidates: FirePosition[] = [];
  weaponCandidates: WeaponSystem[] = [];
  deliveryForms: Record<
    string,
    {
      estimatedReadyAt: string;
      comment: string;
      rejectionReason: string;
      selectedFirePositionId: string;
      selectedWeaponSystemId: string;
      submitting: boolean;
    }
  > = {};

  selectedDetailsOrderId: string | null = null;
  selectedExecutorByOrderId: Record<string, ServiceOrderSuggestion> = {};
  selectedKitByOrderId: Record<string, ServiceOrderSuggestionVariant> = {};

  get selectedDetailsOrder(): ServiceOrder | null {
    return (
      this.activeItems.find((item) => item.id === this.selectedDetailsOrderId) ||
      this.activeItems[0] ||
      null
    );
  }

  selectOrderDetails(order: ServiceOrder): void {
    this.selectedDetailsOrderId = order.id;
    this.loadExecutionRecords(order);
  }

  trackByOrderId(_index: number, order: ServiceOrder): string {
    return order.id;
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
  rejectedSuggestionsExpanded = false;
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
  completeStockByOrderId: Record<
    string,
    {
      shells: CompletionShellOption[];
      charges: CompletionChargeOption[];
    }
  > = {};
  completeStockLoadingByOrderId: Record<string, boolean> = {};
  executionRecordsByOrderId: Record<string, ExecutionRecord[]> = {};
  executionLoadingByOrderId: Record<string, boolean> = {};
  executionLoadRequestByOrderId: Record<string, number> = {};
  executionSavingByOrderId: Record<string, boolean> = {};
  executionRecordSavingById: Record<string, boolean> = {};
  executionValidationByRecordId: Record<string, string[]> = {};
  executionFormByOrderId: Record<
    string,
    {
      purpose: ExecutionRecordPurpose;
      quantity: string;
      comment: string;
    }
  > = {};

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
    private readonly reconService: ReconService,
    private readonly executionRecords: ExecutionRecordsService,
    private readonly weaponSystems: WeaponSystemsService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getUser();
    this.restoreViewPreferences();
    this.loadPlannedPuar();
    this.loadDeliveryReferenceData();
    this.loadDeliveries();
    this.load();
    this.autoRefreshSubscription.add(this.route.queryParamMap.subscribe((params) => {
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
    }));

    this.autoRefreshSubscription.add(
      this.router.events.pipe(filter((event) => event instanceof NavigationStart)).subscribe(() => {
        this.closeActions(false);
      }),
    );

    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['missions'], () => {
        this.load(true);
        this.loadDeliveries(true);
      }),
    );

    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all'], (event) => {
        if (event.reason === 'reconnect') this.load(true);
      }),
    );
  }

  ngOnDestroy(): void {
    this.closeActions(false);
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

  loadDeliveries(silent = false): void {
    this.deliveriesLoading = !silent && this.deliveries.length === 0;

    this.service.getDeliveries().subscribe({
      next: (items) => {
        this.deliveries = items;
        this.deliveriesLoading = false;
        this.unreadDeliveryCount = items.filter((item) => item.status === 'new').length;
        for (const item of items) {
          this.ensureDeliveryForm(item);
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.deliveriesLoading = false;
        if (!silent) {
          this.toast.show('Не вдалося завантажити вхідні цілі', 'danger');
        }
      },
    });

    this.service.getDeliveryUnreadCount().subscribe({
      next: ({ count }) => {
        this.unreadDeliveryCount = count;
        this.cdr.detectChanges();
      },
      error: () => undefined,
    });
  }

  private loadDeliveryReferenceData(): void {
    this.firePositions.getAll().subscribe({
      next: (items) => {
        this.firePositionCandidates = items;
        this.cdr.detectChanges();
      },
      error: () => {
        this.firePositionCandidates = [];
      },
    });

    this.weaponSystems.getAll().subscribe({
      next: (items) => {
        this.weaponCandidates = items;
        this.cdr.detectChanges();
      },
      error: () => {
        this.weaponCandidates = [];
      },
    });
  }

  openDelivery(delivery: ServiceOrderDelivery): void {
    this.selectedDeliveryId = this.selectedDeliveryId === delivery.id ? null : delivery.id;
    this.ensureDeliveryForm(delivery);

    if (delivery.status !== 'new') {
      return;
    }

    this.service.markDeliveryViewed(delivery.id).subscribe({
      next: (updated) => {
        this.replaceDelivery(updated);
        this.loadDeliveries(true);
      },
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося позначити доставку як переглянуту'),
    });
  }

  respondToDelivery(delivery: ServiceOrderDelivery, status: 'accepted' | 'rejected'): void {
    const form = this.ensureDeliveryForm(delivery);
    if (form.submitting || !this.beginWorkflowAction(delivery.serviceOrderId)) return;

    if (status === 'rejected' && !form.rejectionReason.trim()) {
      this.errorMessage = 'Для відхилення потрібно вказати причину';
      this.finishWorkflowAction(delivery.serviceOrderId);
      return;
    }

    form.submitting = true;
    this.service
      .respondDelivery(delivery.id, {
        status,
        rejectionReason: form.rejectionReason.trim() || undefined,
        comment: form.comment.trim() || undefined,
        estimatedReadyAt: form.estimatedReadyAt || undefined,
        selectedFirePositionId:
          delivery.recipientLevel === 'battery' && form.selectedFirePositionId
            ? form.selectedFirePositionId
            : undefined,
        selectedWeaponSystemId:
          delivery.recipientLevel === 'battery' && form.selectedWeaponSystemId
            ? form.selectedWeaponSystemId
            : undefined,
      })
      .pipe(
        finalize(() => {
          form.submitting = false;
          this.finishWorkflowAction(delivery.serviceOrderId);
        }),
      )
      .subscribe({
        next: (updated) => {
          this.replaceDelivery(updated);
          this.load(true);
          this.loadDeliveries(true);
          this.toast.show(status === 'accepted' ? 'Доставку прийнято' : 'Доставку відхилено', status === 'accepted' ? 'success' : 'warning');
        },
        error: (error) =>
          this.fail(error, error?.error?.message || 'Не вдалося опрацювати доставку'),
      });
  }

  getDeliverySection(status: 'new' | 'viewed' | 'processed'): ServiceOrderDelivery[] {
    if (status === 'new') {
      return this.deliveries.filter((item) => item.status === 'new');
    }

    if (status === 'viewed') {
      return this.deliveries.filter((item) => item.status === 'viewed');
    }

    return this.deliveries.filter((item) => item.status === 'accepted' || item.status === 'rejected');
  }

  getDeliveryStatusLabel(status: ServiceOrderDelivery['status']): string {
    const labels: Record<ServiceOrderDelivery['status'], string> = {
      new: 'Нова',
      viewed: 'Переглянута',
      accepted: 'Прийнята',
      rejected: 'Відхилена',
    };
    return labels[status] ?? status;
  }

  getDeliveryLevelLabel(level: ServiceOrderDelivery['recipientLevel']): string {
    return level === 'division' ? 'Дивізіон' : 'Батарея';
  }

  getAllowedFirePositions(delivery: ServiceOrderDelivery): FirePosition[] {
    return this.firePositionCandidates.filter(
      (item) => item.unitId === delivery.recipientUnitId && item.positionType === 'fire_position',
    );
  }

  getAllowedWeapons(delivery: ServiceOrderDelivery): WeaponSystem[] {
    return this.weaponCandidates.filter((item) => item.unitId === delivery.recipientUnitId);
  }

  ensureDeliveryForm(delivery: ServiceOrderDelivery) {
    if (!this.deliveryForms[delivery.id]) {
      this.deliveryForms[delivery.id] = {
        estimatedReadyAt: delivery.estimatedReadyAt
          ? this.toLocalDatetimeValue(new Date(delivery.estimatedReadyAt))
          : '',
        comment: delivery.comment || '',
        rejectionReason: delivery.rejectionReason || '',
        selectedFirePositionId:
          delivery.selectedFirePositionId || delivery.serviceOrder.selectedFirePositionId || '',
        selectedWeaponSystemId: delivery.selectedWeaponSystemId || '',
        submitting: false,
      };
    }

    return this.deliveryForms[delivery.id];
  }

  private replaceDelivery(updated: ServiceOrderDelivery): void {
    this.deliveries = this.deliveries.map((item) => (item.id === updated.id ? updated : item));
    this.unreadDeliveryCount = this.deliveries.filter((item) => item.status === 'new').length;
    this.ensureDeliveryForm(updated);
    this.cdr.detectChanges();
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


  openShotConfigurations(): void {
    void this.router.navigate(['/shot-configurations']);
  }

  getVariantComposition(variant: ServiceOrderSuggestionVariant): string {
    const charges = variant.charges
      .map((component) => {
        const unit = component.accountingUnit === 'module' ? 'мод.' : 'шт.';
        return `${component.charge.marking} × ${component.quantityPerShot} ${unit}`;
      })
      .join(' + ');

    const fuze = variant.fuze?.marking ?? 'підривник не задано';
    const primer = variant.primer?.marking ?? 'праймер не задано';

    return `${variant.shell.marking}; ${charges}; ${fuze}; ${primer}`;
  }

  loadSuggestions(order: ServiceOrder): void {
    if (!this.beginWorkflowAction(order.id)) return;
    this.selectedOrderId = order.id;
    this.selectedDetailsOrderId = order.id;
    this.focusedOrderId = order.id;
    this.suggestions = [];
    this.expandedSuggestionIds = {};
    this.rejectedSuggestionsExpanded = false;
    this.suggestionsLoading = true;
    this.errorMessage = '';

    this.service
      .getSuggestions(order.id)
      .pipe(finalize(() => this.finishWorkflowAction(order.id)))
      .subscribe({
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
    return order.status === 'draft' || order.status === 'proposed';
  }

  getCompatibleKits(suggestion: ServiceOrderSuggestion): ServiceOrderSuggestionVariant[] {
    return suggestion.compatibleKits || suggestion.variants || [];
  }

  get validSuggestions(): ServiceOrderSuggestion[] {
    return this.suggestions.filter((suggestion) => suggestion.ready !== false);
  }

  get rejectedSuggestions(): ServiceOrderSuggestion[] {
    return this.suggestions.filter((suggestion) => suggestion.ready === false);
  }

  toggleRejectedSuggestions(): void {
    this.rejectedSuggestionsExpanded = !this.rejectedSuggestionsExpanded;
  }

  selectExecutor(order: ServiceOrder, suggestion: ServiceOrderSuggestion): void {
    if (
      !this.canSelectSuggestion(order) ||
      suggestion.executorType !== 'fire_position' ||
      suggestion.ready === false
    ) {
      return;
    }
    const previous = this.selectedExecutorByOrderId[order.id];
    const changed = previous?.weaponSystemId !== suggestion.weaponSystemId;
    this.selectedExecutorByOrderId[order.id] = suggestion;
    if (changed) delete this.selectedKitByOrderId[order.id];

    const compatibleKits = this.getCompatibleKits(suggestion);
    if (!this.selectedKitByOrderId[order.id] && compatibleKits.length === 1) {
      this.selectedKitByOrderId[order.id] = compatibleKits[0];
    }

    this.expandedSuggestionIds[this.getSuggestionKey(suggestion)] = true;
    this.cdr.markForCheck();
  }

  selectSuggestion(
    order: ServiceOrder,
    suggestion: ServiceOrderSuggestion,
    variant: ServiceOrderSuggestionVariant,
  ): void {
    this.selectExecutor(order, suggestion);
    if (!this.getCompatibleKits(suggestion).some((item) => item.shotConfigurationId === variant.shotConfigurationId)) {
      this.errorMessage = 'Немає сумісного комплекту пострілу';
      return;
    }
    this.selectedKitByOrderId[order.id] = variant;
    this.errorMessage = '';
    this.cdr.markForCheck();
  }

  isSelectedExecutor(order: ServiceOrder, suggestion: ServiceOrderSuggestion): boolean {
    return this.selectedExecutorByOrderId[order.id]?.weaponSystemId === suggestion.weaponSystemId;
  }

  isSelectedKit(order: ServiceOrder, variant: ServiceOrderSuggestionVariant): boolean {
    return this.selectedKitByOrderId[order.id]?.shotConfigurationId === variant.shotConfigurationId;
  }

  private commitSelectionAndSend(order: ServiceOrder): void {
    const suggestion = this.selectedExecutorByOrderId[order.id];
    const variant = this.selectedKitByOrderId[order.id];
    if (
      !suggestion?.firePosition?.id ||
      !suggestion.weaponSystemId ||
      !variant
    ) {
      this.errorMessage = !suggestion ? 'Не вибрано виконавця' : 'Не вибрано комплект пострілу';
      return;
    }
    if (!this.beginWorkflowAction(order.id)) return;

    this.service
      .selectPosition(order.id, {
        firePositionId: suggestion.firePosition.id,
        weaponSystemId: suggestion.weaponSystemId,
        shotConfigurationId: variant.shotConfigurationId,
      })
      .pipe(
        switchMap((selectedOrder) => this.service.sendToUnit(selectedOrder.id)),
        finalize(() => this.finishWorkflowAction(order.id)),
      )
      .subscribe({
        next: () => {
          delete this.selectedExecutorByOrderId[order.id];
          delete this.selectedKitByOrderId[order.id];
          this.selectedOrderId = null;
          this.suggestions = [];
          this.toast.show('Вогневе завдання передано на ПУВБ', 'success');
          this.load(true);
        },
        error: (error) =>
          this.fail(error, error?.error?.message || 'Не вдалося передати вогневе завдання на ПУВБ'),
      });
  }



  accept(order: ServiceOrder): void {
    if (!this.beginWorkflowAction(order.id)) return;
    this.errorMessage = '';

    this.service
      .accept(order.id)
      .pipe(finalize(() => this.finishWorkflowAction(order.id)))
      .subscribe({
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
    if (!this.beginWorkflowAction(order.id)) return;
    this.errorMessage = '';

    this.service
      .start(order.id)
      .pipe(finalize(() => this.finishWorkflowAction(order.id)))
      .subscribe({
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

    const postedExecutionRecords = this.getExecutionRecords(order).filter(
      (record) => record.status === 'posted',
    );
    const executionBacked = postedExecutionRecords.length > 0;
    const actualAmmoItems = form.actualAmmoItems.map((item) => ({
      shellId: item.shellId,
      chargeId: item.chargeId,
      quantity: Number(item.quantity),
      chargeModulesPerShot: Number(item.chargeModulesPerShot),
    }));

    if (
      (!executionBacked && actualAmmoItems.length === 0) ||
      (!executionBacked &&
        actualAmmoItems.some(
          (item) =>
            !item.shellId ||
            !item.chargeId ||
            item.quantity <= 0 ||
            !Number.isInteger(item.quantity),
        ))
    ) {
      this.errorMessage = 'Фактична витрата має бути цілим числом більше 0';
      return;
    }

    for (const item of executionBacked ? [] : actualAmmoItems) {
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
    const actualQuantity = executionBacked
      ? postedExecutionRecords.reduce((sum, record) => sum + Number(record.quantity || 0), 0)
      : actualAmmoItems.reduce((sum, item) => sum + item.quantity, 0);
    const firstItem = actualAmmoItems[0];

    this.service
      .complete(order.id, {
        startedAt: new Date(form.startedAt).toISOString(),
        completedAt: new Date(form.completedAt).toISOString(),
        actualQuantity,
        ...(!executionBacked && firstItem
          ? {
              actualShotConfigurationId: order.selectedShotConfigurationId || undefined,
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
            }
          : {}),
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

  getPrimaryAction(order: ServiceOrder): ServiceOrderPrimaryAction | null {
    if ((order.status === 'draft' || order.status === 'proposed') && this.canControlOrder()) {
      const pendingExecutor = this.selectedExecutorByOrderId[order.id];
      const hasExecutor = !!pendingExecutor || this.hasSelectedExecutor(order);
      if (!hasExecutor) {
        const noOptions =
          this.selectedOrderId === order.id && !this.suggestionsLoading && this.suggestions.length === 0;
        return this.createPrimaryAction(order, {
          type: 'choose_executor',
          label: 'Підібрати виконавця',
          visualVariant: 'cyan',
          disabled: noOptions,
          disabledReason: noOptions ? 'Немає доступних комплектів' : 'Не вибрано виконавця',
        });
      }

      const pendingKit = this.selectedKitByOrderId[order.id];
      const hasShotKit =
        order.executorType === 'air_asset_position' ||
        !!pendingKit ||
        (!!(order.selectedShotConfigurationId || order.selectedShotConfiguration?.id) &&
          !!order.selectedShellId &&
          !!order.selectedChargeId);
      if (!hasShotKit) {
        return this.createPrimaryAction(order, {
          type: 'choose_kit',
          label: 'Обрати комплект',
          visualVariant: 'cyan',
          disabled: false,
          disabledReason:
            pendingExecutor && this.getCompatibleKits(pendingExecutor).length === 0
              ? 'Немає сумісного комплекту пострілу'
              : 'Не вибрано комплект пострілу',
        });
      }

      return this.createPrimaryAction(order, {
        type: 'send',
        label: 'Відправити на ПУВБ',
        visualVariant: 'blue',
        disabled: false,
        disabledReason: null,
      });
    }

    if (order.status === 'sent' || order.status === 'sent_to_division' || order.status === 'sent_to_battery') {
      const delivery = this.getPendingDelivery(order);
      if (!delivery && !this.canExecuteOrder(order)) return null;
      return this.createPrimaryAction(order, {
        type: 'accept',
        label: 'Прийняти',
        visualVariant: 'green',
        disabled: !!delivery && this.ensureDeliveryForm(delivery).submitting,
        disabledReason: null,
      });
    }

    if (order.status === 'accepted' && this.canExecuteOrder(order)) {
      return this.createPrimaryAction(order, {
        type: 'start',
        label: 'Почати виконання',
        visualVariant: 'blue',
        disabled: false,
        disabledReason: null,
      });
    }

    if (order.status === 'in_progress' && this.canExecuteOrder(order)) {
      const records = this.getExecutionRecords(order);
      if (records.some((record) => record.status === 'draft')) {
        return this.createPrimaryAction(order, {
          type: 'continue_execution',
          label: 'Продовжити виконання',
          visualVariant: 'amber',
          disabled: false,
          disabledReason: null,
        });
      }

      if (records.some((record) => record.status === 'posted')) {
        return this.createPrimaryAction(order, {
          type: 'complete',
          label: 'Завершити ВГЗ',
          visualVariant: 'green',
          disabled: false,
          disabledReason: null,
        });
      }

      return this.createPrimaryAction(order, {
        type: 'add_execution',
        label: 'Додати виконання',
        visualVariant: 'cyan',
        disabled: false,
        disabledReason: null,
      });
    }

    return null;
  }

  isPrimaryActionInFlight(order: ServiceOrder): boolean {
    return (
      this.workflowActionOrderId === order.id ||
      !!this.executionSavingByOrderId[order.id] ||
      !!this.executionLoadingByOrderId[order.id]
    );
  }

  runPrimaryAction(order: ServiceOrder, actionType: ServiceOrderPrimaryActionType): void {
    const action = this.getPrimaryAction(order);
    if (!action || action.type !== actionType || action.disabled || action.loading) return;
    this.closeActions();

    if (action.type === 'choose_executor' || action.type === 'choose_kit') {
      if (action.type === 'choose_kit' && this.selectedOrderId === order.id) {
        this.focusCandidateSelection(order);
      } else {
        this.loadSuggestions(order);
      }
    } else if (action.type === 'send') {
      this.selectedExecutorByOrderId[order.id]
        ? this.commitSelectionAndSend(order)
        : this.sendToUnit(order);
    } else if (action.type === 'accept') {
      const delivery = this.getPendingDelivery(order);
      delivery ? this.respondToDelivery(delivery, 'accepted') : this.accept(order);
    } else if (action.type === 'start') {
      this.start(order);
    } else if (action.type === 'add_execution') {
      this.focusExecutionControl(order, 'form');
    } else if (action.type === 'continue_execution') {
      this.focusExecutionControl(order, 'draft');
    } else if (action.type === 'complete') {
      this.openCompleteModal(order);
    }
  }

  private createPrimaryAction(
    order: ServiceOrder,
    action: Omit<ServiceOrderPrimaryAction, 'loading' | 'handler'>,
  ): ServiceOrderPrimaryAction {
    return {
      ...action,
      loading: this.isPrimaryActionInFlight(order),
      handler: () => this.runPrimaryAction(order, action.type),
    };
  }

  private getPendingDelivery(order: ServiceOrder): ServiceOrderDelivery | null {
    const unitId = this.currentUser?.unitId;
    if (!unitId) return null;
    return (
      this.deliveries.find(
        (delivery) =>
          delivery.serviceOrderId === order.id &&
          delivery.recipientUnitId === unitId &&
          (delivery.status === 'new' || delivery.status === 'viewed'),
      ) || null
    );
  }

  hasSecondaryActions(order: ServiceOrder): boolean {
    const sent = ['sent', 'sent_to_division', 'sent_to_battery'].includes(order.status);
    const canCancel =
      (this.canControlOrder() || this.canExecuteOrder(order)) &&
      ['proposed', 'sent', 'sent_to_division', 'sent_to_battery', 'accepted', 'in_progress'].includes(
        order.status,
      );
    return (this.canExecuteOrder(order) && sent) || canCancel || (this.canControlOrder() && order.status === 'draft');
  }

  private focusExecutionControl(order: ServiceOrder, target: 'form' | 'draft'): void {
    const element = document.getElementById(
      target === 'form' ? `execution-form-${order.id}` : `execution-draft-${order.id}`,
    );
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => element?.querySelector<HTMLElement>('input, select, button')?.focus(), 120);
  }

  private focusCandidateSelection(order: ServiceOrder): void {
    const element = document.getElementById(`service-order-candidates-${order.id}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => element?.querySelector<HTMLElement>('button:not([disabled])')?.focus(), 120);
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
    _shellId: string,
  ): CompletionChargeOption[] {
    return this.getCompletionChargeOptions(order);
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

  toggleActions(order: ServiceOrder, origin: CdkOverlayOrigin, event: MouseEvent): void {
    event.stopPropagation();
    if (this.openedActionsOrderId === order.id) {
      this.closeActions();
      return;
    }

    this.closeActions(false);
    this.openedActionsOrderId = order.id;
    this.actionsMenuOrder = order;
    this.actionsOverlayOrigin = origin;
    this.actionsTrigger = event.currentTarget as HTMLButtonElement;
    this.observeActionsAnchor(this.actionsTrigger);
  }

  closeActions(restoreFocus = true): void {
    const trigger = this.actionsTrigger;
    this.actionsAnchorObserver?.disconnect();
    this.actionsAnchorObserver = null;
    this.openedActionsOrderId = null;
    this.actionsMenuOrder = null;
    this.actionsOverlayOrigin = null;
    this.actionsTrigger = null;
    if (restoreFocus && trigger?.isConnected) {
      queueMicrotask(() => trigger.focus());
    }
  }

  onActionsMenuAttached(): void {
    queueMicrotask(() => this.actionsMenu?.nativeElement.querySelector<HTMLElement>('button:not([disabled])')?.focus());
  }

  onActionsMenuDetached(): void {
    if (this.openedActionsOrderId) this.closeActions(false);
  }

  onActionsKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.closeActions();
  }

  private observeActionsAnchor(anchor: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') return;
    this.actionsAnchorObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting && this.openedActionsOrderId) {
        this.closeActions(false);
      }
    });
    this.actionsAnchorObserver.observe(anchor);
  }

  private finishModalRequest(): void {
    this.modalSubmitting = false;
  }

  private beginWorkflowAction(orderId: string): boolean {
    if (this.workflowActionOrderId) return false;
    this.workflowActionOrderId = orderId;
    return true;
  }

  private finishWorkflowAction(orderId: string): void {
    if (this.workflowActionOrderId === orderId) {
      this.workflowActionOrderId = null;
      this.cdr.markForCheck();
    }
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
          this.getSelectedZoneLabel(item),
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
    zoneNumber: number | null | undefined,
  ): string {
    if (!zoneNumber) return '?';

    return `Зона ${zoneNumber}`;
  }

  getSelectedZoneLabel(order: ServiceOrder): string {
    return this.getZoneLabel(
      order.selectedShotConfiguration?.zoneNumber ?? order.selectedZone?.zoneNumber,
    );
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
  return suggestion.weaponSystemId || suggestion.firePosition?.id || suggestion.airAssetPosition?.id || 'unknown';
}

getSuggestionTitle(suggestion: ServiceOrderSuggestion): string {
  if (suggestion.executorType === 'air_asset_position') {
    return (
      suggestion.airAssetPosition?.callsign ||
      suggestion.airAssetPosition?.name ||
      'Бойовий БпЛА'
    );
  }

  const weapon = suggestion.weapon?.callsign || suggestion.weapon?.serialNumber || 'СГ';
  return `${weapon} · ${suggestion.weapon?.model.name || 'Модель не визначено'}`;
}

getSuggestionExecutorLabel(suggestion: ServiceOrderSuggestion): string {
  if (suggestion.executorType === 'air_asset_position') return 'Бойовий БпЛА';
  return suggestion.firePosition?.name || 'Без ВП';
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
    : this.getCompatibleKits(suggestion).length;
}

getSuggestionReadinessLabel(suggestion: ServiceOrderSuggestion): string {
  if (suggestion.ready === true) return 'БГ';
  if (suggestion.ready === false) {
    return suggestion.rejectionReasonLabels?.[0] || 'Не підходить';
  }
  const status = suggestion.readiness?.status || suggestion.firePosition?.readinessStatus || 'unknown';
  if (status === 'combat_ready' || status === 'ready' || status === 'ready_for_combat') {
    return 'БГ';
  }
  return suggestion.readiness?.reason || 'Немає БГ СГ';
}

getSuggestionStockLabel(suggestion: ServiceOrderSuggestion): string {
  if (suggestion.executorType === 'air_asset_position') return 'БК перевірено';
  if (suggestion.stockSummary) {
    return `Оцінка ${suggestion.stockSummary.availableShots} постр.`;
  }
  return suggestion.stockSufficient ? 'БК достатньо' : 'БК недостатньо';
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

  getSuggestionRejectionText(suggestion: ServiceOrderSuggestion): string {
    const reasons = suggestion.rejectionReasonLabels?.filter(Boolean) || [];
    return reasons.length > 0
      ? reasons.join(' · ')
      : 'Немає активного повного комплекту пострілу для моделі СГ, дальності або доступного БК.';
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

  getExecutorPositionLabel(order: ServiceOrder): string {
    return this.selectedExecutorByOrderId[order.id]?.firePosition?.name || order.selectedFirePosition?.name || 'Без ВП';
  }

  getSelectedWeaponLabel(order: ServiceOrder): string {
    const pending = this.selectedExecutorByOrderId[order.id]?.weapon;
    if (pending) {
      return `${pending.callsign || pending.serialNumber || 'СГ'} · ${pending.model.name}`;
    }
    const weapon = this.weaponCandidates.find(
      (item) =>
        (item.currentFirePositionId === order.selectedFirePositionId ||
          item.firePositionId === order.selectedFirePositionId) &&
        item.weaponModelId === order.selectedShotConfiguration?.weaponModelId,
    );
    return weapon
      ? `${weapon.callsign || weapon.serialNumber || 'СГ'} · ${weapon.weaponModel?.name || 'модель'}`
      : '—';
  }

  getExecutorDistanceLabel(order: ServiceOrder): string {
    const distance = this.selectedExecutorByOrderId[order.id]?.distanceM;
    return Number.isFinite(distance) ? `${Math.round(Number(distance))} м` : '—';
  }

  getExecutorReadinessLabel(order: ServiceOrder): string {
    const pending = this.selectedExecutorByOrderId[order.id];
    if (pending) return this.getSuggestionReadinessLabel(pending);
    const weapon = this.weaponCandidates.find(
      (item) =>
        item.currentFirePositionId === order.selectedFirePositionId ||
        item.firePositionId === order.selectedFirePositionId,
    );
    return weapon?.readinessStatus === 'combat_ready' ? 'БГ' : weapon?.notReadyReason || '—';
  }

  getSelectedKit(order: ServiceOrder): ServiceOrderSuggestionVariant | null {
    return this.selectedKitByOrderId[order.id] || null;
  }

  getSelectedKitCharges(order: ServiceOrder): string {
    const pending = this.getSelectedKit(order);
    const charges = pending?.charges || order.selectedShotConfiguration?.charges || [];
    return charges.length
      ? charges.map((item) => `${item.charge.marking} × ${item.quantityPerShot}`).join(' + ')
      : '—';
  }

  getSelectedKitMaxRangeLabel(order: ServiceOrder): string {
    const value = this.getSelectedKit(order)?.maxRangeM || order.selectedShotConfiguration?.maxRangeM;
    return value ? `${Math.round(Number(value))} м` : '—';
  }

  loadExecutionRecords(order: ServiceOrder): void {
    if (order.status !== 'in_progress' && order.status !== 'completed') {
      return;
    }
    if (this.executionLoadingByOrderId[order.id]) return;

    const requestId = (this.executionLoadRequestByOrderId[order.id] || 0) + 1;
    this.executionLoadRequestByOrderId[order.id] = requestId;
    this.executionLoadingByOrderId[order.id] = true;
    this.executionRecords.list(order.id).subscribe({
      next: (records) => {
        if (this.executionLoadRequestByOrderId[order.id] !== requestId) return;
        this.executionRecordsByOrderId[order.id] = records;
        this.executionLoadingByOrderId[order.id] = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        if (this.executionLoadRequestByOrderId[order.id] !== requestId) return;
        this.executionLoadingByOrderId[order.id] = false;
        this.toast.show(error?.error?.message || 'Не вдалося завантажити журнал виконання', 'danger');
        this.cdr.detectChanges();
      },
    });
  }

  getExecutionForm(order: ServiceOrder): {
    purpose: ExecutionRecordPurpose;
    quantity: string;
    comment: string;
  } {
    if (!this.executionFormByOrderId[order.id]) {
      this.executionFormByOrderId[order.id] = {
        purpose: 'main_fire',
        quantity: String(Math.max(Number(order.plannedQuantity || 1), 1)),
        comment: '',
      };
    }

    return this.executionFormByOrderId[order.id];
  }

  createExecutionDraft(order: ServiceOrder): void {
    if (this.executionSavingByOrderId[order.id]) return;
    const form = this.getExecutionForm(order);
    const quantity = Number(form.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.toast.show('Вкажіть кількість пострілів', 'danger');
      return;
    }

    if (quantity > Number(order.plannedQuantity ?? 0) && !form.comment.trim()) {
      this.toast.show('Для перевищення плану потрібен коментар', 'danger');
      return;
    }

    const kit = order.selectedShotConfiguration;
    const fuzeId = kit?.fuzeId || kit?.fuze?.id || null;
    const primerId = kit?.primerId || kit?.primer?.id || null;
    const zoneId = kit?.zoneId || order.selectedZoneId || null;
    const weaponModelId = kit?.weaponModelId || null;

    if (!kit || !weaponModelId || !order.selectedShellId || !fuzeId || !primerId || kit.zoneNumber == null || kit.charges.length === 0) {
      this.toast.show('Для швидкого запису потрібен повний комплект пострілу', 'danger');
      return;
    }

    this.executionSavingByOrderId[order.id] = true;
    this.executionRecords
      .create(order.id, {
        idempotencyKey: `ui:${order.id}:${Date.now()}`,
        executionType: 'artillery',
        purpose: form.purpose,
        result: 'executed',
        startedAt: new Date().toISOString(),
        quantity,
        comment: form.comment.trim() || undefined,
        artillery: {
          compositionSource: 'planned',
          sourceShotConfigurationId: kit.id,
          weaponModelId,
          shellId: order.selectedShellId,
          fuzeId,
          primerId,
          zoneId,
          maxRangeM: kit.maxRangeM,
          compositionSnapshot: {
            shotConfigurationId: kit.id,
            name: kit.name,
            zoneNumber: kit.zoneNumber ?? order.selectedZone?.zoneNumber ?? null,
          },
          charges: kit.charges.map((component) => ({
            chargeId: component.chargeId,
            chargeName: component.charge.marking,
            quantityPerShot: component.quantityPerShot,
            accountingUnit: component.accountingUnit || 'piece',
            sortOrder: component.sortOrder,
          })),
        },
      })
      .subscribe({
        next: (record) => {
          this.executionSavingByOrderId[order.id] = false;
          form.comment = '';
          this.executionLoadRequestByOrderId[order.id] =
            (this.executionLoadRequestByOrderId[order.id] || 0) + 1;
          this.executionLoadingByOrderId[order.id] = false;
          const records = this.getExecutionRecords(order);
          if (!records.some((item) => item.id === record.id)) {
            this.executionRecordsByOrderId[order.id] = [record, ...records];
          }
          this.cdr.detectChanges();
          this.loadExecutionRecords(order);
        },
        error: (error) => {
          this.executionSavingByOrderId[order.id] = false;
          this.toast.show(error?.error?.message || 'Не вдалося створити запис журналу', 'danger');
          this.cdr.detectChanges();
        },
      });
  }

  postExecutionRecord(order: ServiceOrder, record: ExecutionRecord): void {
    if (this.executionRecordSavingById[record.id]) return;
    this.executionRecordSavingById[record.id] = true;
    this.executionValidationByRecordId[record.id] = [];
    this.executionRecords.validate(record.id).subscribe({
      next: (validation) => {
        if (!validation.valid) {
          this.executionValidationByRecordId[record.id] = validation.reasons.map(
            (item) => item.message,
          );
          this.executionRecordSavingById[record.id] = false;
          this.cdr.detectChanges();
          return;
        }

        this.executionRecords.post(record.id).subscribe({
          next: () => {
            this.executionRecordSavingById[record.id] = false;
            this.loadExecutionRecords(order);
          },
          error: (error) => {
            this.executionRecordSavingById[record.id] = false;
            const reasons = error?.error?.reasons as Array<{ message: string }> | undefined;
            this.executionValidationByRecordId[record.id] = reasons?.map((item) => item.message) || [
              error?.error?.message || 'Не вдалося провести запис',
            ];
            this.cdr.detectChanges();
          },
        });
      },
      error: (error) => {
        this.executionRecordSavingById[record.id] = false;
        const reasons = error?.error?.reasons as Array<{ message: string }> | undefined;
        this.executionValidationByRecordId[record.id] = reasons?.map((item) => item.message) || [
          error?.error?.message || 'Не вдалося перевірити запис',
        ];
        this.cdr.detectChanges();
      },
    });
  }

  cancelExecutionRecord(order: ServiceOrder, record: ExecutionRecord): void {
    if (this.executionRecordSavingById[record.id]) return;
    this.executionRecordSavingById[record.id] = true;
    this.executionRecords.cancel(record.id).subscribe({
      next: () => {
        this.executionRecordSavingById[record.id] = false;
        this.loadExecutionRecords(order);
      },
      error: (error) => {
        this.executionRecordSavingById[record.id] = false;
        this.toast.show(error?.error?.message || 'Не вдалося скасувати чернетку', 'danger');
      },
    });
  }

  getExecutionRecords(order: ServiceOrder): ExecutionRecord[] {
    return this.executionRecordsByOrderId[order.id] || [];
  }

  hasPostedExecution(order: ServiceOrder): boolean {
    return this.getExecutionRecords(order).some((record) => record.status === 'posted');
  }

  getExecutionPurposeLabel(value: string): string {
    const labels: Record<string, string> = {
      barrel_warmup: 'Прогрів ствола',
      adjustment: 'Пристрілка',
      main_fire: 'Основний вогонь',
      additional_fire: 'Додатковий вогонь',
      other: 'Інше',
    };

    return labels[value] || value;
  }

  getExecutionStatusLabel(value: string): string {
    const labels: Record<string, string> = {
      draft: 'Чернетка',
      posted: 'Проведено',
      reversed: 'Сторновано',
      cancelled: 'Скасовано',
    };

    return labels[value] || value;
  }

  getExecutionRequirementLabel(record: ExecutionRecord): string {
    if (!record.artillery) {
      return 'Без витрат БК';
    }

    const chargeText = record.artillery.charges
      .map((item) => `${item.chargeNameSnapshot} x${Number(record.quantity) * item.quantityPerShot}`)
      .join(', ');
    return `Снаряд x${record.quantity}, підривник x${record.quantity}, праймер x${record.quantity}, ${chargeText}`;
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
  if (!this.beginWorkflowAction(order.id)) return;
  this.errorMessage = '';

  if (!suggestion.airAssetPosition?.id) {
    this.errorMessage = 'Повітряний розрахунок не визначено';
    this.finishWorkflowAction(order.id);
    return;
  }

  if (!order.targetLat || !order.targetLng) {
    this.errorMessage = 'Для бойової задачі БпЛА потрібні координати цілі';
    this.finishWorkflowAction(order.id);
    return;
  }

 this.service
  .selectAirAsset(order.id, {
    airAssetPositionId: suggestion.airAssetPosition.id,
    droneModelId: payload.droneModelId,
    warheadTypeId: payload.warheadTypeId,
  })
    .pipe(finalize(() => this.finishWorkflowAction(order.id)))
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
  if (!this.beginWorkflowAction(order.id)) return;
  this.errorMessage = '';

  this.service
    .sendToUnit(order.id)
    .pipe(finalize(() => this.finishWorkflowAction(order.id)))
    .subscribe({
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
