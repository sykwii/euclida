import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { FireMission } from './fire-mission.model';

@Injectable({
  providedIn: 'root',
})
export class FireMissionsService {
  constructor(private readonly api: ApiService) {}

  getAll(): Observable<FireMission[]> {
    return this.api.get<FireMission[]>('/fire-missions');
  }
}