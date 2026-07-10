import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DEFAULT_RECON_SETTINGS } from '../settings/recon-default-settings';

@Injectable()
export class ReconSettingsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query(`SELECT key, value FROM recon_settings ORDER BY key ASC`);
    const stored = Object.fromEntries(rows.map((row: { key: string; value: unknown }) => [row.key, row.value]));
    return { ...DEFAULT_RECON_SETTINGS, ...stored };
  }

  async upsert(key: string, value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_settings (key, value)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING key, value`,
      [key, JSON.stringify(value)],
    );
    return row;
  }

  async clusteringRadius(targetType: string): Promise<number> {
    const settings = await this.getAll();
    const radiuses = settings['clusteringRadiusM'] as Record<string, number> | undefined;
    return radiuses?.[targetType] || 500;
  }
}
