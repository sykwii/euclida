const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3014';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const conflictMessage =
  'СГ використовується в історії ВГЗ і не може бути видалена. Архівуйте її.';

function createClient() {
  return new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'euclida_user',
    password: process.env.DB_PASSWORD || 'euclida_password',
    database: process.env.DB_NAME || 'euclida_situation_db',
  });
}

async function request(pathname, options = {}, expectedStatus = null) {
  const response = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  const accepted =
    expectedStatus === null
      ? response.status >= 200 && response.status < 300
      : response.status === expectedStatus;
  if (!accepted) {
    throw new Error(
      `${options.method || 'GET'} ${pathname}: expected ${expectedStatus}, got ${response.status}: ${text}`,
    );
  }
  return body;
}

function api(token, pathname, options = {}, expectedStatus = null) {
  return request(
    pathname,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    },
    expectedStatus,
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const client = createClient();
  await client.connect();
  let original = null;
  let smokeDescription = null;

  try {
    const candidateResult = await client.query(`
      SELECT
        weapon.id,
        weapon.callsign,
        weapon.readiness_status,
        weapon.not_ready_reason,
        weapon.maintenance_status,
        weapon.maintenance_actual_end_at,
        weapon.maintenance_note,
        weapon.is_archived,
        weapon.archived_at,
        weapon.archived_by_user_id,
        NOT EXISTS (
          SELECT 1
          FROM weapon_maintenances maintenance
          WHERE maintenance.weapon_system_id = weapon.id
            AND maintenance.status IN ('opened', 'in_progress')
        ) AS has_no_active_maintenance
      FROM weapon_systems weapon
      WHERE weapon.is_archived = false
        AND EXISTS (
          SELECT 1
          FROM service_order_deliveries delivery
          WHERE delivery.selected_weapon_system_id = weapon.id
        )
      ORDER BY
        (
          weapon.maintenance_status IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM weapon_maintenances maintenance
            WHERE maintenance.weapon_system_id = weapon.id
              AND maintenance.status IN ('opened', 'in_progress')
          )
        ) DESC,
        weapon.updated_at DESC,
        weapon.id
      LIMIT 1
    `);
    original = candidateResult.rows[0] || null;
    assert(original, 'No historically referenced weapon is available for smoke');
    assert(
      original.has_no_active_maintenance,
      'Selected weapon already has active maintenance',
    );

    const staleBefore = await client.query(`
      SELECT count(*)::int AS count
      FROM weapon_systems weapon
      WHERE weapon.maintenance_status IS DISTINCT FROM (
        SELECT maintenance.status
        FROM weapon_maintenances maintenance
        WHERE maintenance.weapon_system_id = weapon.id
          AND maintenance.status IN ('opened', 'in_progress')
        ORDER BY maintenance.created_at DESC, maintenance.id DESC
        LIMIT 1
      )
    `);
    const repairSql = fs.readFileSync(
      path.join(__dirname, 'flow-stab-maintenance-repair.sql'),
      'utf8',
    );
    await client.query(repairSql);

    const login = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: ADMIN_LOGIN,
        password: ADMIN_PASSWORD,
      }),
    });
    const token = login.accessToken;
    const id = original.id;
    let weapon = await api(token, `/weapon-systems/${id}`);
    assert(weapon.activeMaintenance === null, 'Stale active maintenance survived repair');
    assert(weapon.maintenanceStatus === null, 'Stale maintenance cache survived repair');

    smokeDescription = `FLOW-STAB-MAINT-1 smoke ${Date.now()}`;
    weapon = await api(token, `/weapon-systems/${id}/maintenance/open`, {
      method: 'POST',
      body: JSON.stringify({
        reason: 'inspection',
        durationMinutes: 15,
        description: smokeDescription,
      }),
    });
    const openedRows = await client.query(
      `SELECT id, status, description
       FROM weapon_maintenances
       WHERE weapon_system_id = $1
       ORDER BY created_at DESC`,
      [id],
    );
    assert(
      weapon.activeMaintenance?.status === 'opened',
      `Open state not returned: ${JSON.stringify({
        weaponId: id,
        responseId: weapon.id,
        readinessStatus: weapon.readinessStatus,
        notReadyReason: weapon.notReadyReason,
        maintenanceStatus: weapon.maintenanceStatus,
        activeMaintenance: weapon.activeMaintenance,
        maintenances: weapon.maintenances,
        databaseRows: openedRows.rows,
      })}`,
    );

    weapon = await api(token, `/weapon-systems/${id}/maintenance/start`, {
      method: 'POST',
      body: '{}',
    });
    assert(
      weapon.activeMaintenance?.status === 'in_progress',
      'In-progress state not returned',
    );

    weapon = await api(token, `/weapon-systems/${id}/maintenance/complete`, {
      method: 'POST',
      body: JSON.stringify({ result: 'smoke complete' }),
    });
    assert(weapon.activeMaintenance === null, 'Completed maintenance remains active');
    assert(weapon.maintenanceStatus === null, 'Completed cache was not cleared');
    assert(
      weapon.readinessStatus === 'not_combat_ready',
      'Completion auto-confirmed readiness',
    );
    assert(
      weapon.maintenances.some(
        (maintenance) =>
          maintenance.description === smokeDescription &&
          maintenance.status === 'completed',
      ),
      'Completed maintenance is missing from history',
    );

    weapon = await api(token, `/weapon-systems/${id}/readiness/confirm`, {
      method: 'POST',
      body: JSON.stringify({ readinessStatus: 'combat_ready' }),
    });
    assert(weapon.readinessStatus === 'combat_ready', 'Readiness was not confirmed');

    const deletion = await api(
      token,
      `/weapon-systems/${id}`,
      { method: 'DELETE' },
      409,
    );
    assert(deletion.message === conflictMessage, 'Unexpected delete conflict message');

    const archived = await api(token, `/weapon-systems/${id}/archive`, {
      method: 'POST',
      body: '{}',
    });
    assert(archived.isArchived === true, 'Weapon was not archived');
    const visibleWeapons = await api(token, '/weapon-systems');
    assert(
      !visibleWeapons.some((item) => item.id === id),
      'Archived weapon remains in active selector response',
    );
    const deliveryReference = await client.query(
      `SELECT count(*)::int AS count
       FROM service_order_deliveries
       WHERE selected_weapon_system_id = $1`,
      [id],
    );
    assert(
      deliveryReference.rows[0].count > 0,
      'Historical delivery reference was removed',
    );

    console.log(
      JSON.stringify({
        ok: true,
        weaponId: id,
        callsign: original.callsign,
        staleRowsRepaired: staleBefore.rows[0].count,
        transitions: ['opened', 'in_progress', 'completed', 'combat_ready'],
        deleteStatus: 409,
        archiveHiddenFromActiveList: true,
        historyPreserved: true,
      }),
    );
  } finally {
    if (original) {
      if (smokeDescription) {
        await client.query(
          `DELETE FROM weapon_maintenances
           WHERE weapon_system_id = $1 AND description = $2`,
          [original.id, smokeDescription],
        );
      }
      await client.query(
        `UPDATE weapon_systems
         SET readiness_status = $2,
             not_ready_reason = $3,
             maintenance_status = NULL,
             maintenance_actual_end_at = $4,
             maintenance_note = $5,
             is_archived = $6,
             archived_at = $7,
             archived_by_user_id = $8
         WHERE id = $1`,
        [
          original.id,
          original.readiness_status,
          original.not_ready_reason,
          original.maintenance_actual_end_at,
          original.maintenance_note,
          original.is_archived,
          original.archived_at,
          original.archived_by_user_id,
        ],
      );
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
