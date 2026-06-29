import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { EventFeedItem, EventFeedService } from './event-feed.service';

@Component({
  selector: 'app-event-feed',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="event-feed" [class.open]="open">
      <button type="button" class="feed-toggle" (click)="open = !open">
        <span>Події</span>
        <strong>{{ (feed.items$ | async)?.length || 0 }}</strong>
      </button>

      <section class="feed-panel" *ngIf="open">
        <header>
          <div>
            <span>Оперативна стрічка</span>
            <h2>Події</h2>
          </div>

          <button type="button" class="icon-button" (click)="feed.clear()">×</button>
        </header>

        <div class="feed-list">
          <article
            class="feed-item"
            *ngFor="let item of feed.items$ | async"
            [class]="item.type"
            (click)="openEvent(item)"
          >
            <div>
              <strong>{{ item.title }}</strong>
              <time>
                <b *ngIf="item.count && item.count > 1">x{{ item.count }}</b>
                {{ item.createdAt | date: 'HH:mm:ss' }}
              </time>
            </div>
            <p>{{ item.details }}</p>
          </article>

          <p class="empty" *ngIf="((feed.items$ | async)?.length || 0) === 0">
            Подій поки немає.
          </p>
        </div>
      </section>
    </aside>
  `,
  styles: [`
    .event-feed {
      position: fixed;
      right: 18px;
      top: 92px;
      z-index: var(--z-notifications);
      pointer-events: none;
    }

    .feed-toggle,
    .feed-panel {
      pointer-events: auto;
    }

    .feed-toggle {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 104px;
      justify-content: space-between;
      background: rgba(10, 15, 21, 0.9);
      border-color: var(--border);
      backdrop-filter: blur(16px);
      box-shadow: var(--shadow-soft), var(--surface-glow);
    }

    .feed-toggle strong {
      min-width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 6px;
      background: rgba(46, 230, 214, 0.16);
      color: #dffcf7;
      font-size: 12px;
    }

    .feed-panel {
      width: min(420px, calc(100vw - 36px));
      max-height: calc(100dvh - 36px);
      margin-top: 10px;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: rgba(10, 15, 21, 0.98);
      backdrop-filter: blur(16px);
      box-shadow: var(--shadow), var(--surface-glow);
    }

    .feed-panel header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 14px;
      border-bottom: 1px solid var(--border);
    }

    .feed-panel header span {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }

    .feed-panel h2 {
      margin: 4px 0 0;
      font-size: 18px;
    }

    .icon-button {
      width: 34px;
      height: 34px;
      padding: 0;
    }

    .feed-list {
      max-height: calc(100dvh - 132px);
      overflow: auto;
      padding: 8px;
    }

    .feed-item {
      padding: 10px;
      border: 1px solid rgba(182, 193, 204, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
    }

    .feed-item + .feed-item {
      margin-top: 8px;
    }

    .feed-item:hover {
      border-color: rgba(46, 230, 214, 0.32);
      background: rgba(46, 230, 214, 0.07);
    }

    .feed-item div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .feed-item strong {
      color: #fff;
      overflow-wrap: anywhere;
    }

    .feed-item time {
      flex-shrink: 0;
      color: var(--muted);
      font-size: 12px;
    }

    .feed-item time b {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 20px;
      margin-right: 6px;
      border-radius: 6px;
      background: rgba(246, 183, 60, 0.16);
      color: #ffe6ad;
      font-size: 11px;
    }

    .feed-item p {
      margin: 6px 0 0;
      color: #cbd5e1;
      font-size: 13px;
      line-height: 1.4;
    }

    .feed-item.success {
      border-left: 3px solid #22c55e;
    }

    .feed-item.warning {
      border-left: 3px solid #f59e0b;
    }

    .feed-item.danger {
      border-left: 3px solid #ef4444;
    }

    .feed-item.info {
      border-left: 3px solid #38bdf8;
    }

    .empty {
      margin: 12px;
      color: var(--muted);
    }

    @media (max-width: 980px) {
      .event-feed {
        top: auto;
        right: 14px;
        bottom: calc(70px + env(safe-area-inset-bottom));
      }

      .feed-panel {
        max-height: min(520px, calc(100dvh - 92px));
      }

      .feed-list {
        max-height: min(420px, calc(100dvh - 196px));
      }
    }
  `],
})
export class EventFeedComponent {
  open = false;

  constructor(
    readonly feed: EventFeedService,
    private readonly router: Router,
  ) {}

  openEvent(item: EventFeedItem): void {
    if (!item.route) {
      return;
    }

    void this.router.navigate([item.route], {
      queryParams: item.queryParams,
    });
  }
}
