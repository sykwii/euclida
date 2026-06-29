import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RecommendationItem, RecommendationsDashboard } from '../recommendations.model';
import { RecommendationsService } from '../recommendations.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-recommendations-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recommendations-page.html',
  styleUrl: './recommendations-page.css',
})
export class RecommendationsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  dashboard: RecommendationsDashboard | null = null;
  loading = true;
  errorMessage = '';
  levelFilter: 'all' | 'critical' | 'warning' | 'info' = 'all';

  constructor(private readonly service: RecommendationsService, private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void { this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['analytics', 'missions', 'stock', 'map', 'weapons', 'threats'], () => this.load())); }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.loadSubscription?.unsubscribe();

    this.loadSubscription = this.service.getDashboard().subscribe({
      next: (dashboard) => { this.dashboard = dashboard; this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.errorMessage = 'Не вдалося завантажити рекомендації'; this.loading = false; this.cdr.detectChanges(); },
    });
  }

  filteredItems(): RecommendationItem[] {
    const items = this.dashboard?.items ?? [];
    return this.levelFilter === 'all' ? items : items.filter((item) => item.level === this.levelFilter);
  }

  setFilter(level: 'all' | 'critical' | 'warning' | 'info'): void { this.levelFilter = level; }

  levelLabel(level: string): string {
    return { critical: 'Критично', warning: 'Увага', info: 'Інфо' }[level] ?? level;
  }
}
