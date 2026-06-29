import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { Unit } from '../unit.model';
import { UnitsService } from '../units.service';

@Component({
  selector: 'app-units-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './units-page.html',
  styleUrl: './units-page.css',
})
export class UnitsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  units: Unit[] = [];
  loading = true;
  errorMessage = '';

  constructor(
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all', 'reference'], () => this.load()),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loadSubscription?.unsubscribe();
    this.loading = true;
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
}
