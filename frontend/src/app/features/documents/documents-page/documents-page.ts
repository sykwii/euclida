import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { DocumentFormat, DocumentKind, DocumentsService } from '../documents.service';

interface DocumentCard {
  kind: DocumentKind;
  title: string;
  description: string;
}

@Component({
  selector: 'app-documents-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './documents-page.html',
  styleUrl: './documents-page.css',
})
export class DocumentsPage {
  loadingKey = '';
  errorMessage = '';

  cards: DocumentCard[] = [
    { kind: 'summary', title: 'Зведений звіт', description: 'Загальний стан системи: вогневі завдання, СГ, ВП, БК.' },
    { kind: 'orders', title: 'Вогневі завдання / накази', description: 'Перелік вогневих завдань зі статусами, планом і фактом.' },
    { kind: 'stock', title: 'Залишки БК', description: 'Експорт залишків снарядів по складах.' },
    { kind: 'readiness', title: 'Боєготовність', description: 'Стан СГ і ВП, причини неготовності.' },
  ];

  constructor(private readonly service: DocumentsService, private readonly cdr: ChangeDetectorRef) {}

  async download(kind: DocumentKind, format: DocumentFormat): Promise<void> {
    this.errorMessage = '';
    this.loadingKey = `${kind}-${format}`;
    try {
      await this.service.download(kind, format);
    } catch (error) {
            this.errorMessage = 'Не вдалося сформувати документ';
    } finally {
      this.loadingKey = '';
      this.cdr.detectChanges();
    }
  }
}
