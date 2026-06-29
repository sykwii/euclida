import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';
import { EventFeedService } from './event-feed.service';

export interface OperatorShift {
  id: string;
  operatorUserId: string;
  operatorLogin: string;
  operatorName: string | null;
  unitId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed';
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorShiftState {
  id: string | null;
  isActive: boolean;
  startedAt: string | null;
  endedAt: string | null;
  operatorName: string | null;
  loading: boolean;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class ShiftService {
  private readonly stateSubject = new BehaviorSubject<OperatorShiftState>(this.emptyState());
  readonly state$ = this.stateSubject.asObservable();

  constructor(
    private readonly api: ApiService,
    private readonly eventFeed: EventFeedService,
  ) {
    this.loadCurrentShift();
  }

  get snapshot(): OperatorShiftState {
    return this.stateSubject.value;
  }

  get shiftStartedAt(): Date {
    return this.snapshot.startedAt ? new Date(this.snapshot.startedAt) : new Date();
  }

  loadCurrentShift(): void {
    this.setState({ loading: true, error: null });

    this.api.get<OperatorShift | null>('/operator-shifts/current').subscribe({
      next: (shift) => {
        this.stateSubject.next(shift ? this.toState(shift, false, null) : this.emptyState());
      },
      error: () => {
        this.setState({ loading: false, error: 'Не вдалося завантажити зміну' });
      },
    });
  }

  startShift(): void {
    const current = this.snapshot;

    if (current.loading || current.isActive) return;

    this.setState({ loading: true, error: null });

    this.api.post<OperatorShift>('/operator-shifts/start', {}).subscribe({
      next: (shift) => {
        this.stateSubject.next(this.toState(shift, false, null));
        this.eventFeed.load();
        this.eventFeed.add({
          type: 'success',
          title: 'Зміну розпочато',
          details: shift.operatorName || shift.operatorLogin,
        });
      },
      error: (error) => {
        this.setState({ loading: false, error: this.getErrorMessage(error, 'Не вдалося почати зміну') });
      },
    });
  }

  endShift(note?: string): void {
    const current = this.snapshot;

    if (current.loading || !current.isActive) return;

    this.setState({ loading: true, error: null });

    this.api.post<OperatorShift>('/operator-shifts/end', { note: note || null }).subscribe({
      next: (shift) => {
        this.stateSubject.next(this.toState(shift, false, null));
        this.eventFeed.load();
        this.eventFeed.add({
          type: 'warning',
          title: 'Зміну завершено',
          details: shift.operatorName || shift.operatorLogin,
        });
      },
      error: (error) => {
        this.setState({ loading: false, error: this.getErrorMessage(error, 'Не вдалося завершити зміну') });
      },
    });
  }

  private setState(patch: Partial<OperatorShiftState>): void {
    this.stateSubject.next({ ...this.stateSubject.value, ...patch });
  }

  private toState(shift: OperatorShift, loading: boolean, error: string | null): OperatorShiftState {
    return {
      id: shift.id,
      isActive: shift.status === 'active' && !shift.endedAt,
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      operatorName: shift.operatorName || shift.operatorLogin,
      loading,
      error,
    };
  }

  private emptyState(): OperatorShiftState {
    return {
      id: null,
      isActive: false,
      startedAt: null,
      endedAt: null,
      operatorName: null,
      loading: false,
      error: null,
    };
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    const response = error as { error?: { message?: string | string[] } };
    const message = response.error?.message;

    if (Array.isArray(message)) return message.join('; ');
    if (message) return message;

    return fallback;
  }
}
