import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { RecommendationsDashboard } from './recommendations.model';

@Injectable({ providedIn: 'root' })
export class RecommendationsService {
  constructor(private readonly api: ApiService) {}

  getDashboard() {
    return this.api.get<RecommendationsDashboard>('/recommendations/dashboard');
  }
}
