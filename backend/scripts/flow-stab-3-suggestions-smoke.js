const { Client } = require('pg');
const { randomUUID } = require('crypto');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3013';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${path}: ${body?.message || text}`,
    );
  }
  return body;
}

async function login() {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      login: ADMIN_LOGIN,
      password: ADMIN_PASSWORD,
    }),
  });
  return result.accessToken;
}

function api(token, path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

async function database(action) {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'euclida_user',
    password: process.env.DB_PASSWORD || 'euclida_password',
    database: process.env.DB_NAME || 'euclida_situation_db',
  });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

async function setPositionDepot(positionId, depotId) {
  await database((client) =>
    client.query(
      'UPDATE fire_positions SET ammo_depot_id = $1 WHERE id = $2',
      [depotId, positionId],
    ),
  );
}

async function resetOrderToDraft(orderId) {
  await database((client) =>
    client.query(
      `UPDATE service_orders
       SET status = 'draft',
           selected_fire_position_id = NULL,
           selected_shot_configuration_id = NULL,
           selected_shell_id = NULL,
           selected_charge_id = NULL,
           selected_zone_id = NULL
       WHERE id = $1`,
      [orderId],
    ),
  );
}

async function insertSmokeStock(depotId, resources) {
  const rows = [
    {
      table: 'depot_shell_stock',
      itemColumn: 'shell_id',
      itemId: resources.shell.id,
    },
    {
      table: 'depot_charge_stock',
      itemColumn: 'charge_id',
      itemId: resources.charge.id,
    },
    {
      table: 'depot_fuze_stock',
      itemColumn: 'fuze_id',
      itemId: resources.fuze.id,
    },
    {
      table: 'depot_primer_stock',
      itemColumn: 'primer_id',
      itemId: resources.primer.id,
    },
  ].map((row) => ({ ...row, id: randomUUID() }));

  await database(async (client) => {
    for (const row of rows) {
      await client.query(
        `INSERT INTO ${row.table} (id, depot_id, ${row.itemColumn}, quantity)
         VALUES ($1, $2, $3, 100)`,
        [row.id, depotId, row.itemId],
      );
    }
  });
  return rows;
}

async function deleteSmokeStock(rows) {
  await database(async (client) => {
    for (const row of rows) {
      await client.query(`DELETE FROM ${row.table} WHERE id = $1`, [row.id]);
    }
  });
}

async function cleanupSmokeResidue() {
  return database(async (client) => {
    await client.query('BEGIN');
    try {
      const weapons = await client.query(
        `DELETE FROM weapon_systems
         WHERE serial_number LIKE 'FLOW-STAB-3-%'
         RETURNING id`,
      );
      const positions = await client.query(
        `DELETE FROM fire_positions
         WHERE name LIKE 'FLOW-STAB-3 FP %'
         RETURNING id`,
      );
      const kits = await client.query(
        `DELETE FROM shot_configurations
         WHERE name LIKE 'FLOW-STAB-3 KIT %'
         RETURNING id`,
      );
      const depots = await client.query(
        `DELETE FROM depots
         WHERE name LIKE 'БК FLOW-STAB-3 FP %'
         RETURNING id`,
      );
      await client.query('COMMIT');
      return {
        weapons: weapons.rowCount,
        positions: positions.rowCount,
        kits: kits.rowCount,
        depots: depots.rowCount,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

function stableProjection(suggestions) {
  return suggestions.map((item) => ({
    rank: item.rank,
    stableId: item.stableId,
    candidateType: item.candidateType,
    ready: item.ready,
    distanceM: item.distanceM,
    availableShots: item.stockSummary?.availableShots ?? null,
    kits: (item.compatibleKits || []).map(
      (kit) => kit.shotConfigurationId,
    ),
    rejectionReasons: item.rejectionReasons || [],
    rejectionReasonLabels: item.rejectionReasonLabels || [],
  }));
}

async function main() {
  const token = await login();
  const residueBefore = await cleanupSmokeResidue();
  const suffix = Date.now();
  const [positions, shells, charges, fuzes, primers] = await Promise.all([
    api(token, '/fire-positions'),
    api(token, '/shells'),
    api(token, '/charges'),
    api(token, '/fuzes'),
    api(token, '/primers'),
  ]);
  const template = positions.find(
    (item) =>
      item.operationalState?.ready &&
      item.assignedWeapon?.weaponModel?.id &&
      item.unitId,
  );
  if (!template) {
    throw new Error('No ready FP to provide a weapon model and unit');
  }
  if (!shells[0] || !charges[0] || !fuzes[0] || !primers[0]) {
    throw new Error('Reference shell, charge, fuze or primer is absent');
  }

  const createdPositions = [];
  const createdWeapons = [];
  const createdKits = [];
  let smokeStockRows = [];
  let standaloneWeapon = null;
  let order = null;
  let smokeDepotId = null;

  try {
    for (let index = 0; index < 4; index += 1) {
      const position = await api(token, '/fire-positions', {
        method: 'POST',
        body: JSON.stringify({
          name: `FLOW-STAB-3 FP ${index + 1} ${suffix}`,
          positionType: 'fire_position',
          unitId: template.unitId,
          lat: Number(template.lat) + index * 0.00005,
          lng: Number(template.lng) + index * 0.00005,
        }),
      });
      const generatedDepotId = position.ammoDepotId;
      smokeDepotId ??= generatedDepotId;
      await setPositionDepot(position.id, smokeDepotId);
      createdPositions.push({ ...position, generatedDepotId });

      const weapon = await api(token, '/weapon-systems', {
        method: 'POST',
        body: JSON.stringify({
          weaponModelId: template.assignedWeapon.weaponModel.id,
          unitId: template.unitId,
          serialNumber: `FLOW-STAB-3-${index + 1}-${suffix}`,
          callsign: `FS3-${index + 1}-${String(suffix).slice(-5)}`,
          readinessStatus: 'combat_ready',
        }),
      });
      createdWeapons.push(weapon);
      await api(
        token,
        `/weapon-systems/${weapon.id}/assign-to-fire-position`,
        {
          method: 'POST',
          body: JSON.stringify({ targetFirePositionId: position.id }),
        },
      );
    }

    for (let index = 0; index < 2; index += 1) {
      createdKits.push(
        await api(token, '/shot-configurations', {
          method: 'POST',
          body: JSON.stringify({
            name: `FLOW-STAB-3 KIT ${index + 1} ${suffix}`,
            weaponModelId: template.assignedWeapon.weaponModel.id,
            shellId: shells[0].id,
            fuzeId: fuzes[0].id,
            primerId: primers[0].id,
            zoneNumber: index + 1,
            maxRangeM: 100000,
            isActive: true,
            charges: [
              {
                chargeId: charges[0].id,
                quantityPerShot: index + 1,
                accountingUnit:
                  charges[0].chargeKind === 'modular' ? 'module' : 'piece',
                sortOrder: 0,
              },
            ],
          }),
        }),
      );
    }
    smokeStockRows = await insertSmokeStock(smokeDepotId, {
      shell: shells[0],
      charge: charges[0],
      fuze: fuzes[0],
      primer: primers[0],
    });

    await api(
      token,
      `/fire-positions/${createdPositions[2].id}/readiness/not-ready`,
      {
        method: 'POST',
        body: JSON.stringify({ notReadyReason: 'threat' }),
      },
    );
    await api(
      token,
      `/weapon-systems/${createdWeapons[3].id}/readiness/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({
          readinessStatus: 'not_combat_ready',
          notReadyReason: 'breakdown',
        }),
      },
    );

    standaloneWeapon = await api(token, '/weapon-systems', {
      method: 'POST',
      body: JSON.stringify({
        weaponModelId: template.assignedWeapon.weaponModel.id,
        unitId: template.unitId,
        serialNumber: `FLOW-STAB-3-STANDALONE-${suffix}`,
        callsign: `FS3-S-${String(suffix).slice(-5)}`,
        readinessStatus: 'combat_ready',
      }),
    });

    order = await api(token, '/service-orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber: `FLOW-STAB-3-${suffix}`,
        targetLat: Number(template.lat),
        targetLng: Number(template.lng),
        taskType: 'fire',
        plannedQuantity: 1,
      }),
    });

    const runs = [];
    for (let index = 0; index < 10; index += 1) {
      runs.push(
        stableProjection(
          await api(token, `/service-orders/${order.id}/suggestions`, {
            method: 'POST',
            body: '{}',
          }),
        ),
      );
    }
    if (new Set(runs.map((run) => JSON.stringify(run))).size !== 1) {
      throw new Error('Suggestion order changed between repeated calls');
    }

    const suggestions = runs[0];
    const readyIds = createdPositions.slice(0, 2).map((item) => item.id);
    for (const firePositionId of readyIds) {
      const candidate = suggestions.find(
        (item) =>
          item.stableId ===
          createdWeapons[
            createdPositions.findIndex((position) => position.id === firePositionId)
          ].id,
      );
      if (!candidate?.ready || candidate.kits.length === 0) {
        throw new Error(`Expected ready candidate for ${firePositionId}`);
      }
    }
    const blocked = suggestions.find(
      (item) => item.stableId === createdWeapons[2].id,
    );
    const notReady = suggestions.find(
      (item) => item.stableId === createdWeapons[3].id,
    );
    const standalone = suggestions.find(
      (item) => item.stableId === standaloneWeapon.id,
    );
    if (!blocked?.rejectionReasons.includes('fp_blocked')) {
      throw new Error('Blocked FP has no fp_blocked reason');
    }
    if (!notReady?.rejectionReasons.includes('weapon_not_ready')) {
      throw new Error('НЕ БГ weapon has no weapon_not_ready reason');
    }
    if (
      standalone?.candidateType !== 'standalone_weapon' ||
      !standalone.rejectionReasons.includes('invalid_coordinates') ||
      !standalone.rejectionReasons.includes('no_stock_depot')
    ) {
      throw new Error('Standalone weapon explanation is incomplete');
    }

    const freshSuggestions = await api(
      token,
      `/service-orders/${order.id}/suggestions`,
      { method: 'POST', body: '{}' },
    );
    const selected = freshSuggestions.find(
      (item) =>
        item.stableId === createdWeapons[0].id &&
        item.ready === true &&
        item.compatibleKits?.length > 0,
    );
    const kit = selected?.compatibleKits?.[0];
    if (!selected || !kit) {
      throw new Error('No valid smoke candidate and kit to select');
    }
    await api(token, `/service-orders/${order.id}/select-position`, {
      method: 'POST',
      body: JSON.stringify({
        firePositionId: selected.firePositionId,
        weaponSystemId: selected.weaponSystemId,
        shotConfigurationId: kit.shotConfigurationId,
      }),
    });
    const reloaded = await api(token, `/service-orders/${order.id}`);
    if (
      reloaded.selectedFirePositionId !== selected.firePositionId ||
      reloaded.selectedShotConfigurationId !== kit.shotConfigurationId ||
      reloaded.status !== 'proposed'
    ) {
      throw new Error('Selected candidate or kit did not persist');
    }

    console.log(
      JSON.stringify(
        {
          orderId: order.id,
          repeatedRuns: runs.length,
          deterministic: true,
          candidateCount: suggestions.length,
          readySmokeCandidates: readyIds.length,
          blockedReasons: blocked.rejectionReasons,
          notReadyReasons: notReady.rejectionReasons,
          standaloneReasons: standalone.rejectionReasons,
          selectedFirePositionId: reloaded.selectedFirePositionId,
          selectedShotConfigurationId: reloaded.selectedShotConfigurationId,
          persistedStatus: reloaded.status,
          residueRemovedBeforeRun: residueBefore,
        },
        null,
        2,
      ),
    );
  } finally {
    if (order) {
      await resetOrderToDraft(order.id).catch(() => undefined);
      await api(token, `/service-orders/${order.id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    for (const kit of createdKits) {
      await api(token, `/shot-configurations/${kit.id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    await deleteSmokeStock(smokeStockRows).catch(() => undefined);
    if (standaloneWeapon) {
      await api(token, `/weapon-systems/${standaloneWeapon.id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    for (const weapon of createdWeapons) {
      await api(token, `/weapon-systems/${weapon.id}/move-to-reserve`, {
        method: 'POST',
        body: '{}',
      }).catch(() => undefined);
      await api(token, `/weapon-systems/${weapon.id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    for (const position of createdPositions) {
      await setPositionDepot(position.id, position.generatedDepotId).catch(
        () => undefined,
      );
      await api(token, `/fire-positions/${position.id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      await api(token, `/depots/${position.generatedDepotId}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    const residueAfter = await cleanupSmokeResidue().catch(() => null);
    console.log(
      JSON.stringify({
        cleanupAfterRun: residueAfter,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
