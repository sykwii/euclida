import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ToastMessage {
  id: number;
  type: 'info' | 'success' | 'warning' | 'danger';
  text: string;
  count: number;
  updatedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly messagesSubject = new BehaviorSubject<ToastMessage[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  readonly messages$ = this.messagesSubject.asObservable();

  show(
    text: string,
    type: ToastMessage['type'] = 'info',
  ): void {
    const normalizedText = text.trim();
    const current = this.messagesSubject.value;
    const existing = current.find(
      (item) => item.text === normalizedText && item.type === type,
    );

    if (existing) {
      const updated: ToastMessage = {
        ...existing,
        count: existing.count + 1,
        updatedAt: Date.now(),
      };

      this.messagesSubject.next(
        current.map((item) => (item.id === existing.id ? updated : item)),
      );
      this.scheduleRemove(updated.id);
      return;
    }

    const message: ToastMessage = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type,
      text: normalizedText,
      count: 1,
      updatedAt: Date.now(),
    };

    this.messagesSubject.next([
      message,
      ...current,
    ].slice(0, 4));

    this.scheduleRemove(message.id);
  }

  remove(id: number): void {
    const timer = this.timers.get(id);

    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this.messagesSubject.next(
      this.messagesSubject.value.filter((item) => item.id !== id),
    );
  }

  private scheduleRemove(id: number): void {
    const currentTimer = this.timers.get(id);

    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    const timer = setTimeout(() => this.remove(id), 6500);
    this.timers.set(id, timer);
  }
}
