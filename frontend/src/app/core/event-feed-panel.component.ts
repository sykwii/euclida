import { CommonModule, DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../features/auth/auth.service';
import { EventLog } from '../features/event-logs/event-logs.service';
import { EventFeedMode, EventFeedService, EventGroup, EventPriority } from './event-feed.service';

@Component({
  selector: 'app-event-feed-panel',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: `
    <aside class="eu-nc" *ngIf="canSeeEvents" [class.is-open]="open">
      <button type="button" class="eu-nc-fab" *ngIf="!open" (click)="openPanel()" aria-label="Відкрити центр повідомлень">
        <span class="eu-nc-fab__pulse" [class.is-idle]="stats.unread === 0"></span>
        <span class="eu-nc-fab__text">
          <b>Центр повідомлень</b>
          <small>{{ stats.critical }} крит. · {{ stats.today }} сьогодні</small>
        </span>
        <strong>{{ stats.unread }}</strong>
      </button>

      <section class="eu-nc-panel" *ngIf="open" aria-label="Центр повідомлень">
        <header class="eu-nc-header">
          <div class="eu-nc-title">
            <span>{{ modeEyebrow }}</span>
            <h2>{{ modeTitle }}</h2>
          </div>
          <button type="button" class="eu-nc-icon" (click)="close($event)" aria-label="Закрити">×</button>
        </header>

        <section class="eu-nc-stats" aria-label="Зведення повідомлень">
          <button type="button" class="eu-nc-stat" [class.active]="mode === 'notifications'" (click)="setMode('notifications')">
            <b>{{ stats.unread }}</b>
            <span>Нові</span>
          </button>
          <button type="button" class="eu-nc-stat is-critical" [class.active]="priorityFilter === 'critical'" (click)="setPriorityFilter('critical')">
            <b>{{ stats.critical }}</b>
            <span>Критичні</span>
          </button>
          <button type="button" class="eu-nc-stat" [class.active]="mode === 'today'" (click)="setMode('today')">
            <b>{{ stats.today }}</b>
            <span>Сьогодні</span>
          </button>
          <button type="button" class="eu-nc-stat" [class.active]="mode === 'journal'" (click)="setMode('journal')">
            <b>{{ stats.journal }}</b>
            <span>Журнал</span>
          </button>
        </section>

        <section class="eu-nc-controls">
          <nav class="eu-nc-tabs" aria-label="Режим центру повідомлень">
            <button type="button" [class.active]="mode === 'notifications'" (click)="setMode('notifications')">Центр</button>
            <button type="button" [class.active]="mode === 'today'" (click)="setMode('today')">Сьогодні</button>
            <button type="button" [class.active]="mode === 'journal'" (click)="setMode('journal')">Журнал</button>
          </nav>

          <label class="eu-nc-search">
            <span>Пошук</span>
            <input type="search" placeholder="ВГЗ, ВП, склад, дія..." [(ngModel)]="searchTerm" />
          </label>

          <div class="eu-nc-filter-row">
            <button type="button" [class.active]="priorityFilter === 'all'" (click)="setPriorityFilter('all')">Всі</button>
            <button type="button" [class.active]="priorityFilter === 'critical'" (click)="setPriorityFilter('critical')">Крит</button>
            <button type="button" [class.active]="priorityFilter === 'high'" (click)="setPriorityFilter('high')">Важливі</button>
            <button type="button" [class.active]="unreadOnly" (click)="toggleUnreadOnly()" *ngIf="mode === 'notifications'">Непрочитані</button>
          </div>

          <div class="eu-nc-action-row">
            <button type="button" (click)="expandPriority()" *ngIf="filteredGroups.length">Розкрити важливі</button>
            <button type="button" (click)="collapseAll()" *ngIf="filteredGroups.length">Згорнути</button>
            <button type="button" (click)="markSeen()" *ngIf="mode === 'notifications'">Прочитано</button>
            <button type="button" (click)="eventFeed.load()">{{ eventFeed.isLoading ? 'Оновлюю…' : 'Оновити' }}</button>
            <button type="button" (click)="resetFilters()" *ngIf="hasFilters">Скинути</button>
          </div>
        </section>

        <section class="eu-nc-status" *ngIf="eventFeed.isLoading">
          <span class="eu-nc-loader"></span>
          <p>Оновлюю події…</p>
        </section>
        <section class="eu-nc-status is-error" *ngIf="eventFeed.errorMessage && !eventFeed.isLoading">
          <p>{{ eventFeed.errorMessage }}</p>
          <button type="button" (click)="eventFeed.load()">Повторити</button>
        </section>

        <section class="eu-nc-body">
          <ng-container *ngIf="notificationSections.length; else emptyFeed">
            <section class="eu-nc-section" *ngFor="let section of notificationSections; trackBy: trackSection" [class.is-muted]="section.groups.length === 0">
              <header class="eu-nc-section-head">
                <div>
                  <h3>{{ section.title }}</h3>
                  <span>{{ section.subtitle }}</span>
                </div>
                <b>{{ section.groups.length }}</b>
              </header>

              <article class="eu-nc-group" *ngFor="let group of section.groups; trackBy: trackGroup" [ngClass]="['is-' + group.priority, 'tone-' + group.tone, group.unreadCount > 0 ? 'is-unread' : '']">
                <button type="button" class="eu-nc-group-head" (click)="toggleGroup(group.key)">
                  <span class="eu-nc-priority">{{ priorityLabel(group.priority) }}</span>
                  <span class="eu-nc-group-main">
                    <strong>{{ group.title }}</strong>
                    <small>{{ group.unitName || 'Без підрозділу' }} · {{ group.latestAt | date:'dd.MM HH:mm' }}</small>
                    <em>{{ group.summary }}</em>
                  </span>
                  <span class="eu-nc-count">
                    <b>{{ group.items.length }}</b>
                    <i *ngIf="group.unreadCount > 0">+{{ group.unreadCount }}</i>
                    <small>{{ isOpen(group.key) ? '−' : '+' }}</small>
                  </span>
                </button>

                <div class="eu-nc-events" *ngIf="isOpen(group.key)">
                  <button type="button" class="eu-nc-event" *ngFor="let event of group.items; trackBy: trackEvent" [class.is-unread]="eventFeed.isUnread(event)" (click)="openEvent(event)">
                    <span class="eu-nc-event-time">{{ event.createdAt | date:'HH:mm' }}</span>
                    <span class="eu-nc-event-main">
                      <strong>{{ event.entityName || event.title }}</strong>
                      <small>{{ event.details || event.title }}</small>
                      <em>{{ event.actorName || event.actorLogin || 'Система' }} · {{ eventFeed.getEventActionLabel(event) }}</em>
                    </span>
                  </button>
                </div>
              </article>
            </section>
          </ng-container>

          <ng-template #emptyFeed>
            <p class="eu-nc-empty">{{ emptyText }}</p>
          </ng-template>
        </section>
      </section>
    </aside>
  `,
  styles: [`
    :host,
    :host * { box-sizing: border-box; }

    .eu-nc {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: var(--z-notifications);
      pointer-events: none;
      color: #e5edf7;
      font-family: inherit;
    }

    .eu-nc-fab,
    .eu-nc-panel { pointer-events: auto; }

    .eu-nc-fab {
      width: 250px;
      min-height: 54px;
      display: grid;
      grid-template-columns: 12px minmax(0, 1fr) 38px;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid rgba(45, 212, 191, 0.34);
      border-radius: 16px;
      background: rgba(8, 13, 20, 0.96);
      color: #e5edf7;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.38);
      cursor: pointer;
      text-align: left;
    }

    .eu-nc-fab__pulse {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #2dd4bf;
      box-shadow: 0 0 0 6px rgba(45, 212, 191, 0.12);
    }
    .eu-nc-fab__pulse.is-idle { background: #64748b; box-shadow: none; }
    .eu-nc-fab__text { min-width: 0; display: grid; gap: 2px; }
    .eu-nc-fab__text b { color: #f8fafc; font-size: 13px; }
    .eu-nc-fab__text small { color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .eu-nc-fab strong {
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: rgba(45, 212, 191, 0.14);
      color: #99f6e4;
      font-variant-numeric: tabular-nums;
    }

    .eu-nc-panel {
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100dvh - 36px);
      height: min(760px, calc(100dvh - 36px));
      display: grid;
      grid-template-rows: auto auto auto auto 1fr;
      gap: 10px;
      padding: 12px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 18px;
      background: #071019;
      box-shadow: 0 26px 72px rgba(0, 0, 0, 0.48);
    }

    .eu-nc-header,
    .eu-nc-section-head,
    .eu-nc-event { min-width: 0; }

    .eu-nc-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }
    .eu-nc-title span { color: #5eead4; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .eu-nc-title h2 { margin: 3px 0 0; color: #f8fafc; font-size: 19px; line-height: 1.1; }
    .eu-nc-icon {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
      cursor: pointer;
      font-size: 20px;
    }

    .eu-nc-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .eu-nc-stat {
      min-height: 60px;
      display: grid;
      align-content: center;
      gap: 3px;
      padding: 8px 10px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.04);
      color: #e5edf7;
      text-align: left;
      cursor: pointer;
    }
    .eu-nc-stat.active { border-color: rgba(45, 212, 191, 0.42); background: rgba(45, 212, 191, 0.1); }
    .eu-nc-stat.is-critical.active { border-color: rgba(248, 113, 113, .52); background: rgba(127, 29, 29, .18); }
    .eu-nc-stat b { color: #f8fafc; font-size: 22px; line-height: 1; font-variant-numeric: tabular-nums; }
    .eu-nc-stat span { color: #94a3b8; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .eu-nc-controls { display: grid; gap: 8px; min-width: 0; }
    .eu-nc-tabs,
    .eu-nc-filter-row,
    .eu-nc-action-row { display: flex; gap: 6px; flex-wrap: wrap; min-width: 0; }
    .eu-nc-action-row button { flex: 0 1 auto; }
    .eu-nc-tabs button,
    .eu-nc-filter-row button,
    .eu-nc-action-row button,
    .eu-nc-status button {
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .eu-nc-tabs button.active,
    .eu-nc-filter-row button.active { color: #dffcf7; border-color: rgba(45, 212, 191, 0.42); background: rgba(45, 212, 191, 0.1); }
    .eu-nc-search { display: grid; gap: 4px; min-width: 0; }
    .eu-nc-search span { color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .eu-nc-search input {
      width: 100%;
      height: 36px;
      min-height: 36px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      color: #e5edf7;
      padding: 0 12px;
      outline: none;
    }

    .eu-nc-status {
      min-height: 38px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 8px 11px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 12px;
      color: #cbd5e1;
      background: rgba(255, 255, 255, 0.035);
    }
    .eu-nc-status p { margin: 0; }
    .eu-nc-status.is-error { justify-content: space-between; border-color: rgba(248, 113, 113, 0.34); color: #fecaca; background: rgba(127, 29, 29, 0.16); }
    .eu-nc-loader { width: 10px; height: 10px; border-radius: 999px; background: #2dd4bf; box-shadow: 0 0 0 5px rgba(45, 212, 191, .1); }

    .eu-nc-body {
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
    }
    .eu-nc-body::-webkit-scrollbar { width: 8px; }
    .eu-nc-body::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, .22); border-radius: 999px; }

    .eu-nc-section {
      flex: 0 0 auto;
      display: grid;
      gap: 8px;
      padding: 10px;
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.025);
    }
    .eu-nc-section.is-muted { display: none; }
    .eu-nc-section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    }
    .eu-nc-section-head div { min-width: 0; }
    .eu-nc-section-head h3 { margin: 0; color: #f8fafc; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; }
    .eu-nc-section-head span {
      display: block;
      min-width: 0;
      overflow: hidden;
      color: #94a3b8;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .eu-nc-section-head b {
      min-width: 28px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(148, 163, 184, .12);
      color: #cbd5e1;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .eu-nc-group {
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.13);
      border-radius: 14px;
      background: rgba(2, 6, 12, 0.32);
    }
    .eu-nc-group.is-critical { border-color: rgba(248, 113, 113, 0.42); }
    .eu-nc-group.is-high { border-color: rgba(251, 191, 36, 0.32); }
    .eu-nc-group.is-unread { box-shadow: inset 3px 0 0 rgba(45, 212, 191, .72); }

    .eu-nc-group-head {
      width: 100%;
      min-height: 68px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 52px;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
      border: 0;
      background: transparent;
      color: #e5edf7;
      text-align: left;
      cursor: pointer;
    }
    .eu-nc-priority {
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: rgba(45, 212, 191, .1);
      color: #99f6e4;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .eu-nc-group-main { min-width: 0; display: grid; gap: 3px; }
    .eu-nc-group-main strong,
    .eu-nc-group-main small,
    .eu-nc-group-main em {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .eu-nc-group-main strong { color: #f8fafc; font-size: 13px; }
    .eu-nc-group-main small { color: #94a3b8; font-size: 11px; }
    .eu-nc-group-main em { color: #cbd5e1; font-size: 12px; font-style: normal; }
    .eu-nc-count { display: grid; justify-items: end; gap: 2px; }
    .eu-nc-count b { color: #f8fafc; font-size: 18px; line-height: 1; font-variant-numeric: tabular-nums; }
    .eu-nc-count i { color: #99f6e4; font-size: 11px; font-style: normal; font-weight: 900; }
    .eu-nc-count small { color: #94a3b8; font-size: 16px; line-height: 1; }

    .eu-nc-events {
      display: grid;
      gap: 6px;
      padding: 0 10px 10px 62px;
    }
    .eu-nc-event {
      width: 100%;
      min-height: 54px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 8px;
      padding: 8px;
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 11px;
      background: rgba(255, 255, 255, 0.035);
      color: #e5edf7;
      cursor: pointer;
      text-align: left;
    }
    .eu-nc-event.is-unread { border-color: rgba(45, 212, 191, .28); background: rgba(45, 212, 191, .06); }
    .eu-nc-event-time { color: #5eead4; font-size: 11px; font-weight: 900; font-variant-numeric: tabular-nums; }
    .eu-nc-event-main { min-width: 0; display: grid; gap: 2px; }
    .eu-nc-event-main strong,
    .eu-nc-event-main small,
    .eu-nc-event-main em {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .eu-nc-event-main strong { color: #f8fafc; font-size: 12px; }
    .eu-nc-event-main small { color: #cbd5e1; font-size: 11px; }
    .eu-nc-event-main em { color: #94a3b8; font-size: 10px; font-style: normal; }

    .eu-nc-empty {
      margin: auto 0;
      padding: 24px 14px;
      border: 1px dashed rgba(148, 163, 184, .22);
      border-radius: 16px;
      color: #94a3b8;
      text-align: center;
      background: rgba(255, 255, 255, .025);
    }

    @media (max-width: 680px) {
      .eu-nc { inset: auto 10px 76px 10px; right: 10px; bottom: 76px; }
      .eu-nc-fab { width: 100%; }
      .eu-nc-panel { width: 100%; max-height: calc(100dvh - 96px); height: min(700px, calc(100dvh - 96px)); }
      .eu-nc-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .eu-nc-group-head { grid-template-columns: 38px minmax(0, 1fr) 44px; }
      .eu-nc-events { padding-left: 10px; }
    }
  `],
})
export class EventFeedPanelComponent {
  open = false;
  mode: EventFeedMode = 'notifications';
  openedGroups: Record<string, boolean> = {};
  searchTerm = '';
  priorityFilter: EventPriority | 'all' = 'all';
  unreadOnly = false;

  constructor(
    readonly eventFeed: EventFeedService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  get canSeeEvents(): boolean {
    const user = this.auth.getUser();

    return !!user && user.role !== 'observer';
  }

  get stats() {
    return this.eventFeed.getStats();
  }

  get groups(): EventGroup[] {
    return this.eventFeed.getGroups(this.mode);
  }

  get filteredGroups(): EventGroup[] {
    const search = this.searchTerm.trim().toLowerCase();

    return this.groups.filter((group) => {
      if (this.priorityFilter !== 'all' && group.priority !== this.priorityFilter) {
        return false;
      }

      if (this.unreadOnly && group.unreadCount === 0) {
        return false;
      }

      if (!search) return true;

      return group.items.some((event) => this.matchesSearch(event, search));
    });
  }

  get hasFilters(): boolean {
    return !!this.searchTerm.trim() || this.priorityFilter !== 'all' || this.unreadOnly;
  }

  get modeTitle(): string {
    if (this.mode === 'today') return 'Події сьогодні';
    if (this.mode === 'journal') return 'Журнал подій';
    return 'Центр повідомлень';
  }

  get modeEyebrow(): string {
    if (this.mode === 'journal') return 'Повна історія';
    if (this.mode === 'today') return 'Оперативна доба';
    return 'Згруповані важливі події';
  }

  get emptyText(): string {
    if (this.hasFilters) return 'За поточними фільтрами подій немає.';
    if (this.mode === 'notifications') return 'Нових важливих повідомлень немає.';
    if (this.mode === 'today') return 'Сьогодні подій немає.';
    return 'Журнал подій порожній.';
  }


  get notificationSections(): Array<{ key: string; title: string; subtitle: string; groups: EventGroup[] }> {
    const groups = this.filteredGroups;

    if (this.mode !== 'notifications') {
      return [
        {
          key: this.mode,
          title: this.mode === 'today' ? 'Події поточної доби' : 'Журнал подій',
          subtitle: this.mode === 'today' ? 'Всі події за сьогодні' : 'Останні зафіксовані дії системи',
          groups,
        },
      ].filter((section) => section.groups.length > 0);
    }

    return [
      {
        key: 'critical',
        title: 'Потребує дії',
        subtitle: 'Критичні події, ризики та блокери',
        groups: groups.filter((group) => group.priority === 'critical'),
      },
      {
        key: 'high',
        title: 'Потребує уваги',
        subtitle: 'Відхилення, НБГ та скасування',
        groups: groups.filter((group) => group.priority === 'high'),
      },
      {
        key: 'work',
        title: 'Оперативна робота',
        subtitle: 'ВГЗ, логістика, зміни статусів',
        groups: groups.filter((group) => group.priority === 'normal'),
      },
      {
        key: 'info',
        title: 'Інформація',
        subtitle: 'Низький пріоритет та системні записи',
        groups: groups.filter((group) => group.priority === 'low'),
      },
    ].filter((section) => section.groups.length > 0);
  }

  openPanel(): void {
    this.eventFeed.ensureLoaded();
    this.open = true;
  }

  setMode(mode: EventFeedMode): void {
    this.mode = mode;
    this.openedGroups = {};
    if (mode !== 'notifications') {
      this.unreadOnly = false;
    }
  }

  setPriorityFilter(priority: EventPriority | 'all'): void {
    this.priorityFilter = this.priorityFilter === priority ? 'all' : priority;
  }

  toggleUnreadOnly(): void {
    this.unreadOnly = !this.unreadOnly;
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.priorityFilter = 'all';
    this.unreadOnly = false;
  }

  expandPriority(): void {
    this.filteredGroups.forEach((group) => {
      if (group.priority === 'critical' || group.priority === 'high' || group.unreadCount > 0) {
        this.openedGroups[group.key] = true;
      }
    });
  }

  collapseAll(): void {
    this.openedGroups = {};
  }

  markSeen(): void {
    this.eventFeed.markNotificationsSeen();
    this.unreadOnly = false;
  }

  close(event?: Event): void {
    event?.stopPropagation();
    this.open = false;
  }

  isOpen(key: string): boolean {
    return this.openedGroups[key] ?? false;
  }

  toggleGroup(key: string): void {
    this.openedGroups[key] = !this.isOpen(key);
  }

  priorityLabel(priority: EventPriority): string {
    if (priority === 'critical') return 'Крит';
    if (priority === 'high') return 'Вис';
    if (priority === 'normal') return 'Норм';
    return 'Низ';
  }


  trackSection(_: number, section: { key: string }): string {
    return section.key;
  }

  trackGroup(_: number, group: EventGroup): string {
    return group.key;
  }

  trackEvent(_: number, event: EventLog): string {
    return event.id;
  }

  openEvent(event: EventLog): void {
    if (event.eventType === 'service_order') {
      void this.router.navigate(['/service-orders'], {
        queryParams: event.entityId ? { orderId: event.entityId, view: 'cards' } : undefined,
      });
      this.open = false;
      return;
    }

    if (event.eventType === 'weapon') {
      void this.router.navigate(['/weapon-systems'], {
        queryParams: event.entityId ? { entityId: event.entityId } : undefined,
      });
      this.open = false;
      return;
    }

    if (event.eventType === 'fire_position') {
      void this.router.navigate(['/fire-positions'], {
        queryParams: event.entityId ? { entityId: event.entityId } : undefined,
      });
      this.open = false;
      return;
    }

    if (event.eventType === 'stock') {
      void this.router.navigate(['/stock']);
      this.open = false;
      return;
    }

    if (event.eventType === 'air_threat') {
      void this.router.navigate(['/map']);
      this.open = false;
    }
  }

  private matchesSearch(event: EventLog, search: string): boolean {
    return [
      event.title,
      event.details,
      event.entityName,
      event.unitName,
      event.actorName,
      event.actorLogin,
      event.eventType,
      event.action,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  }
}
