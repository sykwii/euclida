import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Unit } from './unit.model';

@Injectable({
  providedIn: 'root',
})
export class UnitsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<Unit[]> {
    return this.api.get<Unit[]>('/units');
  }
}