import { readFileSync } from 'fs';
import { join } from 'path';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import {
  ArtilleryExecutionDto,
  ExecutionChargeComponentDto,
} from './execution/dto/create-execution-record.dto';
import { ExecutionRecordArtillery } from './execution/execution-record-artillery.entity';
import { ConfirmFirePositionReadinessDto } from './fire-positions/dto/confirm-fire-position-readiness.dto';
import { StockMovement } from './stock-movements/stock-movement.entity';
import { AirThreat } from './air-threats/air-threat.entity';
import { AppSetting } from './settings/app-setting.entity';
import { Primer } from './primers/primer.entity';
import { WeaponDeployment } from './weapon-systems/weapon-deployment.entity';
import { WeaponSystem } from './weapon-systems/weapon-system.entity';
import { Zone } from './zones/zone.entity';

describe('OPS runtime regressions', () => {
  it('allows marking a fire position not ready without sending readinessStatus', async () => {
    const dto = new ConfirmFirePositionReadinessDto();
    dto.notReadyReason = 'prohibited';

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('allows artillery execution snapshots without legacy zoneId', async () => {
    const dto = new ArtilleryExecutionDto();
    dto.compositionSource = 'planned';
    dto.sourceShotConfigurationId = 'dfb531da-99ee-4a89-b1f7-6ea02175b7ce';
    dto.weaponModelId = '2295a2df-718b-482f-9358-ff8808d48226';
    dto.shellId = '3bd9b9bd-df1f-4a00-9e70-2c69a06b8379';
    dto.fuzeId = '243439b6-7eec-43ba-bd91-24847388ff3e';
    dto.primerId = '1697bc63-de0d-4a9d-95fd-6a2a49d3e167';
    dto.maxRangeM = 17000;
    dto.compositionSnapshot = { zoneNumber: 6 };
    const charge = new ExecutionChargeComponentDto();
    charge.chargeId = 'ba537908-7678-4010-9a17-5be4c5267dfa';
    charge.chargeName = 'M4A2';
    charge.quantityPerShot = 4;
    charge.accountingUnit = 'piece';
    charge.sortOrder = 0;
    dto.charges = [charge];

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('keeps execution zoneId nullable for zone-number shot kits', () => {
    const zoneColumn = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === ExecutionRecordArtillery &&
        column.propertyName === 'zoneId',
    );

    expect(zoneColumn?.options.nullable).toBe(true);
  });

  it('maps StockMovement stock operation and accounting unit columns', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((column) => column.target === StockMovement)
      .map((column) => [column.propertyName, column.options.name]);

    expect(columns).toEqual(
      expect.arrayContaining([
        ['stockOperationId', 'stock_operation_id'],
        ['accountingUnit', 'accounting_unit'],
      ]),
    );
  });

  it('ships rerunnable execution journal schema repair SQL', () => {
    const sql = readFileSync(
      join(process.cwd(), 'scripts', 'ops-runtime-execution-journal.sql'),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS execution_record_artillery');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS execution_record_charge_components',
    );
    expect(sql).toContain('chk_execution_records_purpose');
    expect(sql).toContain('main_fire');
  });

  it('ships the complete rerunnable release preflight schema repair', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        '..',
        'database',
        'init',
        '51_release_preflight_schema_contract.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app_settings');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS air_threats');
    expect(sql).toContain('ALTER COLUMN ammo_type DROP NOT NULL');
    expect(sql).toContain('ALTER COLUMN from_location_type DROP NOT NULL');
    expect(sql).toContain('ALTER COLUMN weapon_model DROP NOT NULL');
    expect(sql).toContain('ALTER COLUMN zone_id DROP NOT NULL');
    expect(sql).toContain('ALTER COLUMN item_type TYPE varchar(50)');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS ammo_depot_id uuid NULL');
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING');
  });

  it('keeps entity metadata aligned with the repaired clean schema', () => {
    const columns = getMetadataArgsStorage().columns;
    const column = (target: object, propertyName: string) =>
      columns.find(
        (item) => item.target === target && item.propertyName === propertyName,
      );

    expect(column(Primer, 'ammoType')?.options).toEqual(
      expect.objectContaining({ nullable: true, length: 100 }),
    );
    expect(column(WeaponDeployment, 'fromLocationType')?.options.nullable).toBe(
      true,
    );
    expect(column(WeaponDeployment, 'toLocationType')?.options.nullable).toBe(
      true,
    );
    expect(column(ExecutionRecordArtillery, 'zoneId')?.options.nullable).toBe(
      true,
    );
    expect(column(StockMovement, 'itemType')?.options.length).toBe(50);
    expect(column(WeaponSystem, 'lat')?.options.nullable).toBe(true);
    expect(column(WeaponSystem, 'lng')?.options.nullable).toBe(true);
    expect(column(WeaponSystem, 'ammoDepotId')?.options.nullable).toBe(true);
    expect(
      getMetadataArgsStorage().tables.some(
        (table) => table.target === AppSetting && table.name === 'app_settings',
      ),
    ).toBe(true);
    expect(
      getMetadataArgsStorage().tables.some(
        (table) => table.target === AirThreat && table.name === 'air_threats',
      ),
    ).toBe(true);
    expect(column(Zone, 'weaponModelId')?.options.nullable).not.toBe(true);
  });
});
