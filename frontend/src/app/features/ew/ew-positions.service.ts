import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { CreateEwPositionRequest, EwPosition } from './ew-position.model';

@Injectable({ providedIn: 'root' })
export class EwPositionsService {
  constructor(private readonly api: ApiService) {}

  getAll() {
    return this.api.get<EwPosition[]>('/ew-positions');
  }

  getOne(id: string) {
    return this.api.get<EwPosition>(`/ew-positions/${id}`);
  }

  create(body: CreateEwPositionRequest) {
    return this.api.post<EwPosition>('/ew-positions', body);
  }

  update(id: string, body: Partial<CreateEwPositionRequest>) {
    return this.api.patch<EwPosition>(`/ew-positions/${id}`, body);
  }

  delete(id: string) {
    return this.api.delete<void>(`/ew-positions/${id}`);
  }
}
