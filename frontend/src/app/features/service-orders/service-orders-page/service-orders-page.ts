import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EventFeedService } from '../../../core/event-feed.service';
import { formatKyivDateTime, isSameKyivDate, minutesSince } from '../../../core/kyiv-time.util';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { ToastService } from '../../../core/toast.service';
import { AuthService, LoginResponse } from '../../auth/auth.service';
import { ServiceOrder } from '../service-order.model';
import {
  ServiceOrderSuggestion,
  ServiceOrderSuggestionVariant,
  ServiceOrdersService,
}
 from '../service-orders.service';


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
  errorMessage = '';
  expandedSuggestionIds: Record<string, boolean> = {};
  openedActionsOrderId: string | null = null;
  readonly pageSkeleton = Array.from({ length: 6 });

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
  viewMode: 'cards' | 'list' = 'cards';
  problemFilter = '';
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
      resultType: string;
      resultComment: string;
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
  ) {}

  ngOnInit(): void {
    this.currentUser = this.auth.getUser();
    this.restoreViewPreferences();
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

    this.autoRefreshSubscription.add(this.autoRefresh.watch(['all', 'missions'], () => {
      this.closeActions();
      this.load(true);
    }));
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
  }

  load(silent = false): void {
    if (!silent || this.items.length === 0) {
      this.loading = true;
    }

    if (!silent) {
      this.errorMessage = '';
    }

    this.service.getAll().subscribe({
      next: (items) => {
        this.items = items;
        this.loading = false;
        this.scrollFocusedOrderIntoView();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.loading = false;

        if (silent) {
          this.cdr.detectChanges();
          return;
        }

        this.fail(error, 'Не вдалося завантажити вогневі завдання');
      },
    });
  }

  create(): void {
    if (this.modalSubmitting) {
      return;
    }

    this.errorMessage = '';

    if (!this.form.orderNumber.trim()) {
      this.errorMessage = 'Вкажіть номер вогневі завдання';
      return;
    }

    if (
      this.form.coordinateMode === 'decimal' &&
      (!this.form.targetLat || !this.form.targetLng)
    ) {
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
      this.errorMessage = 'Вкажіть характер вогневі завдання';
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
          this.createModalOpen = false;
          this.createStep = 1;
          this.closeActions();
          this.load();
        },
        error: (error) => {
          this.modalSubmitting = false;
          this.fail(
            error,
            error?.error?.message || 'Не вдалося створити вогневе завдання',
          );
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
        this.fail(
          error,
          error?.error?.message || 'Не вдалося видалити вогневе завдання',
        ),
    });
  }

  loadSuggestions(order: ServiceOrder): void {
    this.selectedOrderId = order.id;
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

  selectSuggestion(
    order: ServiceOrder,
    suggestion: ServiceOrderSuggestion,
    variant: ServiceOrderSuggestionVariant,
  ): void {
    this.errorMessage = '';

    this.service
      .selectPosition(order.id, {
        firePositionId: suggestion.firePosition.id,
        shellId: variant.shellId,
        chargeId: variant.chargeId,
        zoneId: variant.zoneId,
      })
      .subscribe({
        next: () => {
          this.toast.show('Варіант обрано', 'success');
          this.eventFeed.add({
            type: 'success',
            title: `Для ${order.orderNumber} обрано ВП ${suggestion.firePosition.name}`,
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

 sendToUnit(order: ServiceOrder): void {
  this.errorMessage = '';

  this.service.sendToUnit(order.id).subscribe({
    next: () => {
      this.toast.show('Вогневе завдання передано на ПУВБ', 'success');
      this.eventFeed.add({
        type: 'info',
        title: `Вогневе завдання ${order.orderNumber} передано на ПУВБ`,
        details: `ВП: ${order.selectedFirePosition?.name || '—'}. Система автоматично визначила батарею та дивізіон.`,
        route: '/service-orders',
      });
      this.closeActions();
      this.load();
    },
    error: (error) =>
      this.fail(error, error?.error?.message || 'Не вдалося передати вогневе завдання на ПУВБ'),
  });
}

  accept(order: ServiceOrder): void {
    this.errorMessage = '';

    this.service.accept(order.id).subscribe({
      next: () => {
        this.toast.show('\u0417\u0430\u044f\u0432\u043a\u0443 \u043f\u0440\u0438\u0439\u043d\u044f\u0442\u043e', 'success');
        this.eventFeed.add({
          type: 'success',
          title: `\u0417\u0430\u044f\u0432\u043a\u0443 ${order.orderNumber} \u043f\u0440\u0438\u0439\u043d\u044f\u0442\u043e`,
          details: `\u0412\u041f: ${order.selectedFirePosition?.name || '\u2014'}, \u0440\u0430\u0439\u043e\u043d: ${order.targetSettlement || '\u2014'}`,
          route: '/map',
          queryParams: this.getMapQueryParams(order),
        });
        this.closeActions();
        this.load();
      },
      error: (error) =>
        this.fail(error, error?.error?.message || '\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u043f\u0440\u0438\u0439\u043d\u044f\u0442\u0438 \u0437\u0430\u044f\u0432\u043a\u0443'),
    });
  }

  reject(order: ServiceOrder): void {
    if (this.modalSubmitting) {
      return;
    }

    this.errorMessage = '';

    const reason = this.rejectReasonByOrderId[order.id]?.trim() || '';

    if (!reason) {
      this.errorMessage = '\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u043f\u0440\u0438\u0447\u0438\u043d\u0443 \u0432\u0456\u0434\u0445\u0438\u043b\u0435\u043d\u043d\u044f';
      return;
    }

    this.modalSubmitting = true;

    this.service.reject(order.id, reason).subscribe({
      next: () => {
        this.toast.show('\u0417\u0430\u044f\u0432\u043a\u0443 \u0432\u0456\u0434\u0445\u0438\u043b\u0435\u043d\u043e', 'warning');
        this.eventFeed.add({
          type: 'warning',
          title: `\u0417\u0430\u044f\u0432\u043a\u0443 ${order.orderNumber} \u0432\u0456\u0434\u0445\u0438\u043b\u0435\u043d\u043e`,
          details: `\u0412\u041f: ${order.selectedFirePosition?.name || '\u2014'}, \u043f\u0440\u0438\u0447\u0438\u043d\u0430: ${reason}`,
          route: '/service-orders',
        });
        this.rejectReasonByOrderId[order.id] = '';
        this.modalSubmitting = false;
        this.rejectModalOrder = null;
        this.closeActions();
        this.load();
      },
      error: (error) => {
        this.modalSubmitting = false;
        this.fail(error, error?.error?.message || '\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0432\u0456\u0434\u0445\u0438\u043b\u0438\u0442\u0438 \u0437\u0430\u044f\u0432\u043a\u0443');
      },
    });
  }

  reopen(order: ServiceOrder): void {
    this.errorMessage = '';

    this.service.reopen(order.id).subscribe({
      next: () => {
        this.toast.show('\u0417\u0430\u044f\u0432\u043a\u0443 \u043f\u043e\u0432\u0435\u0440\u043d\u0443\u0442\u043e \u0432 \u0440\u043e\u0431\u043e\u0442\u0443', 'success');
        this.eventFeed.add({
          type: 'info',
          title: `\u0417\u0430\u044f\u0432\u043a\u0443 ${order.orderNumber} \u043f\u043e\u0432\u0435\u0440\u043d\u0443\u0442\u043e \u0434\u043e \u043f\u0456\u0434\u0431\u043e\u0440\u0443`,
          details: `\u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0412\u041f: ${order.selectedFirePosition?.name || '\u2014'}`,
          route: '/service-orders',
        });
        this.closeActions();
        this.load();
      },
      error: (error) =>
        this.fail(
          error,
          error?.error?.message || '\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u043f\u043e\u0432\u0435\u0440\u043d\u0443\u0442\u0438 \u0437\u0430\u044f\u0432\u043a\u0443 \u0432 \u0440\u043e\u0431\u043e\u0442\u0443',
        ),
    });
  }

  start(order: ServiceOrder): void {
    this.errorMessage = '';

    this.service.start(order.id).subscribe({
      next: () => {
        this.toast.show('\u0412\u0438\u043a\u043e\u043d\u0430\u043d\u043d\u044f \u0440\u043e\u0437\u043f\u043e\u0447\u0430\u0442\u043e', 'success');
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
      error: (error) =>
        this.fail(error, error?.error?.message || 'Не вдалося почати виконання'),
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

    if (
      Number(form.actualQuantity) <= 0 ||
      !Number.isInteger(Number(form.actualQuantity))
    ) {
      this.errorMessage = 'Фактична витрата має бути цілим числом більше 0';
      return;
    }

    this.modalSubmitting = true;

    this.service
      .complete(order.id, {
        startedAt: new Date(form.startedAt).toISOString(),
        completedAt: new Date(form.completedAt).toISOString(),
        actualQuantity: Number(form.actualQuantity),
        resultType: form.resultType,
        resultComment: form.resultComment.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.toast.show(
            order.status === 'completed'
              ? 'Результат оновлено'
              : 'Вогневе завдання завершено',
            'success',
          );
          this.eventFeed.add({
            type: 'success',
            title: `Вогневе завдання ${order.orderNumber} завершено`,
            details: `Факт: ${form.actualQuantity}, результат: ${this.getResultTypeLabel(form.resultType)}, ВП: ${order.selectedFirePosition?.name || '?'}`,
            route: '/map',
            queryParams: this.getMapQueryParams(order),
          });
          delete this.completeFormByOrderId[order.id];
          this.modalSubmitting = false;
          this.completeModalOrder = null;
          this.closeActions();
          this.load();
        },
        error: (error) => {
          this.modalSubmitting = false;
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

    this.service.cancel(order.id, reason || undefined).subscribe({
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
        this.cancelModalOrder = null;
        this.closeActions();
        this.load();
      },
      error: (error) => {
        this.modalSubmitting = false;
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
  if (order.status === 'draft') return 'Підібрати точку';
  if (order.status === 'proposed') return 'Надіслати на ПУВБ';
  if (
    order.status === 'sent' ||
    order.status === 'sent_to_division' ||
    order.status === 'sent_to_battery'
  ) {
    return 'Прийняти';
  }
  if (order.status === 'accepted') return 'Почати';
  if (order.status === 'rejected') return 'Підібрати іншу ВП';
  if (order.status === 'in_progress') return 'Завершити';

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
    this.errorMessage = '\u0421\u0442\u0430\u0440\u0448\u0456 \u043f\u0443\u043d\u043a\u0442\u0438 \u0443\u043f\u0440\u0430\u0432\u043b\u0456\u043d\u043d\u044f \u0442\u0456\u043b\u044c\u043a\u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044e\u044e\u0442\u044c \u0432\u0438\u043a\u043e\u043d\u0430\u043d\u043d\u044f. \u0412\u0438\u043a\u043e\u043d\u0430\u0432\u0447\u0456 \u0434\u0456\u0457 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0456 \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0443 \u0431\u0430\u0442\u0430\u0440\u0435\u0457/\u0412\u041f.';
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
      this.errorMessage = '\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u043d\u043e\u043c\u0435\u0440 \u0437\u0430\u044f\u0432\u043a\u0438';
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
      this.errorMessage = '\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u0445\u0430\u0440\u0430\u043a\u0442\u0435\u0440 \u0437\u0430\u044f\u0432\u043a\u0438';
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
      resultType: order.resultType || '',
      resultComment: order.resultComment || '',
    };
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
    this.openedActionsOrderId =
      this.openedActionsOrderId === order.id ? null : order.id;
  }

  closeActions(): void {
    this.openedActionsOrderId = null;
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
    this.expandedHistoryOrderId =
      this.expandedHistoryOrderId === order.id ? null : order.id;
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

      if (!this.isWithinTargetDateFilter(item)) {
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
        return !item.selectedFirePosition;
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
        return item.status === 'in_progress' && minutesSince(item.startedAt || item.updatedAt) >= 120;
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

      if (
        this.historyFilters.resultType &&
        item.resultType !== this.historyFilters.resultType
      ) {
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
  if (['sent', 'sent_to_division', 'sent_to_battery'].includes(order.status)) return ageMinutes >= 90;
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

  isSuggestionExpanded(
    suggestion: ServiceOrderSuggestion,
    index: number,
  ): boolean {
    const key = suggestion.firePosition.id;

    if (this.expandedSuggestionIds[key] === undefined) {
      return index === 0;
    }

    return this.expandedSuggestionIds[key];
  }

  toggleSuggestion(suggestion: ServiceOrderSuggestion): void {
    const key = suggestion.firePosition.id;
    const current = this.expandedSuggestionIds[key];

    this.expandedSuggestionIds[key] = current === undefined ? false : !current;
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

  getOrderPriority(order: ServiceOrder): number {
  let priority = 0;

  if (order.status === 'rejected') priority += 100;
  if (!order.selectedFirePosition) priority += 90;

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
    return this.isWithinDateTimeRange(order.createdAt, this.targetDateFilter.from, this.targetDateFilter.to);
  }

  private isWithinHistoryDateFilter(order: ServiceOrder): boolean {
    const value = order.completedAt || order.updatedAt || order.createdAt;
    return this.isWithinDateTimeRange(value, this.historyFilters.from, this.historyFilters.to);
  }

  private isWithinDateTimeRange(value: string | Date | null | undefined, from: string, to: string): boolean {
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
    };
  }

  private restoreViewPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const viewMode = localStorage.getItem(this.viewModeKey);

    if (viewMode === 'cards' || viewMode === 'list') {
      this.viewMode = viewMode;
    } else if (viewMode === 'split') {
      this.viewMode = 'cards';
      localStorage.setItem(this.viewModeKey, 'cards');
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

}
