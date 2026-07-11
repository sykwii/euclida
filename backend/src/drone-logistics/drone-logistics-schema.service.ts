import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DroneLogisticsSchemaService {
  private schemaReady?: Promise<void>;

  constructor(private readonly dataSource: DataSource) {}

  ensureDroneLogisticsSchema(): Promise<void> {
    this.schemaReady ??= this.withDatabaseRetry(() => this.runDroneLogisticsSchema()).catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });

    return this.schemaReady;
  }

  async withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
    const attempts = 3;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === attempts || !this.isRetryableDatabaseError(error)) {
          throw error;
        }

        await this.delay(75 * attempt);
      }
    }

    return operation();
  }

  private isRetryableDatabaseError(error: unknown): boolean {
    const code =
      (error as { code?: string; driverError?: { code?: string } })?.code ??
      (error as { driverError?: { code?: string } })?.driverError?.code;

    return code === '40P01' || code === '40001';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async runDroneLogisticsSchema(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS drone_models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        drone_group VARCHAR(50) NOT NULL DEFAULT 'recon',
        drone_type VARCHAR(50) NOT NULL DEFAULT 'copter',
        camera_type VARCHAR(50) NOT NULL DEFAULT 'none',
        max_range_m INT NULL,
        cruise_speed_kmh INT NULL,
        endurance_minutes INT NULL,
        payload_capacity_kg NUMERIC(10, 3) NULL,
        max_altitude_m INT NULL,
        max_wind_ms NUMERIC(10, 2) NULL,
        note TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS drone_warhead_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        weight_kg NUMERIC(10, 2) NULL,
        measure_unit VARCHAR(20) NOT NULL DEFAULT 'unit',
        note TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS depot_drone_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        depot_id UUID NOT NULL,
        drone_model_id UUID NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS depot_drone_warhead_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        depot_id UUID NOT NULL,
        warhead_type_id UUID NOT NULL,
        quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS air_asset_drone_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        air_asset_position_id UUID NOT NULL,
        drone_model_id UUID NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS air_asset_warhead_stock (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        air_asset_position_id UUID NOT NULL,
        warhead_type_id UUID NOT NULL,
        quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS drone_stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        movement_type VARCHAR(50) NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        depot_from_id UUID NULL,
        depot_to_id UUID NULL,
        air_asset_from_id UUID NULL,
        air_asset_to_id UUID NULL,
        drone_model_id UUID NULL,
        warhead_type_id UUID NULL,
        quantity INT NOT NULL DEFAULT 0,
        comment TEXT NULL,
        created_by_id UUID NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
      ALTER TABLE drone_models
      ADD COLUMN IF NOT EXISTS max_range_m INT NULL,
      ADD COLUMN IF NOT EXISTS cruise_speed_kmh INT NULL,
      ADD COLUMN IF NOT EXISTS endurance_minutes INT NULL,
      ADD COLUMN IF NOT EXISTS payload_capacity_kg NUMERIC(10, 3) NULL,
      ADD COLUMN IF NOT EXISTS max_altitude_m INT NULL,
      ADD COLUMN IF NOT EXISTS max_wind_ms NUMERIC(10, 2) NULL,
      ADD COLUMN IF NOT EXISTS drone_group VARCHAR(50) NOT NULL DEFAULT 'recon',
      ADD COLUMN IF NOT EXISTS drone_type VARCHAR(50) NOT NULL DEFAULT 'copter',
      ADD COLUMN IF NOT EXISTS camera_type VARCHAR(50) NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS note TEXT NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE drone_warhead_types
      ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10, 2) NULL,
      ADD COLUMN IF NOT EXISTS measure_unit VARCHAR(20) NOT NULL DEFAULT 'unit',
      ADD COLUMN IF NOT EXISTS note TEXT NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE depot_drone_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE depot_drone_warhead_stock
      ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;
      ALTER TABLE depot_drone_warhead_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE air_asset_warhead_stock
      ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;
      ALTER TABLE air_asset_drone_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE air_asset_warhead_stock
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE drone_stock_movements
      ADD COLUMN IF NOT EXISTS depot_from_id UUID NULL,
      ADD COLUMN IF NOT EXISTS depot_to_id UUID NULL,
      ADD COLUMN IF NOT EXISTS air_asset_from_id UUID NULL,
      ADD COLUMN IF NOT EXISTS air_asset_to_id UUID NULL,
      ADD COLUMN IF NOT EXISTS drone_model_id UUID NULL,
      ADD COLUMN IF NOT EXISTS warhead_type_id UUID NULL,
      ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS comment TEXT NULL,
      ADD COLUMN IF NOT EXISTS created_by_id UUID NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE drone_stock_movements
      ALTER COLUMN quantity TYPE NUMERIC(18, 3) USING quantity::numeric;
    `);
  }
}
