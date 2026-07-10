import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { Unit } from '../unit.model';
import { UnitPayload, UnitsService } from '../units.service';

type UnitFormMode = 'create' | 'edit';

interface UnitTreeNode {
  unit: Unit;
  children: UnitTreeNode[];
  level: number;
}

@Component({
  selector: 'app-units-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './units-page.html',
  styleUrl: './units-page.css',
})
export class UnitsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  private saveSubscription?: Subscription;
  private deleteSubscription?: Subscription;

  units: Unit[] = [];
  loading = true;
  saving = false;
  deletingId: string | null = null;
  cascadeConfirmId: string | null = null;
  errorMessage = '';
  formOpen = false;
  formMode: UnitFormMode = 'create';
  editingId: string | null = null;

  form = {
    name: '',
    type: 'battery',
    parentId: '',
    sortOrder: 0,
  };

  readonly unitTypes = [
    { value: 'dnar', label: 'ДНАР' },
    { value: 'division', label: 'Дивізіон' },
    { value: 'battery', label: 'Батарея' },
    { value: 'ew', label: 'Підрозділ РЕБ' },
    { value: 'command', label: 'Управління' },
    { value: 'duty_shift', label: 'Зміна' },
  ];

  constructor(
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  get tree(): UnitTreeNode[] {
    const childrenByParent = new Map<string, Unit[]>();
    const roots: Unit[] = [];
    const unitIds = new Set(this.units.map((unit) => unit.id));

    for (const unit of this.sortedUnits) {
      if (!unit.parentId || !unitIds.has(unit.parentId)) {
        roots.push(unit);
        continue;
      }

      const children = childrenByParent.get(unit.parentId) ?? [];
      children.push(unit);
      childrenByParent.set(unit.parentId, children);
    }

    const toNode = (unit: Unit, level: number): UnitTreeNode => ({
      unit,
      level,
      children: (childrenByParent.get(unit.id) ?? []).map((child) => toNode(child, level + 1)),
    });

    return roots.map((unit) => toNode(unit, 0));
  }

  get flatTree(): UnitTreeNode[] {
    const result: UnitTreeNode[] = [];
    const visit = (nodes: UnitTreeNode[]) => {
      for (const node of nodes) {
        result.push(node);
        visit(node.children);
      }
    };

    visit(this.tree);
    return result;
  }

  get divisionCount(): number {
    return this.units.filter((unit) => unit.type === 'division').length;
  }

  get batteryCount(): number {
    return this.units.filter((unit) => unit.type === 'battery').length;
  }

  get parentOptions(): Unit[] {
    if (!this.editingId) {
      return this.sortedUnits;
    }

    const forbidden = new Set<string>([this.editingId]);
    const collectChildren = (parentId: string) => {
      for (const unit of this.units.filter((item) => item.parentId === parentId)) {
        forbidden.add(unit.id);
        collectChildren(unit.id);
      }
    };

    collectChildren(this.editingId);
    return this.sortedUnits.filter((unit) => !forbidden.has(unit.id));
  }

  private get sortedUnits(): Unit[] {
    return [...this.units].sort((a, b) => {
      const orderDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      return orderDiff || a.name.localeCompare(b.name, 'uk');
    });
  }

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all', 'reference'], () => this.load(false)),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
    this.saveSubscription?.unsubscribe();
    this.deleteSubscription?.unsubscribe();
  }

  load(showLoader = true): void {
    this.loadSubscription?.unsubscribe();
    this.loading = showLoader && this.units.length === 0;
    this.errorMessage = '';

    this.loadSubscription = this.unitsService.getAll().subscribe({
      next: (units) => {
        this.units = units;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити підрозділи';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  openCreate(parentId = ''): void {
    this.formMode = 'create';
    this.editingId = null;
    this.form = {
      name: '',
      type: parentId ? 'battery' : 'division',
      parentId,
      sortOrder: this.nextSortOrder(parentId),
    };
    this.errorMessage = '';
    this.cascadeConfirmId = null;
    this.formOpen = true;
  }

  openEdit(unit: Unit): void {
    this.formMode = 'edit';
    this.editingId = unit.id;
    this.form = {
      name: unit.name,
      type: unit.type,
      parentId: unit.parentId ?? '',
      sortOrder: Number(unit.sortOrder || 0),
    };
    this.errorMessage = '';
    this.cascadeConfirmId = null;
    this.formOpen = true;
  }

  closeForm(): void {
    if (this.saving) return;
    this.formOpen = false;
    this.editingId = null;
  }

  save(): void {
    if (this.saving) return;

    const payload = this.toPayload();
    if (!payload) return;

    this.saving = true;
    this.saveSubscription?.unsubscribe();

    const request =
      this.formMode === 'edit' && this.editingId
        ? this.unitsService.update(this.editingId, payload)
        : this.unitsService.create(payload);

    this.saveSubscription = request.subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.editingId = null;
        this.load(false);
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = error?.error?.message || 'Не вдалося зберегти підрозділ';
        this.cdr.detectChanges();
      },
    });
  }

  remove(unit: Unit): void {
    if (this.deletingId || this.hasChildren(unit.id)) return;

    this.deletingId = unit.id;
    this.deleteSubscription?.unsubscribe();
    this.deleteSubscription = this.unitsService.delete(unit.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.load(false);
      },
      error: (error) => {
        this.deletingId = null;
        this.errorMessage = error?.error?.message || 'Не вдалося видалити підрозділ';
        this.cdr.detectChanges();
      },
    });
  }

  removeWithRelated(unit: Unit): void {
    if (this.deletingId) return;

    if (this.cascadeConfirmId !== unit.id) {
      this.cascadeConfirmId = unit.id;
      return;
    }

    this.deletingId = unit.id;
    this.cascadeConfirmId = null;
    this.deleteSubscription?.unsubscribe();
    this.deleteSubscription = this.unitsService.deleteWithRelated(unit.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.load(false);
      },
      error: (error) => {
        this.deletingId = null;
        this.errorMessage =
          error?.error?.message || 'Не вдалося видалити підрозділ з пов’язаними даними';
        this.cdr.detectChanges();
      },
    });
  }

  hasChildren(unitId: string): boolean {
    return this.units.some((unit) => unit.parentId === unitId);
  }

  unitTypeLabel(type: string): string {
    return this.unitTypes.find((item) => item.value === type)?.label || type;
  }

  parentName(parentId: string | null): string {
    if (!parentId) return 'Корінь';
    return this.units.find((unit) => unit.id === parentId)?.name || '—';
  }

  trackNode(_: number, node: UnitTreeNode): string {
    return node.unit.id;
  }

  trackUnit(_: number, unit: Unit): string {
    return unit.id;
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.formOpen) {
      this.closeForm();
    }
  }

  private toPayload(): UnitPayload | null {
    const name = this.form.name.trim();

    if (!name) {
      this.errorMessage = 'Вкажіть назву підрозділу';
      return null;
    }

    return {
      name,
      type: this.form.type,
      parentId: this.form.parentId || null,
      sortOrder: Math.max(0, Number(this.form.sortOrder || 0)),
    };
  }

  private nextSortOrder(parentId: string): number {
    const siblings = this.units.filter((unit) => (unit.parentId ?? '') === parentId);
    return siblings.reduce((max, unit) => Math.max(max, Number(unit.sortOrder || 0)), 0) + 10;
  }
}
