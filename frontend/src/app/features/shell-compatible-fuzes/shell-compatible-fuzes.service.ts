import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ShellCompatibleFuze } from './shell-compatible-fuze.model';

export interface CreateShellCompatibleFuzeRequest {
  shellId: string;
  fuzeId: string;
}

@Injectable({ providedIn: 'root' })
export class ShellCompatibleFuzesService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<ShellCompatibleFuze[]> {
    return this.api.get<ShellCompatibleFuze[]>('/shell-compatible-fuzes');
  }

  create(body: CreateShellCompatibleFuzeRequest): Observable<ShellCompatibleFuze> {
    return this.api.post<ShellCompatibleFuze>('/shell-compatible-fuzes', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/shell-compatible-fuzes/${id}`);
  }
}