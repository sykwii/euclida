import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { AirThreatsService } from '../air-threats/air-threats.service';
import type { AuthUser } from '../auth/auth-user.types';
import { ServiceOrdersService } from '../service-orders/service-orders.service';
import {
  AmmoRecipientAnalyticsRow,
  AnalyticsDashboard,
  AmmoStockSummary,
  AnalyticsCounter,
  DepotStockSummary,
  LogisticsFlowRow,
  NamedCount,
  ShootingAnalytics,
  ShootingBreakdownRow,
  ShootingDailyRow,
  StatusCount,
  OperationalAnalyticsV2,
  AnalyticsV2AttentionItem,
  AnalyticsV2AmmoForecastRow,
  AnalyticsV2RotationRow,
} from './analytics.types';

const KYIV_TIMEZONE = 'Europe/Kyiv' as const;

type RawRow = Record<string, unknown>;
type UnitScope = { clause: string; params: unknown[] };

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly serviceOrders: ServiceOrdersService,
    private readonly airThreats: AirThreatsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  async getOperatorCounters(user: AuthUser) {
    const [actionOrdersCount, activeThreatsCount] = await Promise.all([
      this.serviceOrders.countActionable(user),
      this.airThreats.countActive(),
    ]);

    return {
      actionOrdersCount,
      activeThreatsCount,
    };
  }


  async getOperationalAnalytics(daysRaw: string | undefined, user: AuthUser): Promise<OperationalAnalyticsV2> {
    const days = this.parseDays(daysRaw, [7, 10, 20, 30], 7);
    const period = this.getKyivPeriod(days);

    const weaponScope = await this.getUnitScope(user, 1, 'ws.unit_id');
    const firePositionScope = await this.getUnitScope(user, 1, 'fp.unit_id');
    const serviceOrderScope = await this.getUnitScope(user, 3, 'COALESCE(fp.unit_id, so.assigned_unit_id)');
    const stockScope = await this.getUnitScope(user, 3, 'COALESCE(fp.unit_id, d.unit_id)');

    const [
      readiness,
      deliveriesTop,
      tasksTopByFirePosition,
      lowAmmoFirePositions,
      rotation,
      ammoForecast,
      threatBlockedFirePositions,
      weaponEfficiencyRows,
    ] = await Promise.all([
      this.getOperationalReadiness(weaponScope, firePositionScope),
      this.getDeliveriesTop(period, stockScope),
      this.getCompletedTasksTop(period, serviceOrderScope),
      this.getLowAmmoFirePositions(firePositionScope),
      this.getRotationStatus(firePositionScope),
      this.getAmmoForecast(period, serviceOrderScope),
      this.getThreatBlockedFirePositions(firePositionScope),
      this.getWeaponEfficiency(period, serviceOrderScope),
    ]);

    return {
      timezone: KYIV_TIMEZONE,
      periodDays: days,
      generatedAt: new Date().toISOString(),
      generatedAtKyiv: this.formatKyiv(new Date()),
      readiness,
      deliveriesTop,
      tasksTopByFirePosition,
      lowAmmoFirePositions,
      rotation,
      ammoForecast,
      threatBlockedFirePositions,
      weaponEfficiency: {
        top: weaponEfficiencyRows.slice(0, 10),
        bottom: weaponEfficiencyRows.slice(-10).reverse(),
      },
      attention: this.buildOperationalAttention(lowAmmoFirePositions, rotation, ammoForecast, readiness),
    };
  }

  private async getOperationalReadiness(weaponScope: UnitScope, firePositionScope: UnitScope) {
    const weaponTotalsRows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ws.readiness_status IN ('ready', 'combat_ready', 'ready_for_combat', 'боєготов'))::int AS ready,
        COUNT(*) FILTER (WHERE ws.readiness_status IN ('not_ready', 'unready', 'неготов', 'repair'))::int AS not_ready,
        COUNT(*) FILTER (WHERE ws.readiness_status IS NULL OR ws.readiness_status = 'unknown')::int AS unknown
      FROM weapon_systems ws
      WHERE 1 = 1
        ${weaponScope.clause}
    `, weaponScope.params);

    const weaponReasonRows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COALESCE(NULLIF(TRIM(ws.not_ready_reason), ''), 'Причину не вказано') AS reason,
        COUNT(*)::int AS total
      FROM weapon_systems ws
      WHERE ws.readiness_status NOT IN ('ready', 'combat_ready', 'ready_for_combat', 'боєготов')
        ${weaponScope.clause}
      GROUP BY COALESCE(NULLIF(TRIM(ws.not_ready_reason), ''), 'Причину не вказано')
      ORDER BY total DESC, reason ASC
      LIMIT 20
    `, weaponScope.params);

    const fpTotalsRows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE fp.readiness_status IN ('ready', 'combat_ready', 'ready_for_combat', 'боєготов'))::int AS ready,
        COUNT(*) FILTER (WHERE fp.readiness_status IN ('not_ready', 'unready', 'неготов'))::int AS not_ready,
        COUNT(*) FILTER (WHERE fp.readiness_status IS NULL OR fp.readiness_status = 'unknown')::int AS unknown
      FROM fire_positions fp
      WHERE 1 = 1
        ${firePositionScope.clause}
    `, firePositionScope.params);

    const fpReasonRows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COALESCE(NULLIF(TRIM(fp.not_ready_reason), ''), 'Причину не вказано') AS reason,
        COUNT(*)::int AS total
      FROM fire_positions fp
      WHERE fp.readiness_status NOT IN ('ready', 'combat_ready', 'ready_for_combat', 'боєготов')
        ${firePositionScope.clause}
      GROUP BY COALESCE(NULLIF(TRIM(fp.not_ready_reason), ''), 'Причину не вказано')
      ORDER BY total DESC, reason ASC
      LIMIT 20
    `, firePositionScope.params);

    const threatRows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COALESCE(NULLIF(TRIM(fp.not_ready_reason), ''), COALESCE(NULLIF(TRIM(fp.air_situation_status), ''), 'Повітряна загроза')) AS reason,
        COUNT(*)::int AS total
      FROM fire_positions fp
      WHERE (
          LOWER(COALESCE(fp.not_ready_reason, '')) LIKE '%загроз%'
          OR LOWER(COALESCE(fp.not_ready_reason, '')) LIKE '%повітр%'
          OR LOWER(COALESCE(fp.air_situation_status, '')) NOT IN ('', 'unknown', 'clear', 'normal', 'немає', 'відсутня')
        )
        ${firePositionScope.clause}
      GROUP BY COALESCE(NULLIF(TRIM(fp.not_ready_reason), ''), COALESCE(NULLIF(TRIM(fp.air_situation_status), ''), 'Повітряна загроза'))
      ORDER BY total DESC, reason ASC
      LIMIT 20
    `, firePositionScope.params);

    const weaponTotals = this.counter(weaponTotalsRows[0]);
    const fpTotals = this.counter(fpTotalsRows[0]);

    return {
      weapons: {
        total: weaponTotals.total,
        ready: weaponTotals.ready ?? 0,
        notReady: weaponTotals.notReady ?? 0,
        unknown: weaponTotals.unknown ?? 0,
        notReadyReasons: weaponReasonRows.map((row) => ({
          reason: String(row.reason),
          total: this.num(row.total),
        })),
      },
      firePositions: {
        total: fpTotals.total,
        ready: fpTotals.ready ?? 0,
        notReady: fpTotals.notReady ?? 0,
        unknown: fpTotals.unknown ?? 0,
        notReadyReasons: fpReasonRows.map((row) => ({
          reason: String(row.reason),
          total: this.num(row.total),
        })),
        threatNotReady: threatRows.map((row) => ({
          reason: String(row.reason),
          total: this.num(row.total),
        })),
      },
    };
  }

  private async getDeliveriesTop(period: { start: string; end: string }, unitScope: UnitScope) {
    const rows = await this.dataSource.query<RawRow[]>(`
      WITH incoming AS (
        SELECT
          sm.to_depot_id AS depot_id,
          COUNT(DISTINCT COALESCE(sm.movement_group_id::text, sm.document_number, sm.id::text))::int AS deliveries,
          COALESCE(SUM(sm.quantity)::numeric, 0) AS total_quantity,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'shell')::numeric, 0) AS shells,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'charge')::numeric, 0) AS charges,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'fuze')::numeric, 0) AS fuzes,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'primer')::numeric, 0) AS primers,
          MAX(sm.movement_datetime) AS last_delivery_at
        FROM stock_movements sm
        WHERE sm.to_depot_id IS NOT NULL
          AND sm.movement_type IN ('transfer', 'external_supply', 'supply')
          AND (sm.movement_datetime AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
          AND (sm.movement_datetime AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
        GROUP BY sm.to_depot_id
      )
      SELECT
        fp.id AS fire_position_id,
        fp.name AS fire_position_name,
        COALESCE(fp.unit_id, d.unit_id) AS unit_id,
        COALESCE(u.name, 'Без підрозділу') AS unit_name,
        d.id AS depot_id,
        d.name AS depot_name,
        i.deliveries,
        i.total_quantity,
        i.shells,
        i.charges,
        i.fuzes,
        i.primers,
        i.last_delivery_at
      FROM incoming i
      JOIN depots d ON d.id = i.depot_id
      LEFT JOIN fire_positions fp ON fp.ammo_depot_id = d.id
      LEFT JOIN units u ON u.id = COALESCE(fp.unit_id, d.unit_id)
      WHERE fp.id IS NOT NULL
        ${unitScope.clause}
      ORDER BY i.deliveries DESC, i.total_quantity DESC, fp.name ASC
      LIMIT 20
    `, [period.start, period.end, ...unitScope.params]);

    return rows.map((row) => ({
      firePositionId: this.strOrNull(row.fire_position_id),
      firePositionName: String(row.fire_position_name ?? 'Без ВП'),
      unitId: this.strOrNull(row.unit_id),
      unitName: this.strOrNull(row.unit_name),
      depotId: this.strOrNull(row.depot_id),
      depotName: this.strOrNull(row.depot_name),
      deliveries: this.num(row.deliveries),
      totalQuantity: this.num(row.total_quantity),
      shells: this.num(row.shells),
      charges: this.num(row.charges),
      fuzes: this.num(row.fuzes),
      primers: this.num(row.primers),
      lastDeliveryAt: row.last_delivery_at ? new Date(String(row.last_delivery_at)).toISOString() : null,
    }));
  }

  private async getCompletedTasksTop(period: { start: string; end: string }, unitScope: UnitScope) {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        fp.id AS fire_position_id,
        COALESCE(fp.name, 'Без ВП') AS fire_position_name,
        COALESCE(fp.unit_id, so.assigned_unit_id) AS unit_id,
        COALESCE(u.name, 'Без підрозділу') AS unit_name,
        COUNT(*)::int AS completed_tasks,
        COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
      FROM service_orders so
      LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
      LEFT JOIN units u ON u.id = COALESCE(fp.unit_id, so.assigned_unit_id)
      WHERE so.status = 'completed'
        AND so.completed_at IS NOT NULL
        AND so.result_type IS NOT NULL
        AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
        AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
        ${unitScope.clause}
      GROUP BY fp.id, fp.name, COALESCE(fp.unit_id, so.assigned_unit_id), u.name
      ORDER BY completed_tasks DESC, actual_quantity DESC, fire_position_name ASC
      LIMIT 20
    `, [period.start, period.end, ...unitScope.params]);

    return rows.map((row) => ({
      firePositionId: this.strOrNull(row.fire_position_id),
      firePositionName: String(row.fire_position_name ?? 'Без ВП'),
      unitId: this.strOrNull(row.unit_id),
      unitName: this.strOrNull(row.unit_name),
      completedTasks: this.num(row.completed_tasks),
      actualQuantity: this.num(row.actual_quantity),
    }));
  }

  private async getLowAmmoFirePositions(unitScope: UnitScope) {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        fp.id AS fire_position_id,
        fp.name AS fire_position_name,
        fp.unit_id,
        COALESCE(u.name, 'Без підрозділу') AS unit_name,
        fp.ammo_depot_id AS depot_id,
        COALESCE(SUM(dss.quantity)::numeric, 0) AS shell_balance
      FROM fire_positions fp
      LEFT JOIN units u ON u.id = fp.unit_id
      LEFT JOIN depot_shell_stock dss ON dss.depot_id = fp.ammo_depot_id
      WHERE 1 = 1
        ${unitScope.clause}
      GROUP BY fp.id, fp.name, fp.unit_id, u.name, fp.ammo_depot_id
      HAVING COALESCE(SUM(dss.quantity)::numeric, 0) <= 50
      ORDER BY shell_balance ASC, fp.name ASC
      LIMIT 50
    `, unitScope.params);

    return rows.map((row) => ({
      firePositionId: String(row.fire_position_id),
      firePositionName: String(row.fire_position_name ?? 'Без ВП'),
      unitId: this.strOrNull(row.unit_id),
      unitName: this.strOrNull(row.unit_name),
      depotId: this.strOrNull(row.depot_id),
      shellBalance: this.num(row.shell_balance),
    }));
  }

  private async getRotationStatus(unitScope: UnitScope): Promise<AnalyticsV2RotationRow[]> {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        fp.id AS fire_position_id,
        fp.name AS fire_position_name,
        fp.unit_id,
        COALESCE(u.name, 'Без підрозділу') AS unit_name,
        fp.personnel_rotation_date,
        CASE
          WHEN fp.personnel_rotation_date IS NULL THEN NULL
          ELSE ((NOW() AT TIME ZONE '${KYIV_TIMEZONE}')::date - fp.personnel_rotation_date::date)::int
        END AS days_since_rotation
      FROM fire_positions fp
      LEFT JOIN units u ON u.id = fp.unit_id
      WHERE 1 = 1
        ${unitScope.clause}
      ORDER BY fp.personnel_rotation_date ASC NULLS FIRST, fp.name ASC
      LIMIT 50
    `, unitScope.params);

    return rows.map((row) => {
      const daysSince = row.days_since_rotation === null || row.days_since_rotation === undefined
        ? null
        : this.num(row.days_since_rotation);
      const daysLeft = daysSince === null ? null : 18 - daysSince;
      const level: AnalyticsV2RotationRow['level'] =
        daysSince === null ? 'unknown' : daysSince >= 18 ? 'overdue' : daysSince >= 14 ? 'soon' : 'ok';

      return {
        firePositionId: String(row.fire_position_id),
        firePositionName: String(row.fire_position_name ?? 'Без ВП'),
        unitId: this.strOrNull(row.unit_id),
        unitName: this.strOrNull(row.unit_name),
        personnelRotationDate: row.personnel_rotation_date ? String(row.personnel_rotation_date).slice(0, 10) : null,
        daysSinceRotation: daysSince,
        daysLeft,
        level,
      };
    }).filter((row) => row.level !== 'ok');
  }

  private async getAmmoForecast(period: { start: string; end: string }, unitScope: UnitScope): Promise<AnalyticsV2AmmoForecastRow[]> {
    const rows = await this.dataSource.query<RawRow[]>(`
      WITH spent AS (
        SELECT
          fp.id AS fire_position_id,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS spent
        FROM service_orders so
        JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          AND so.completed_at IS NOT NULL
          AND so.result_type IS NOT NULL
          AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
          AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
          ${unitScope.clause}
        GROUP BY fp.id
      ), balance AS (
        SELECT depot_id, COALESCE(SUM(quantity)::numeric, 0) AS shell_balance
        FROM depot_shell_stock
        GROUP BY depot_id
      )
      SELECT
        fp.id AS fire_position_id,
        fp.name AS fire_position_name,
        fp.unit_id,
        COALESCE(u.name, 'Без підрозділу') AS unit_name,
        fp.ammo_depot_id AS depot_id,
        COALESCE(b.shell_balance, 0) AS shell_balance,
        COALESCE(s.spent, 0) AS spent
      FROM fire_positions fp
      LEFT JOIN units u ON u.id = fp.unit_id
      LEFT JOIN balance b ON b.depot_id = fp.ammo_depot_id
      LEFT JOIN spent s ON s.fire_position_id = fp.id
      WHERE 1 = 1
        ${unitScope.clause.replaceAll('COALESCE(fp.unit_id, so.assigned_unit_id)', 'fp.unit_id')}
      ORDER BY shell_balance ASC, fp.name ASC
      LIMIT 50
    `, [period.start, period.end, ...unitScope.params]);

    const days = Math.max(1, Math.round((new Date(period.end).getTime() - new Date(period.start).getTime()) / 86400000));

    return rows.map((row) => {
      const shellBalance = this.num(row.shell_balance);
      const averageDailyConsumption = Number((this.num(row.spent) / days).toFixed(2));
      const estimatedDaysLeft = averageDailyConsumption > 0
        ? Number((shellBalance / averageDailyConsumption).toFixed(1))
        : null;
      const level: AnalyticsV2AmmoForecastRow['level'] =
        estimatedDaysLeft === null ? 'unknown' : estimatedDaysLeft <= 2 ? 'critical' : estimatedDaysLeft <= 5 ? 'warning' : 'ok';

      return {
        firePositionId: String(row.fire_position_id),
        firePositionName: String(row.fire_position_name ?? 'Без ВП'),
        unitId: this.strOrNull(row.unit_id),
        unitName: this.strOrNull(row.unit_name),
        depotId: this.strOrNull(row.depot_id),
        shellBalance,
        averageDailyConsumption,
        estimatedDaysLeft,
        level,
      };
    }).filter((row) => row.level !== 'ok' || row.shellBalance <= 50);
  }

  private async getThreatBlockedFirePositions(unitScope: UnitScope) {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COALESCE(NULLIF(TRIM(fp.not_ready_reason), ''), COALESCE(NULLIF(TRIM(fp.air_situation_status), ''), 'Повітряна загроза')) AS reason,
        COUNT(*)::int AS total
      FROM fire_positions fp
      WHERE (
          LOWER(COALESCE(fp.not_ready_reason, '')) LIKE '%загроз%'
          OR LOWER(COALESCE(fp.not_ready_reason, '')) LIKE '%повітр%'
          OR LOWER(COALESCE(fp.air_situation_status, '')) NOT IN ('', 'unknown', 'clear', 'normal', 'немає', 'відсутня')
        )
        ${unitScope.clause}
      GROUP BY COALESCE(NULLIF(TRIM(fp.not_ready_reason), ''), COALESCE(NULLIF(TRIM(fp.air_situation_status), ''), 'Повітряна загроза'))
      ORDER BY total DESC, reason ASC
    `, unitScope.params);

    return rows.map((row) => ({
      reason: String(row.reason),
      total: this.num(row.total),
    }));
  }

  private async getWeaponEfficiency(period: { start: string; end: string }, unitScope: UnitScope) {
    const rows = await this.dataSource.query<RawRow[]>(`
      WITH coefficients AS (
        SELECT * FROM (VALUES
          ('destroyed', 1.2::numeric),
          ('hit', 1.0::numeric),
          ('area_denial', 0.8::numeric),
          ('suppression', 0.7::numeric),
          ('mining', 0.6::numeric),
          ('fire', 0.6::numeric),
          ('smoke', 0.5::numeric),
          ('illumination', 0.4::numeric)
        ) AS c(result_type, coefficient)
      )
      SELECT
        ws.id AS weapon_system_id,
        COALESCE(ws.callsign, ws.serial_number, wm.name, 'СГ без позивного') AS weapon_name,
        fp.id AS fire_position_id,
        fp.name AS fire_position_name,
        COALESCE(fp.unit_id, so.assigned_unit_id) AS unit_id,
        COALESCE(u.name, 'Без підрозділу') AS unit_name,
        COUNT(so.id)::int AS completed_tasks,
        COUNT(so.id)::numeric AS possible_score,
        COALESCE(SUM(COALESCE(c.coefficient, 0)), 0)::numeric AS actual_score
      FROM service_orders so
      LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
      LEFT JOIN weapon_systems ws ON ws.fire_position_id = fp.id AND ws.location_type = 'fire_position'
      LEFT JOIN weapon_models wm ON wm.id = ws.weapon_model_id
      LEFT JOIN units u ON u.id = COALESCE(fp.unit_id, so.assigned_unit_id)
      LEFT JOIN coefficients c ON c.result_type = so.result_type
      WHERE so.status = 'completed'
        AND so.completed_at IS NOT NULL
        AND so.result_type IS NOT NULL
        AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
        AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
        ${unitScope.clause}
      GROUP BY ws.id, ws.callsign, ws.serial_number, wm.name, fp.id, fp.name, COALESCE(fp.unit_id, so.assigned_unit_id), u.name
      HAVING COUNT(so.id) > 0
      ORDER BY (COALESCE(SUM(COALESCE(c.coefficient, 0)), 0) / NULLIF(COUNT(so.id), 0)) DESC, completed_tasks DESC
      LIMIT 50
    `, [period.start, period.end, ...unitScope.params]);

    return rows.map((row) => {
      const possibleScore = this.num(row.possible_score);
      const actualScore = Number(this.num(row.actual_score).toFixed(2));

      return {
        weaponSystemId: this.strOrNull(row.weapon_system_id),
        weaponName: String(row.weapon_name ?? 'СГ без позивного'),
        firePositionId: this.strOrNull(row.fire_position_id),
        firePositionName: this.strOrNull(row.fire_position_name),
        unitId: this.strOrNull(row.unit_id),
        unitName: this.strOrNull(row.unit_name),
        completedTasks: this.num(row.completed_tasks),
        possibleScore,
        actualScore,
        efficiencyPercent: possibleScore > 0 ? Number(((actualScore / possibleScore) * 100).toFixed(1)) : 0,
      };
    });
  }

  private buildOperationalAttention(
    lowAmmo: Array<{ firePositionName: string; shellBalance: number; firePositionId?: string | null }>,
    rotation: AnalyticsV2RotationRow[],
    forecast: AnalyticsV2AmmoForecastRow[],
    readiness: { firePositions: { notReady: number; notReadyReasons: Array<{ reason: string; total: number }> } },
  ): AnalyticsV2AttentionItem[] {
    const items: AnalyticsV2AttentionItem[] = [];

    for (const row of forecast.filter((item) => item.level === 'critical').slice(0, 8)) {
      items.push({
        level: 'critical',
        title: `${row.firePositionName}: БК орієнтовно на ${row.estimatedDaysLeft} діб`,
        details: `Залишок снарядів: ${row.shellBalance}. Середня витрата: ${row.averageDailyConsumption}/добу.`,
        entityId: row.firePositionId,
      });
    }

    for (const row of lowAmmo.slice(0, 8)) {
      items.push({
        level: row.shellBalance <= 20 ? 'critical' : 'warning',
        title: `${row.firePositionName}: потрібен підвіз`,
        details: `Залишок снарядів на ВП: ${row.shellBalance}.`,
        entityId: row.firePositionId,
      });
    }

    for (const row of rotation.filter((item) => item.level === 'overdue').slice(0, 8)) {
      items.push({
        level: 'warning',
        title: `${row.firePositionName}: ротація прострочена`,
        details: row.daysSinceRotation === null
          ? 'Дата останньої ротації не вказана.'
          : `Минуло ${row.daysSinceRotation} діб. Норма — не рідше разу на 18 діб.`,
        entityId: row.firePositionId,
      });
    }

    if (readiness.firePositions.notReady > 0) {
      items.push({
        level: 'warning',
        title: `Не БГ ВП: ${readiness.firePositions.notReady}`,
        details: readiness.firePositions.notReadyReasons
          .slice(0, 3)
          .map((row) => `${row.reason}: ${row.total}`)
          .join(' · '),
      });
    }

    return items.slice(0, 20);
  }


  async getDashboard(user: AuthUser): Promise<AnalyticsDashboard> {
    const weaponScope = await this.getUnitScope(user, 1, 'unit_id');
    const firePositionScope = await this.getUnitScope(user, 1, 'unit_id');
    const depotScope = await this.getUnitScope(user, 1, 'd.unit_id');
    const serviceOrderScope = await this.getUnitScope(user, 1, 'assigned_unit_id');
    const fireMissionScope = await this.getUnitScope(user, 1, 'executing_unit_id');
    const [
      weapons,
      firePositions,
      ammo,
      depotStocks,
      serviceStatuses,
      serviceOrderTotals,
      fireMissionStatuses,
      fireMissionTotals,
      loadByUnit,
      loadByFirePosition,
    ] = await Promise.all([
      this.getWeaponReadiness(weaponScope),
      this.getFirePositionReadiness(firePositionScope),
      this.getAmmoSummary(depotScope),
      this.getDepotStocks(depotScope),
      this.getStatusCounts('service_orders', serviceOrderScope),
      this.getServiceOrderTotals(serviceOrderScope),
      this.getStatusCounts('fire_missions', fireMissionScope),
      this.getFireMissionTotals(fireMissionScope),
      this.getLoadByUnit(serviceOrderScope),
      this.getLoadByFirePosition(serviceOrderScope),
    ]);

    const serviceOrderCompletionRate = this.percent(serviceOrderTotals.completed, serviceOrderTotals.total);
    const weaponReadinessRate = this.percent(weapons.ready ?? 0, weapons.total);
    const firePositionReadinessRate = this.percent(firePositions.ready ?? 0, firePositions.total);
    const ammoTotalUnits = ammo.shells + ammo.charges + ammo.fuzes + ammo.primers;

    return {
      timezone: KYIV_TIMEZONE,
      generatedAt: new Date().toISOString(),
      generatedAtKyiv: this.formatKyiv(new Date()),
      weapons,
      firePositions,
      ammo,
      serviceOrders: {
        ...serviceOrderTotals,
        statuses: serviceStatuses,
      },
      fireMissions: {
        ...fireMissionTotals,
        statuses: fireMissionStatuses,
      },
      load: {
        byUnit: loadByUnit,
        byFirePosition: loadByFirePosition,
      },
      kpi: {
        serviceOrderCompletionRate,
        weaponReadinessRate,
        firePositionReadinessRate,
        ammoTotalUnits,
      },
      warnings: this.buildWarnings(weapons, firePositions, ammo, serviceOrderTotals.active),
      depotStocks,
    };
  }



  async getLogisticsFlow(daysRaw?: string, user?: AuthUser): Promise<LogisticsFlowRow[]> {
    const days = this.parseDays(daysRaw, [7, 10, 20, 30], 7);
    const period = this.getKyivPeriod(days);
    const unitScope = user
      ? await this.getUnitScope(user, 3, 'fp.unit_id')
      : { clause: '', params: [] };

    const rows = await this.dataSource.query<RawRow[]>(`
      WITH fp_depots AS (
        SELECT fp.id AS fire_position_id, fp.name AS fire_position_name, fp.ammo_depot_id AS depot_id, d.name AS depot_name
        FROM fire_positions fp
        LEFT JOIN depots d ON d.id = fp.ammo_depot_id
        WHERE fp.ammo_depot_id IS NOT NULL
          ${unitScope.clause}
      ), inbound AS (
        SELECT to_depot_id AS depot_id, COALESCE(SUM(quantity)::numeric, 0) AS received
        FROM stock_movements
        WHERE to_depot_id IS NOT NULL
          AND (movement_datetime AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
          AND (movement_datetime AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
          AND movement_type IN ('transfer', 'external_supply', 'supply', 'return')
        GROUP BY to_depot_id
      ), spent AS (
        SELECT fp.ammo_depot_id AS depot_id, COALESCE(SUM(so.actual_quantity)::numeric, 0) AS spent
        FROM service_orders so
        JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          AND so.completed_at IS NOT NULL
          AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
          AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
          ${unitScope.clause}
        GROUP BY fp.ammo_depot_id
      ), balance AS (
        SELECT depot_id, SUM(quantity)::numeric AS balance
        FROM (
          SELECT depot_id, quantity FROM depot_shell_stock
          UNION ALL SELECT depot_id, quantity FROM depot_charge_stock
          UNION ALL SELECT depot_id, quantity FROM depot_fuze_stock
          UNION ALL SELECT depot_id, quantity FROM depot_primer_stock
        ) x
        GROUP BY depot_id
      )
      SELECT
        f.fire_position_id,
        f.fire_position_name,
        f.depot_id,
        COALESCE(f.depot_name, '\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u0438\u0439 \u0411\u041a') AS depot_name,
        COALESCE(i.received, 0) AS received,
        COALESCE(s.spent, 0) AS spent,
        COALESCE(b.balance, 0) AS balance
      FROM fp_depots f
      LEFT JOIN inbound i ON i.depot_id = f.depot_id
      LEFT JOIN spent s ON s.depot_id = f.depot_id
      LEFT JOIN balance b ON b.depot_id = f.depot_id
      ORDER BY spent DESC, received DESC, f.fire_position_name ASC
    `, [period.start, period.end, ...unitScope.params]);

    return rows.map((row) => {
      const spent = this.num(row.spent);
      const balance = this.num(row.balance);
      const dailySpent = spent > 0 ? spent / days : 0;

      return {
        firePositionId: row.fire_position_id ? String(row.fire_position_id) : null,
        firePositionName: String(row.fire_position_name ?? '\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438'),
        depotId: row.depot_id ? String(row.depot_id) : null,
        depotName: String(row.depot_name ?? '\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u0438\u0439 \u0411\u041a'),
        received: this.num(row.received),
        spent,
        balance,
        estimatedDaysLeft: dailySpent > 0 ? Number((balance / dailySpent).toFixed(1)) : null,
      };
    });
  }


  async getAmmoRecipients(daysRaw?: string, user?: AuthUser): Promise<AmmoRecipientAnalyticsRow[]> {
    const days = this.parseDays(daysRaw, [7, 10, 20, 30], 10);
    const period = this.getKyivPeriod(days);
    const unitScope = user
      ? await this.getUnitScope(user, 3, 'COALESCE(fp.unit_id, d.unit_id)')
      : { clause: '', params: [] };

    const rows = await this.dataSource.query<RawRow[]>(`
      WITH incoming AS (
        SELECT
          sm.to_depot_id AS depot_id,
          COUNT(DISTINCT COALESCE(sm.movement_group_id::text, sm.document_number, sm.id::text))::int AS deliveries,
          COALESCE(SUM(sm.quantity)::numeric, 0) AS total_quantity,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'shell')::numeric, 0) AS shells,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'charge')::numeric, 0) AS charges,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'fuze')::numeric, 0) AS fuzes,
          COALESCE(SUM(sm.quantity) FILTER (WHERE sm.item_type = 'primer')::numeric, 0) AS primers,
          MAX(sm.movement_datetime) AS last_delivery_at
        FROM stock_movements sm
        WHERE sm.to_depot_id IS NOT NULL
          AND (sm.movement_datetime AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
          AND (sm.movement_datetime AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
          AND sm.movement_type IN ('transfer', 'external_supply', 'supply')
        GROUP BY sm.to_depot_id
      ), fp AS (
        SELECT DISTINCT ON (ammo_depot_id)
          ammo_depot_id,
          id AS fire_position_id,
          name AS fire_position_name,
          unit_id
        FROM fire_positions
        WHERE ammo_depot_id IS NOT NULL
        ORDER BY ammo_depot_id, updated_at DESC
      )
      SELECT
        d.id AS depot_id,
        COALESCE(d.name, '\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438') AS depot_name,
        fp.fire_position_id,
        fp.fire_position_name,
        COALESCE(fp.unit_id, d.unit_id) AS unit_id,
        COALESCE(u.name, '\u0411\u0435\u0437 \u043f\u0456\u0434\u0440\u043e\u0437\u0434\u0456\u043b\u0443') AS unit_name,
        i.deliveries,
        i.total_quantity,
        i.shells,
        i.charges,
        i.fuzes,
        i.primers,
        i.last_delivery_at
      FROM incoming i
      JOIN depots d ON d.id = i.depot_id
      LEFT JOIN fp ON fp.ammo_depot_id = d.id
      LEFT JOIN units u ON u.id = COALESCE(fp.unit_id, d.unit_id)
      WHERE 1 = 1
        ${unitScope.clause}
      ORDER BY i.total_quantity DESC, i.deliveries DESC, depot_name ASC
      LIMIT 50
    `, [period.start, period.end, ...unitScope.params]);

    return rows.map((row) => ({
      depotId: this.strOrNull(row.depot_id),
      depotName: String(row.depot_name ?? '\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438'),
      firePositionId: this.strOrNull(row.fire_position_id),
      firePositionName: this.strOrNull(row.fire_position_name),
      unitId: this.strOrNull(row.unit_id),
      unitName: this.strOrNull(row.unit_name),
      deliveries: this.num(row.deliveries),
      totalQuantity: this.num(row.total_quantity),
      shells: this.num(row.shells),
      charges: this.num(row.charges),
      fuzes: this.num(row.fuzes),
      primers: this.num(row.primers),
      lastDeliveryAt: row.last_delivery_at ? new Date(String(row.last_delivery_at)).toISOString() : null,
    }));
  }

  async getShootingAnalytics(daysRaw?: string, user?: AuthUser): Promise<ShootingAnalytics> {
    const days = this.parseDays(daysRaw, [7, 10, 20, 30], 7);
    const period = this.getKyivPeriod(days);
    const unitScope = user
      ? await this.getUnitScope(user, 3, 'COALESCE(fp.unit_id, so.assigned_unit_id)')
      : { clause: '', params: [] };
    const params = [period.start, period.end, ...unitScope.params];
    const periodPredicate = `
          AND so.completed_at IS NOT NULL
          AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date >= $1::date
          AND (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date < $2::date
    `;

    const totalsRows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COUNT(*)::int AS total_missions,
        COALESCE(SUM(so.actual_quantity)::numeric, 0) AS total_actual_quantity,
        COALESCE(AVG(so.actual_quantity)::numeric, 0) AS average_actual_quantity
      FROM service_orders so
      LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
      WHERE so.status = 'completed'
        ${periodPredicate}
        ${unitScope.clause}
    `, params);

    const dailyRows = await this.dataSource.query<RawRow[]>(`
      WITH days AS (
        SELECT generate_series($1::date, ($2::date - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
      ), completed AS (
        SELECT
          (so.completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date AS day,
          COUNT(*)::int AS missions,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
        FROM service_orders so
        LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          ${periodPredicate}
          ${unitScope.clause}
        GROUP BY day
      )
      SELECT
        days.day::text AS day,
        COALESCE(completed.missions, 0)::int AS missions,
        COALESCE(completed.actual_quantity, 0)::numeric AS actual_quantity
      FROM days
      LEFT JOIN completed ON completed.day = days.day
      ORDER BY days.day ASC
    `, params);

    const byUnit = await this.getShootingBreakdown(
      `
        SELECT
          u.id AS id,
          COALESCE(u.name, '\u0411\u0435\u0437 \u043f\u0456\u0434\u0440\u043e\u0437\u0434\u0456\u043b\u0443') AS name,
          COUNT(*)::int AS missions,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
        FROM service_orders so
        LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        LEFT JOIN units u ON u.id = COALESCE(fp.unit_id, so.assigned_unit_id)
        WHERE so.status = 'completed'
          ${periodPredicate}
          ${unitScope.clause}
        GROUP BY u.id, u.name
        ORDER BY actual_quantity DESC, missions DESC, name ASC
        LIMIT 20
      `,
      params,
    );

    const byFirePosition = await this.getShootingBreakdown(
      `
        SELECT
          fp.id AS id,
          COALESCE(fp.name, '\u0411\u0435\u0437 \u0412\u041f') AS name,
          COUNT(*)::int AS missions,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
        FROM service_orders so
        LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          ${periodPredicate}
          ${unitScope.clause}
        GROUP BY fp.id, fp.name
        ORDER BY actual_quantity DESC, missions DESC, name ASC
        LIMIT 20
      `,
      params,
    );

    const byResultType = await this.getShootingBreakdown(
      `
        SELECT
          so.result_type AS id,
          COALESCE(so.result_type, '\u0411\u0435\u0437 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0443') AS name,
          COUNT(*)::int AS missions,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
        FROM service_orders so
        LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          ${periodPredicate}
          ${unitScope.clause}
        GROUP BY so.result_type
        ORDER BY actual_quantity DESC, missions DESC, name ASC
      `,
      params,
    );

    const byTaskType = await this.getShootingBreakdown(
      `
        SELECT
          so.task_type AS id,
          COALESCE(so.task_type, '\u0411\u0435\u0437 \u0442\u0438\u043f\u0443') AS name,
          COUNT(*)::int AS missions,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
        FROM service_orders so
        LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          ${periodPredicate}
          ${unitScope.clause}
        GROUP BY so.task_type
        ORDER BY actual_quantity DESC, missions DESC, name ASC
      `,
      params,
    );

    const byShell = await this.getShootingBreakdown(
      `
        SELECT
          sh.id AS id,
          COALESCE(sh.marking, '\u0411\u0435\u0437 \u0441\u043d\u0430\u0440\u044f\u0434\u0430') AS name,
          COUNT(*)::int AS missions,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
        FROM service_orders so
        LEFT JOIN shells sh ON sh.id = so.selected_shell_id
        LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          ${periodPredicate}
          ${unitScope.clause}
        GROUP BY sh.id, sh.marking
        ORDER BY actual_quantity DESC, missions DESC, name ASC
        LIMIT 20
      `,
      params,
    );

    const byCharge = await this.getShootingBreakdown(
      `
        SELECT
          ch.id AS id,
          COALESCE(ch.marking, '\u0411\u0435\u0437 \u0437\u0430\u0440\u044f\u0434\u0443') AS name,
          COUNT(*)::int AS missions,
          COALESCE(SUM(so.actual_quantity)::numeric, 0) AS actual_quantity
        FROM service_orders so
        LEFT JOIN charges ch ON ch.id = so.selected_charge_id
        LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
        WHERE so.status = 'completed'
          ${periodPredicate}
          ${unitScope.clause}
        GROUP BY ch.id, ch.marking
        ORDER BY actual_quantity DESC, missions DESC, name ASC
        LIMIT 20
      `,
      params,
    );

    const totals = totalsRows[0] ?? {};

    return {
      days,
      totalMissions: this.num(totals.total_missions),
      totalActualQuantity: this.num(totals.total_actual_quantity),
      averageActualQuantity: Number(this.num(totals.average_actual_quantity).toFixed(1)),
      daily: dailyRows.map((row): ShootingDailyRow => ({
        day: String(row.day),
        missions: this.num(row.missions),
        actualQuantity: this.num(row.actual_quantity),
      })),
      byUnit,
      byFirePosition,
      byResultType: byResultType.map((row) => ({
        ...row,
        name: this.getResultTypeLabel(row.id),
      })),
      byTaskType: byTaskType.map((row) => ({
        ...row,
        name: this.getTaskTypeLabel(row.id),
      })),
      byShell,
      byCharge,
    };
  }


  private async getWeaponReadiness(unitScope: UnitScope): Promise<AnalyticsCounter> {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE readiness_status IN ('ready', 'combat_ready', '\u0431\u043e\u0454\u0433\u043e\u0442\u043e\u0432', 'ready_for_combat'))::int AS ready,
        COUNT(*) FILTER (WHERE readiness_status IN ('not_ready', 'unready', '\u043d\u0435\u0433\u043e\u0442\u043e\u0432'))::int AS not_ready,
        COUNT(*) FILTER (WHERE readiness_status IS NULL OR readiness_status = 'unknown')::int AS unknown
      FROM weapon_systems
      WHERE 1 = 1
        ${unitScope.clause}
    `, unitScope.params);

    return this.counter(rows[0]);
  }

  private async getFirePositionReadiness(unitScope: UnitScope): Promise<AnalyticsCounter & { withSg: number; withoutSg: number }> {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE readiness_status IN ('ready', 'combat_ready', '\u0431\u043e\u0454\u0433\u043e\u0442\u043e\u0432', 'ready_for_combat'))::int AS ready,
        COUNT(*) FILTER (WHERE readiness_status IN ('not_ready', 'unready', '\u043d\u0435\u0433\u043e\u0442\u043e\u0432'))::int AS not_ready,
        COUNT(*) FILTER (WHERE readiness_status IS NULL OR readiness_status = 'unknown')::int AS unknown,
        COUNT(*) FILTER (WHERE has_sg = true)::int AS with_sg,
        COUNT(*) FILTER (WHERE has_sg = false OR has_sg IS NULL)::int AS without_sg
      FROM fire_positions
      WHERE 1 = 1
        ${unitScope.clause}
    `, unitScope.params);

    const row = rows[0] ?? {};
    return {
      ...this.counter(row),
      withSg: this.num(row.with_sg),
      withoutSg: this.num(row.without_sg),
    };
  }

  private async getAmmoSummary(unitScope: UnitScope): Promise<AmmoStockSummary> {
    const rows = await this.dataSource.query<RawRow[]>(`
      WITH scoped_depots AS (
        SELECT d.id
        FROM depots d
        WHERE d.is_archived = false
          ${unitScope.clause}
      )
      SELECT
        COALESCE((SELECT SUM(quantity)::numeric FROM depot_shell_stock WHERE depot_id IN (SELECT id FROM scoped_depots)), 0) AS shells,
        COALESCE((SELECT SUM(quantity)::numeric FROM depot_charge_stock WHERE depot_id IN (SELECT id FROM scoped_depots)), 0) AS charges,
        COALESCE((SELECT SUM(quantity)::numeric FROM depot_fuze_stock WHERE depot_id IN (SELECT id FROM scoped_depots)), 0) AS fuzes,
        COALESCE((SELECT SUM(quantity)::numeric FROM depot_primer_stock WHERE depot_id IN (SELECT id FROM scoped_depots)), 0) AS primers
    `, unitScope.params);

    const row = rows[0] ?? {};
    return {
      shells: this.num(row.shells),
      charges: this.num(row.charges),
      fuzes: this.num(row.fuzes),
      primers: this.num(row.primers),
    };
  }

  private async getDepotStocks(unitScope: UnitScope): Promise<DepotStockSummary[]> {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        d.id AS depot_id,
        d.name AS depot_name,
        d.depot_type AS depot_type,
        COALESCE(s.shells, 0) AS shells,
        COALESCE(c.charges, 0) AS charges,
        COALESCE(f.fuzes, 0) AS fuzes,
        COALESCE(p.primers, 0) AS primers
      FROM depots d
      LEFT JOIN (
        SELECT depot_id, SUM(quantity)::numeric AS shells
        FROM depot_shell_stock
        GROUP BY depot_id
      ) s ON s.depot_id = d.id
      LEFT JOIN (
        SELECT depot_id, SUM(quantity)::numeric AS charges
        FROM depot_charge_stock
        GROUP BY depot_id
      ) c ON c.depot_id = d.id
      LEFT JOIN (
        SELECT depot_id, SUM(quantity)::numeric AS fuzes
        FROM depot_fuze_stock
        GROUP BY depot_id
      ) f ON f.depot_id = d.id
      LEFT JOIN (
        SELECT depot_id, SUM(quantity)::numeric AS primers
        FROM depot_primer_stock
        GROUP BY depot_id
      ) p ON p.depot_id = d.id
      WHERE d.is_archived = false
        ${unitScope.clause}
      ORDER BY d.name ASC
    `, unitScope.params);

    return rows.map((row) => {
      const shells = this.num(row.shells);
      const charges = this.num(row.charges);
      const fuzes = this.num(row.fuzes);
      const primers = this.num(row.primers);

      return {
        depotId: String(row.depot_id),
        depotName: String(row.depot_name ?? '\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438'),
        depotType: row.depot_type === null || row.depot_type === undefined ? null : String(row.depot_type),
        shells,
        charges,
        fuzes,
        primers,
        total: shells + charges + fuzes + primers,
      };
    });
  }

  private async getStatusCounts(
    tableName: 'service_orders' | 'fire_missions',
    unitScope: UnitScope,
  ): Promise<StatusCount[]> {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT COALESCE(status, 'unknown') AS status, COUNT(*)::int AS total
      FROM ${tableName}
      WHERE 1 = 1
        ${unitScope.clause}
      GROUP BY COALESCE(status, 'unknown')
      ORDER BY total DESC, status ASC
    `, unitScope.params);

    return rows.map((row) => ({
      status: String(row.status),
      total: this.num(row.total),
    }));
  }

  private async getServiceOrderTotals(unitScope: UnitScope) {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('draft', 'proposed', 'sent', 'accepted', 'in_progress'))::int AS active,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (
          WHERE status = 'completed'
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date = (NOW() AT TIME ZONE '${KYIV_TIMEZONE}')::date
        )::int AS completed_today,
        COUNT(*) FILTER (
          WHERE status = 'completed'
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE '${KYIV_TIMEZONE}') >= (NOW() AT TIME ZONE '${KYIV_TIMEZONE}') - INTERVAL '7 days'
        )::int AS completed_last_7_days,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600)
          FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL AND created_at IS NOT NULL) AS average_completion_hours
      FROM service_orders
      WHERE 1 = 1
        ${unitScope.clause}
    `, unitScope.params);

    const row = rows[0] ?? {};
    return {
      total: this.num(row.total),
      active: this.num(row.active),
      completed: this.num(row.completed),
      cancelled: this.num(row.cancelled),
      rejected: this.num(row.rejected),
      completedToday: this.num(row.completed_today),
      completedLast7Days: this.num(row.completed_last_7_days),
      averageCompletionHours: row.average_completion_hours === null || row.average_completion_hours === undefined
        ? null
        : Number(Number(row.average_completion_hours).toFixed(2)),
    };
  }

  private async getFireMissionTotals(unitScope: UnitScope) {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('completed', 'done'))::int AS completed,
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'done', 'cancelled', 'rejected'))::int AS active,
        COUNT(*) FILTER (
          WHERE mission_datetime IS NOT NULL
          AND (mission_datetime AT TIME ZONE '${KYIV_TIMEZONE}')::date = (NOW() AT TIME ZONE '${KYIV_TIMEZONE}')::date
        )::int AS planned_today,
        COUNT(*) FILTER (
          WHERE status IN ('completed', 'done')
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE '${KYIV_TIMEZONE}')::date = (NOW() AT TIME ZONE '${KYIV_TIMEZONE}')::date
        )::int AS completed_today
      FROM fire_missions
      WHERE 1 = 1
        ${unitScope.clause}
    `, unitScope.params);

    const row = rows[0] ?? {};
    return {
      total: this.num(row.total),
      completed: this.num(row.completed),
      active: this.num(row.active),
      plannedToday: this.num(row.planned_today),
      completedToday: this.num(row.completed_today),
    };
  }

  private async getLoadByUnit(unitScope: UnitScope): Promise<NamedCount[]> {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        u.id,
        COALESCE(u.name, '\u0411\u0435\u0437 \u043f\u0456\u0434\u0440\u043e\u0437\u0434\u0456\u043b\u0443') AS name,
        COUNT(so.id)::int AS total
      FROM service_orders so
      LEFT JOIN units u ON u.id = so.assigned_unit_id
      WHERE so.status IN ('draft', 'proposed', 'sent', 'accepted', 'in_progress')
        ${unitScope.clause.replaceAll('assigned_unit_id', 'so.assigned_unit_id')}
      GROUP BY u.id, u.name
      ORDER BY total DESC, name ASC
      LIMIT 20
    `, unitScope.params);

    return rows.map((row) => ({
      id: row.id === null || row.id === undefined ? null : String(row.id),
      name: String(row.name ?? '\u0411\u0435\u0437 \u043f\u0456\u0434\u0440\u043e\u0437\u0434\u0456\u043b\u0443'),
      total: this.num(row.total),
    }));
  }

  private async getLoadByFirePosition(unitScope: UnitScope): Promise<NamedCount[]> {
    const rows = await this.dataSource.query<RawRow[]>(`
      SELECT
        fp.id,
        COALESCE(fp.name, '\u0411\u0435\u0437 \u0412\u041f') AS name,
        COUNT(so.id)::int AS total
      FROM service_orders so
      LEFT JOIN fire_positions fp ON fp.id = so.selected_fire_position_id
      WHERE so.status IN ('accepted', 'in_progress', 'sent')
        ${unitScope.clause.replaceAll('assigned_unit_id', 'so.assigned_unit_id')}
      GROUP BY fp.id, fp.name
      ORDER BY total DESC, name ASC
      LIMIT 20
    `, unitScope.params);

    return rows.map((row) => ({
      id: row.id === null || row.id === undefined ? null : String(row.id),
      name: String(row.name ?? '\u0411\u0435\u0437 \u0412\u041f'),
      total: this.num(row.total),
    }));
  }

  private buildWarnings(
    weapons: AnalyticsCounter,
    firePositions: AnalyticsCounter & { withSg: number; withoutSg: number },
    ammo: AmmoStockSummary,
    activeServiceOrders: number,
  ): string[] {
    const warnings: string[] = [];

    if (weapons.total > 0 && (weapons.ready ?? 0) === 0) {
      warnings.push('\u041d\u0435\u043c\u0430\u0454 \u0436\u043e\u0434\u043d\u043e\u0457 \u0433\u043e\u0442\u043e\u0432\u043e\u0457 \u0421\u0413. \u041f\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \u0441\u0442\u0430\u043d \u043e\u0437\u0431\u0440\u043e\u0454\u043d\u043d\u044f.');
    }

    if (firePositions.total > 0 && firePositions.withoutSg > 0) {
      warnings.push(`\u0412\u041f \u0431\u0435\u0437 \u0421\u0413: ${firePositions.withoutSg}. \u041f\u0435\u0440\u0435\u0432\u0456\u0440\u0438\u0442\u0438 \u0440\u043e\u0437\u043f\u043e\u0434\u0456\u043b \u0421\u0413.`);
    }

    if (ammo.shells <= 0) {
      warnings.push('\u0421\u043d\u0430\u0440\u044f\u0434\u0438 \u0432\u0456\u0434\u0441\u0443\u0442\u043d\u0456 \u043d\u0430 \u0441\u043a\u043b\u0430\u0434\u0430\u0445 \u0430\u0431\u043e \u0437\u0430\u043b\u0438\u0448\u043a\u0438 \u043d\u0435 \u0432\u043d\u0435\u0441\u0435\u043d\u0456.');
    }

    if (activeServiceOrders > 0 && firePositions.withSg === 0) {
      warnings.push('\u0404 \u0430\u043a\u0442\u0438\u0432\u043d\u0456 \u0437\u0430\u044f\u0432\u043a\u0438, \u0430\u043b\u0435 \u043d\u0435\u043c\u0430\u0454 \u0412\u041f \u0437 \u043f\u0440\u0438\u0437\u043d\u0430\u0447\u0435\u043d\u043e\u044e \u0421\u0413.');
    }

    return warnings;
  }

  private getResultTypeLabel(type: string | null): string {
    if (type === 'mining') return '\u041c\u0456\u043d\u0443\u0432\u0430\u043d\u043d\u044f';
    if (type === 'area_denial') return '\u0417\u0430\u043a\u0440\u0438\u0442\u0442\u044f \u0437\u043e\u043d\u0438';
    if (type === 'hit') return '\u0423\u0440\u0430\u0436\u0435\u043d\u043d\u044f';
    if (type === 'destroyed') return '\u0417\u043d\u0438\u0449\u0435\u043d\u043e';
    if (type === 'suppression') return '\u041f\u0440\u0438\u0434\u0443\u0448\u0435\u043d\u043d\u044f';
    if (type === 'smoke') return '\u0414\u0438\u043c\u043e\u0432\u0430 \u0437\u0430\u0432\u0456\u0441\u0430';
    if (type === 'fire') return '\u041f\u043e\u0436\u0435\u0436\u0430';
    if (type === 'illumination') return '\u041e\u0441\u0432\u0456\u0442\u043b\u0435\u043d\u043d\u044f';
    return '\u0411\u0435\u0437 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0443';
  }

  private getTaskTypeLabel(type: string | null): string {
    if (type === 'service') return '\u0411\u043e\u0439\u043e\u0432\u0435 \u043e\u0431\u0441\u043b\u0443\u0433\u043e\u0432\u0443\u0432\u0430\u043d\u043d\u044f';
    if (type === 'training') return '\u0422\u0440\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f';
    if (type === 'smoke') return '\u0414\u0438\u043c\u043e\u0432\u0430 \u0437\u0430\u0432\u0456\u0441\u0430';
    if (type === 'illumination') return '\u041e\u0441\u0432\u0456\u0442\u043b\u0435\u043d\u043d\u044f';
    if (type === 'other') return '\u0406\u043d\u0448\u0435';
    return '\u0411\u0435\u0437 \u0442\u0438\u043f\u0443';
  }

  private counter(row: RawRow | undefined): AnalyticsCounter {
    return {
      total: this.num(row?.total),
      ready: this.num(row?.ready),
      notReady: this.num(row?.not_ready),
      unknown: this.num(row?.unknown),
    };
  }

  private percent(value: number, total: number): number {
    if (!total) {
      return 0;
    }

    return Number(((value / total) * 100).toFixed(1));
  }

  private num(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private getKyivPeriod(days: number): { start: string; end: string } {
    // The analytics period is a calendar window in Europe/Kyiv.
    // We pass YYYY-MM-DD boundaries to SQL and cast them there.
    // This avoids the old UTC-midnight drift around 00:00-03:00 Kyiv time.
    const today = this.getKyivDateParts(new Date());
    const endUtc = Date.UTC(today.year, today.month - 1, today.day + 1);
    const startUtc = endUtc - days * 24 * 60 * 60 * 1000;

    return {
      start: this.toSqlDate(new Date(startUtc)),
      end: this.toSqlDate(new Date(endUtc)),
    };
  }

  private getKyivDateParts(date: Date): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: KYIV_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);

    return {
      year: value('year'),
      month: value('month'),
      day: value('day'),
    };
  }

  private toSqlDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private parseDays(raw: string | undefined, allowed: number[], fallback: number): number {
    const value = Number(raw ?? fallback);
    return allowed.includes(value) ? value : fallback;
  }

  private strOrNull(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    return String(value);
  }

  private async getUnitScope(
    user: AuthUser,
    paramIndex: number,
    expression: string,
  ): Promise<UnitScope> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds === null) {
      return { clause: '', params: [] };
    }

    if (allowedUnitIds.length === 0) {
      return { clause: 'AND 1 = 0', params: [] };
    }

    return {
      clause: `AND ${expression} = ANY($${paramIndex}::uuid[])`,
      params: [allowedUnitIds],
    };
  }

  private async getShootingBreakdown(
    sql: string,
    params: unknown[],
  ): Promise<ShootingBreakdownRow[]> {
    const rows = await this.dataSource.query<RawRow[]>(sql, params);

    return rows.map((row) => ({
      id: this.strOrNull(row.id),
      name: String(row.name ?? '\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0438'),
      missions: this.num(row.missions),
      actualQuantity: this.num(row.actual_quantity),
    }));
  }

  private formatKyiv(date: Date): string {
    return new Intl.DateTimeFormat('uk-UA', {
      timeZone: KYIV_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }
}
