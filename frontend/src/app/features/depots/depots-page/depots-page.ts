import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Unit } from '../../units/unit.model';
import { UnitsService } from '../../units/units.service';
import { Depot } from '../depot.model';
import { DepotsService } from '../depots.service';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-depots-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './depots-page.html',
  styleUrl: './depots-page.css',
})
export class DepotsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  items: Depot[] = [];
  units: Unit[] = [];
  loading = true;
  errorMessage = '';

  form = {
    name: '',
    depotType: 'main_pas',
    unitId: '',
    parentId: '',
  };

  constructor(
    private readonly service: DepotsService,
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['stock'], () => this.load()));
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loadSubscription?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';

    this.loadSubscription = forkJoin({
      depots: this.service.getAll(),
      units: this.unitsService.getAll(),
    }).subscribe({
      next: ({ depots, units }) => {
        this.items = depots;
        this.units = units;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити ПАСи'),
    });
  }

  create(): void {
    this.errorMessage = '';

    if (!this.form.name.trim()) {
      this.errorMessage = 'Вкажіть назву складу';
      return;
    }

    this.service.create({
      name: this.form.name.trim(),
      depotType: this.form.depotType,
      ...(this.form.unitId ? { unitId: this.form.unitId } : {}),
      ...(this.form.parentId ? { parentId: this.form.parentId } : {}),
    }).subscribe({
      next: () => {
        this.form = {
          name: '',
          depotType: 'main_pas',
          unitId: '',
          parentId: '',
        };
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося створити склад'),
    });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити склад'),
    });
  }

  private fail(error: unknown, message: string): void {
    this.errorMessage = message;
    this.loading = false;
    this.cdr.detectChanges();
  }
  getDepotTypeLabel(type: string): string {
    if (type === 'main_pas') return 'Головний ПАС';
    if (type === 'division_pas') return 'ПАС дивізіону';
    if (type === 'battery_pas') return 'ПАС батареї';
    if (type === 'fire_position_ammo') return 'БК на ВП';
    return type;
  }

  getGroupedDepots(): Array<{ title: string; items: Depot[] }> {
    const groups = new Map<string, Depot[]>();

    for (const depot of this.items) {
      const title = depot.unit?.name || 'Без підрозділу';

      const existingGroup = groups.get(title);

      if (existingGroup) {
        existingGroup.push(depot);
      } else {
        groups.set(title, [depot]);
      }
    }

    return Array.from(groups.entries()).map(([title, items]) => ({
      title,
      items,
    }));
  }
}
