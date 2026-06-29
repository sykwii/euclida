import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Fuze } from './fuze.model';

export interface CreateFuzeRequest {
  marking: string;
  material?: string;
}

@Injectable({ providedIn: 'root' })
export class FuzesService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Fuze[]> {
    return this.api.get<Fuze[]>('/fuzes');
  }

  create(body: CreateFuzeRequest): Observable<Fuze> {
    return this.api.post<Fuze>('/fuzes', body);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/fuzes/${id}`);
  }
}