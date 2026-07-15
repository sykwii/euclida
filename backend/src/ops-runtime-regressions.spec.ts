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
});
