import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { FireMission } from '../fire-mission.model';
import { FireMissionsService } from '../fire-missions.service';

@Component({
  selector: 'app-fire-missions-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fire-missions-page.html',
  styleUrl: './fire-missions-page.css',
})
export class FireMissionsPage implements OnInit, OnDestroy {
  items: FireMission[] = [];
  loading = true;
  refreshing = false;
  errorMessage = '';
  selectedItem: FireMission | null = null;

  private readonly subscriptions = new Subscription();
  private loadSubscription?: Subscription;

  constructor(
    private readonly service: FireMissionsService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load(true);

    this.subscriptions.add(
      this.autoRefresh.watch(['all', 'missions', 'stock'], () => this.load())
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(showLoader = false): void {
    this.loadSubscription?.unsubscribe();

    if (showLoader) {
      this.loading = true;
    } else {
      this.refreshing = true;
    }

    this.loadSubscription = this.service.getAll()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.refreshing = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (data) => {
          this.applyItems(data);
          this.errorMessage = '';
        },
        error: () => {
          this.errorMessage = 'Не вдалося завантажити вогневі завдання';
        },
      });
  }

  select(item: FireMission): void {
    this.selectedItem = item;
  }

  closeDetails(): void {
    this.selectedItem = null;
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Чернетка',
      sent: 'Надіслано',
      accepted: 'Прийнято',
      rejected: 'Відхилено',
      in_progress: 'В роботі',
      completed: 'Виконано',
      closed: 'В історії',
      cancelled: 'Скасовано',
    };

    return labels[status] ?? status;
  }

  getStatusClass(status: string): string {
    return `status-${status.replace('_', '-')}`;
  }

  getPlannedTotal(item: FireMission): number {
    return Number(item.shellQuantity ?? 0);
  }

  getActualTotal(item: FireMission): number {
    return Number(item.actualShellQuantity ?? 0);
  }

  getWeaponLabel(item: FireMission): string {
    const model = item.weaponSystem?.weaponModel?.name ?? '';
    const callsign = item.weaponSystem?.callsign ?? '';
    return `${model} ${callsign}`.trim() || '—';
  }

  private applyItems(data: FireMission[]): void {
    this.items = data;

    if (this.selectedItem) {
      this.selectedItem = data.find((item) => item.id === this.selectedItem?.id) ?? null;
    }

    this.cdr.detectChanges();
  }
}
