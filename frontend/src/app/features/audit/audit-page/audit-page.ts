import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EventLog, EventLogsService } from '../../event-logs/event-logs.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-page.html',
  styleUrl: './audit-page.css',
})
export class AuditPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  logs: EventLog[] = [];
  loading = true;
  errorMessage = '';
  q = '';
  eventType = '';
  entityType = '';

  constructor(private readonly service: EventLogsService, private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void { this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['events'], () => this.load())); }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loadSubscription?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';
    this.loadSubscription = this.service.getAll({ q: this.q || undefined, eventType: this.eventType || undefined, entityType: this.entityType || undefined, limit: 200 }).subscribe({
      next: (logs) => { this.logs = logs; this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.errorMessage = 'Не вдалося завантажити аудит'; this.loading = false; this.cdr.detectChanges(); },
    });
  }
}
