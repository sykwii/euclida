import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <button
        type="button"
        class="toast-message"
        *ngFor="let message of toast.messages$ | async"
        [class]="message.type"
        (click)="toast.remove(message.id)"
      >
        <span>{{ message.text }}</span><b *ngIf="message.count > 1">×{{ message.count }}</b>
      </button>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      right: 18px;
      bottom: 86px;
      z-index: var(--z-toast);
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(360px, calc(100vw - 36px));
    }

    .toast-message {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
      text-align: left;
      border-radius: 16px;
      padding: 12px 14px;
      color: #e5e7eb;
      background: rgba(15, 23, 42, 0.96);
      border: 1px solid rgba(148, 163, 184, 0.24);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
    }

    .toast-message span {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .toast-message b {
      min-width: 26px;
      height: 22px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      font-size: 11px;
    }

    .toast-message.success {
      border-color: rgba(34, 197, 94, 0.45);
    }

    .toast-message.warning {
      border-color: rgba(234, 179, 8, 0.55);
    }

    .toast-message.danger {
      border-color: rgba(239, 68, 68, 0.55);
    }

    .toast-message.info {
      border-color: rgba(59, 130, 246, 0.5);
    }

    @media (max-width: 860px) {
      .toast-container {
        left: 10px;
        right: 10px;
        bottom: calc(70px + env(safe-area-inset-bottom));
        width: auto;
      }

      .toast-message {
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 13px;
      }
    }

    @media (max-width: 480px) {
      .toast-container {
        left: 8px;
        right: 8px;
        bottom: calc(62px + env(safe-area-inset-bottom));
      }

      .toast-message {
        padding: 9px 10px;
        font-size: 12px;
      }
    }
  `],
})
export class ToastContainerComponent {
  constructor(readonly toast: ToastService) {}
}
