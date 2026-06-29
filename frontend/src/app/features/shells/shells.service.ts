import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Shell } from './shell.model';

export interface CreateShellRequest {
  systemType: string;
  damageType: string;
  marking: string;
}

@Injectable({ providedIn: 'root' })
export class ShellsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Shell[]> {
    return this.api.get<Shell[]>('/shells');
  }

  create(body: CreateShellRequest): Observable<Shell> {
    return this.api.post<Shell>('/shells', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/shells/${id}`);
  }
}