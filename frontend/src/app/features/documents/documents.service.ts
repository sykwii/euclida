import { Injectable } from '@angular/core';
import { API_URL } from '../../core/api-config';

export type DocumentKind = 'summary' | 'orders' | 'stock' | 'readiness';
export type DocumentFormat = 'text' | 'csv' | 'pdf';

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  async download(kind: DocumentKind, format: DocumentFormat): Promise<void> {
    const token = localStorage.getItem('euclida_access_token');
    const response = await fetch(`${API_URL}/documents/${kind}/${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `euclida-${kind}.${format === 'text' ? 'txt' : format}`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
