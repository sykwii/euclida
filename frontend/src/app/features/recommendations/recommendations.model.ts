export type RecommendationLevel = 'info' | 'warning' | 'critical';

export interface RecommendationItem {
  id: string;
  level: RecommendationLevel;
  module: string;
  title: string;
  description: string;
  action: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export interface RecommendationsDashboard {
  generatedAt: string;
  total: number;
  critical: number;
  warning: number;
  info: number;
  items: RecommendationItem[];
}
