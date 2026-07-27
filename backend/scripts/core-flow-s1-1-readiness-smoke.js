const API_URL = process.env.API_URL || 'http://127.0.0.1:3000';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const STEP_DELAY_MS = Number(process.env.SMOKE_STEP_DELAY_MS || 0);
const { Client } = require('pg');

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
  return (
    await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: ADMIN_LOGIN,
        password: ADMIN_PASSWORD,
      }),
    })
  ).accessToken;
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

async function setSmokeDepot(firePositionId, depotId) {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'euclida_user',
    password: process.env.DB_PASSWORD || 'euclida_password',
    database: process.env.DB_NAME || 'euclida_situation_db',
  });
  await client.connect();
  try {
    await client.query(
      'UPDATE fire_positions SET ammo_depot_id = $1 WHERE id = $2',
      [depotId, firePositionId],
    );
  } finally {
    await client.end();
  }
}

async function checkpoint(label, context) {
  console.log(JSON.stringify({ checkpoint: label, ...context }));
  if (STEP_DELAY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS));
  }
}

function assertState(source, expectedReady, expectedReason) {
  const state =
    source.operationalState || source.firePosition?.operationalState;
  if (
    !state ||
    state.ready !== expectedReady ||
    state.reasonLabel !== expectedReason
  ) {
    throw new Error(`Unexpected operational state: ${JSON.stringify(state)}`);
  }
}

async function readSurfaces(token, firePositionId) {
  const [list, map, card] = await Promise.all([
    api(token, '/fire-positions'),
    api(token, '/fire-positions/map'),
    api(token, `/fire-positions/${firePositionId}/card`),
  ]);
  return {
    list: list.find((item) => item.id === firePositionId),
    map: map.find((item) => item.id === firePositionId),
    card,
  };
}

async function createSuggestionProbe(token, position, suffix, debug = false) {
  const order = await api(token, '/service-orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `CORE-S1.1-${suffix}`,
      targetLat: Number(position.lat),
      targetLng: Number(position.lng),
      taskType: 'fire',
      plannedQuantity: 1,
    }),
  });

  try {
    const suggestions = await api(
      token,
      `/service-orders/${order.id}/suggestions`,
      { method: 'POST', body: '{}' },
    );
    const candidate = suggestions.find(
      (item) =>
        item.firePositionId === position.id && item.compatibleKits?.length > 0,
    );
    if (!candidate) {
      if (debug) {
        throw new Error(
          `No isolated candidate: ${JSON.stringify(
            suggestions.map((item) => ({
              firePositionId: item.firePositionId,
              readiness: item.readiness,
              rejectionReasons: item.rejectionReasons,
              kits: item.compatibleKits?.length,
            })),
          )}`,
        );
      }
      await api(token, `/service-orders/${order.id}`, { method: 'DELETE' });
      return null;
    }
    return { order, candidate };
  } catch (error) {
    await api(token, `/service-orders/${order.id}`, { method: 'DELETE' });
    if (debug) {
      throw error;
    }
    return null;
  }
}

async function main() {
  const token = await login();
  const suffix = Date.now();
  const [positions, orders] = await Promise.all([
    api(token, '/fire-positions'),
    api(token, '/service-orders'),
  ]);
  const busyPositionIds = new Set(
    orders
      .filter((order) =>
        [
          'proposed',
          'sent',
          'sent_to_division',
          'sent_to_battery',
          'accepted',
          'in_progress',
        ].includes(order.status),
      )
      .map((order) => order.selectedFirePositionId)
      .filter(Boolean),
  );

  let templateProbe = null;
  let templatePosition = null;
  for (const candidate of positions.filter(
    (item) =>
      item.operationalState?.ready &&
      item.assignedWeapon &&
      item.ammoDepotId &&
      !busyPositionIds.has(item.id),
  )) {
    templateProbe = await createSuggestionProbe(token, candidate, suffix);
    if (templateProbe) {
      templatePosition = candidate;
      break;
    }
  }

  if (!templatePosition || !templateProbe) {
    throw new Error('No FP template with a valid suggestion');
  }
  await api(token, `/service-orders/${templateProbe.order.id}`, {
    method: 'DELETE',
  });

  let position = null;
  let weaponId = null;
  let orderId = null;
  let generatedDepotId = null;
  const transcript = [];

  try {
    position = await api(token, '/fire-positions', {
      method: 'POST',
      body: JSON.stringify({
        name: `CORE-S1.1 ВП ${suffix}`,
        positionType: 'fire_position',
        unitId: templatePosition.unitId,
        lat: Number(templatePosition.lat),
        lng: Number(templatePosition.lng),
        ...(templatePosition.mainDirectionUnits !== null
          ? {
              mainDirectionUnits: Number(templatePosition.mainDirectionUnits),
            }
          : {}),
        ...(templatePosition.traverseLeftUnits !== null
          ? {
              traverseLeftUnits: Number(templatePosition.traverseLeftUnits),
            }
          : {}),
        ...(templatePosition.traverseRightUnits !== null
          ? {
              traverseRightUnits: Number(templatePosition.traverseRightUnits),
            }
          : {}),
      }),
    });
    generatedDepotId = position.ammoDepotId;
    await setSmokeDepot(position.id, templatePosition.ammoDepotId);
    position = await api(token, `/fire-positions/${position.id}`);
    const weapon = await api(token, '/weapon-systems', {
      method: 'POST',
      body: JSON.stringify({
        weaponModelId: templatePosition.assignedWeapon.weaponModel.id,
        unitId: templatePosition.unitId,
        serialNumber: `CORE-S1.1-${suffix}`,
        callsign: `S1.1-${String(suffix).slice(-6)}`,
        readinessStatus: 'combat_ready',
      }),
    });
    weaponId = weapon.id;
    await api(token, `/weapon-systems/${weaponId}/assign-to-fire-position`, {
      method: 'POST',
      body: JSON.stringify({ targetFirePositionId: position.id }),
    });
    position = await api(token, `/fire-positions/${position.id}`);
    const probe = await createSuggestionProbe(token, position, suffix, true);
    if (!probe) {
      throw new Error('Isolated smoke FP did not produce a valid suggestion');
    }
    orderId = probe.order.id;

    let surfaces = await readSurfaces(token, position.id);
    for (const surface of Object.values(surfaces)) {
      assertState(surface, true, null);
    }
    transcript.push('assigned BG: list/card/map ready; suggestion included');
    await checkpoint('ready', {
      firePositionId: position.id,
      firePositionName: position.name,
    });

    await api(token, `/weapon-systems/${weaponId}/readiness/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        readinessStatus: 'not_combat_ready',
        notReadyReason: 'breakdown',
      }),
    });
    surfaces = await readSurfaces(token, position.id);
    for (const surface of Object.values(surfaces)) {
      assertState(surface, false, 'СГ НЕ БГ: Поломка');
    }
    const rejectedByWeapon = await api(
      token,
      `/service-orders/${orderId}/suggestions`,
      { method: 'POST', body: '{}' },
    );
    if (
      !rejectedByWeapon.some(
        (item) =>
          item.firePositionId === position.id &&
          item.rejectionReasons?.includes('СГ НЕ БГ: Поломка'),
      )
    ) {
      throw new Error('Suggestion does not carry the weapon readiness reason');
    }
    transcript.push(
      'weapon breakdown: exact reason on list/card/map/suggestion',
    );
    await checkpoint('breakdown', { firePositionId: position.id });

    await api(token, `/weapon-systems/${weaponId}/readiness/confirm`, {
      method: 'POST',
      body: JSON.stringify({ readinessStatus: 'combat_ready' }),
    });
    surfaces = await readSurfaces(token, position.id);
    for (const surface of Object.values(surfaces)) {
      assertState(surface, true, null);
    }
    transcript.push('weapon restored BG: FP ready again');
    await checkpoint('restored', { firePositionId: position.id });

    await api(token, `/weapon-systems/${weaponId}/move-to-reserve`, {
      method: 'POST',
      body: '{}',
    });
    surfaces = await readSurfaces(token, position.id);
    for (const surface of Object.values(surfaces)) {
      assertState(surface, false, 'СГ не призначена');
    }
    transcript.push('weapon removed: exact missing-weapon reason');
    await checkpoint('removed', { firePositionId: position.id });

    await api(token, `/weapon-systems/${weaponId}/assign-to-fire-position`, {
      method: 'POST',
      body: JSON.stringify({ targetFirePositionId: position.id }),
    });
    await api(token, `/fire-positions/${position.id}/readiness/not-ready`, {
      method: 'POST',
      body: JSON.stringify({ notReadyReason: 'threat' }),
    });
    surfaces = await readSurfaces(token, position.id);
    for (const surface of Object.values(surfaces)) {
      assertState(surface, false, 'Повітряна загроза');
    }
    const rejectedByThreat = await api(
      token,
      `/service-orders/${orderId}/suggestions`,
      { method: 'POST', body: '{}' },
    );
    if (
      !rejectedByThreat.some(
        (item) =>
          item.firePositionId === position.id &&
          item.rejectionReasons?.includes('Повітряна загроза'),
      )
    ) {
      throw new Error('Suggestion does not carry the FP threat reason');
    }
    transcript.push('explicit threat overrides assigned BG weapon');
    await checkpoint('threat', { firePositionId: position.id });

    console.log(
      JSON.stringify(
        {
          firePositionId: position.id,
          firePositionName: position.name,
          weaponId,
          orderId,
          transcript,
        },
        null,
        2,
      ),
    );
  } finally {
    if (orderId) {
      await api(token, `/service-orders/${orderId}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    if (weaponId) {
      await api(token, `/weapon-systems/${weaponId}/move-to-reserve`, {
        method: 'POST',
        body: '{}',
      }).catch(() => undefined);
      await api(token, `/weapon-systems/${weaponId}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    if (position) {
      await setSmokeDepot(position.id, generatedDepotId).catch(() => undefined);
      await api(token, `/fire-positions/${position.id}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    if (generatedDepotId) {
      await api(token, `/depots/${generatedDepotId}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
