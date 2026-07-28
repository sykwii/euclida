const { io } = require('socket.io-client');

const API_URL = 'http://127.0.0.1:3000';
const FRONTEND_URL = 'http://127.0.0.1:8844';
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin123';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(
      `${options.method || 'GET'} ${path} fetch failed: ${error.message || String(error)}`,
    );
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      text ||
      `${response.status} ${response.statusText}`;
    throw new Error(`${options.method || 'GET'} ${path} failed: ${message}`);
  }

  return payload;
}

async function login(loginName, password) {
  const payload = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      login: loginName,
      password,
    }),
  });

  return payload.accessToken;
}

async function api(token, path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

async function waitFor(predicate, timeoutMs, message) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = predicate();
    if (result) {
      return result;
    }
    await sleep(50);
  }

  throw new Error(message);
}

function assertUniqueScopes(events, label) {
  const duplicates = [];
  const seen = new Set();

  for (const event of events) {
    const scope = event.scope || 'unknown';
    if (seen.has(scope)) {
      duplicates.push(scope);
    }
    seen.add(scope);
  }

  if (duplicates.length > 0) {
    throw new Error(`${label}: duplicate scopes detected: ${duplicates.join(', ')}`);
  }
}

async function collectEntityEvents(events, beforeCount, entity, id, action) {
  await waitFor(
    () =>
      events.slice(beforeCount).filter((event) => {
        return event.entity === entity && event.id === id && (!action || event.action === action);
      }).length > 0,
    5000,
    `Timed out waiting for ${entity}:${id}:${action || 'any'} realtime event`,
  );

  await sleep(350);

  return events.slice(beforeCount).filter((event) => {
    return event.entity === entity && event.id === id && (!action || event.action === action);
  });
}

async function cleanupPreviousSmokeOrders(adminToken) {
  const orders = await api(adminToken, '/service-orders');
  const smokeOrders = Array.isArray(orders)
    ? orders.filter((order) => typeof order.orderNumber === 'string' && order.orderNumber.startsWith('SMOKE-RT-'))
    : [];

  for (const order of smokeOrders) {
    if (order.status === 'draft') {
      await api(adminToken, `/service-orders/${order.id}`, {
        method: 'DELETE',
      });
      continue;
    }

    if (order.status !== 'completed' && order.status !== 'cancelled') {
      await api(adminToken, `/service-orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Cleanup previous smoke run',
        }),
      });
    }
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const summary = {
    startedAt,
    frontendUrl: FRONTEND_URL,
    backendUrl: API_URL,
    checks: [],
  };

  let adminToken;
  let batteryToken;
  let tempUserId = null;
  let createdOrderId = null;
  let createdTripId = null;
  let createdRouteId = null;
  let firePositionRestorePayload = null;

  const socketEvents = [];
  let socket = null;

  try {
    adminToken = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
    await cleanupPreviousSmokeOrders(adminToken);
    socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      auth: { token: adminToken },
      reconnection: true,
      timeout: 8000,
    });
    socket.on('realtime:event', (payload) => {
      socketEvents.push({
        ...payload,
        receivedAt: new Date().toISOString(),
      });
    });

    await waitFor(
      () => socket.connected,
      5000,
      'Socket did not connect',
    );

    const firePositions = await api(adminToken, '/fire-positions');
    const shells = await api(adminToken, '/shells');
    const charges = await api(adminToken, '/charges');
    const shellCompatibleCharges = await api(adminToken, '/shell-compatible-charges');
    const depotShellStock = await api(adminToken, '/depot-shell-stock');
    const depotChargeStock = await api(adminToken, '/depot-charge-stock');
    const depots = await api(adminToken, '/depots');

    if (!Array.isArray(firePositions) || firePositions.length === 0) {
      throw new Error('No fire positions available for smoke test');
    }
    if (!Array.isArray(shells) || shells.length === 0) {
      throw new Error('No shells available for smoke test');
    }
    if (!Array.isArray(charges) || charges.length === 0) {
      throw new Error('No charges available for smoke test');
    }
    if (!Array.isArray(shellCompatibleCharges) || shellCompatibleCharges.length === 0) {
      throw new Error('No shell/charge compatibility records available for smoke test');
    }

    const candidateFirePositions = firePositions.filter((item) => item.unitId);
    const firePosition = candidateFirePositions.find((item) => item.ammoDepotId) || candidateFirePositions[0];
    const orderNumber = `SMOKE-RT-${Date.now()}`;
    const tempLogin = `codex_smoke_${Date.now()}`;
    const tempPassword = 'Smoke123!';

    firePositionRestorePayload = {
      readinessStatus: firePosition.readinessStatus || null,
      notReadyReason: firePosition.notReadyReason || null,
    };

    const createOrderBefore = socketEvents.length;
    const createdOrder = await api(adminToken, '/service-orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber,
        taskType: 'smoke_test',
        targetLat: Number(firePosition.lat) + 0.01,
        targetLng: Number(firePosition.lng) + 0.01,
        plannedQuantity: 1,
      }),
    });
    createdOrderId = createdOrder.id;

    const createOrderEvents = await collectEntityEvents(
      socketEvents,
      createOrderBefore,
      'service_order',
      createdOrderId,
      'created',
    );
    assertUniqueScopes(createOrderEvents, 'service order create');
    summary.checks.push({
      name: 'ВГЗ create',
      ok: true,
      scopes: createOrderEvents.map((event) => event.scope),
    });

    let selectedShell = null;
    let selectedCharge = null;
    let selectedPositionId = null;
    let batteryUnitId = null;
    const suggestions = await api(
      adminToken,
      `/service-orders/${createdOrderId}/suggestions`,
      { method: 'POST', body: '{}' },
    );
    const selectedCandidate = suggestions.find(
      (item) =>
        item.candidateType === 'fire_position' &&
        item.ready === true &&
        item.firePositionId &&
        item.weaponSystemId &&
        item.compatibleKits?.length > 0,
    );
    const selectedKit = selectedCandidate?.compatibleKits?.[0];
    if (!selectedCandidate || !selectedKit) {
      throw new Error('No canonical fire-position candidate and shot kit for smoke test');
    }
    await api(adminToken, `/service-orders/${createdOrderId}/select-position`, {
      method: 'POST',
      body: JSON.stringify({
        firePositionId: selectedCandidate.firePositionId,
        weaponSystemId: selectedCandidate.weaponSystemId,
        shotConfigurationId: selectedKit.shotConfigurationId,
      }),
    });
    selectedShell = { id: selectedKit.shellId };
    selectedCharge = { id: selectedKit.chargeId };
    selectedPositionId = selectedCandidate.firePositionId;
    batteryUnitId = selectedCandidate.unitId;

    const tempUser = await api(adminToken, '/users', {
      method: 'POST',
      body: JSON.stringify({
        login: tempLogin,
        password: tempPassword,
        fullName: 'Тимчасовий smoke оператор',
        role: 'operator',
        scope: 'battery',
        unitId: batteryUnitId,
        isActive: true,
      }),
    });
    tempUserId = tempUser.id;
    batteryToken = await login(tempLogin, tempPassword);

    const sendBefore = socketEvents.length;
    await api(adminToken, `/service-orders/${createdOrderId}/send`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const sendEvents = await collectEntityEvents(
      socketEvents,
      sendBefore,
      'service_order',
      createdOrderId,
      'sent',
    );
    assertUniqueScopes(sendEvents, 'service order send');

    const acceptBefore = socketEvents.length;
    const deliveries = await api(batteryToken, '/service-orders/deliveries');
    const delivery = deliveries.find(
      (item) =>
        item.serviceOrderId === createdOrderId &&
        item.recipientLevel === 'battery',
    );
    if (!delivery) {
      throw new Error('Battery delivery was not created for realtime smoke');
    }
    await api(batteryToken, `/service-orders/deliveries/${delivery.id}/view`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await api(batteryToken, `/service-orders/deliveries/${delivery.id}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'accepted',
        selectedFirePositionId: selectedCandidate.firePositionId,
        selectedWeaponSystemId: selectedCandidate.weaponSystemId,
        comment: 'Realtime smoke accepted',
      }),
    });
    const acceptEvents = await collectEntityEvents(
      socketEvents,
      acceptBefore,
      'service_order',
      createdOrderId,
      'updated',
    );
    assertUniqueScopes(acceptEvents, 'service order accept');

    const startBefore = socketEvents.length;
    await api(batteryToken, `/service-orders/${createdOrderId}/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const startEvents = await collectEntityEvents(
      socketEvents,
      startBefore,
      'service_order',
      createdOrderId,
      'started',
    );
    assertUniqueScopes(startEvents, 'service order start');

    const now = new Date();
    const executionStartedAt = new Date(now.getTime() - 60_000);
    const executionRecord = await api(
      batteryToken,
      `/execution/service-orders/${createdOrderId}/records`,
      {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: `realtime-smoke:${createdOrderId}`,
          executionType: 'artillery',
          purpose: 'main_fire',
          result: 'executed',
          startedAt: executionStartedAt.toISOString(),
          completedAt: now.toISOString(),
          quantity: 1,
          comment: 'Realtime smoke execution',
          artillery: {
            compositionSource: 'template',
            sourceShotConfigurationId: selectedKit.shotConfigurationId,
            weaponModelId: selectedCandidate.weaponModelId,
            shellId: selectedKit.shellId,
            fuzeId: selectedKit.fuzeId,
            primerId: selectedKit.primerId,
            maxRangeM: selectedKit.maxRangeM,
            compositionSnapshot: {
              name: selectedKit.shotConfigurationName,
              zoneNumber: selectedKit.zoneNumber,
            },
            charges: selectedKit.charges.map((item) => ({
              chargeId: item.chargeId,
              chargeName: item.charge.marking,
              quantityPerShot: item.quantityPerShot,
              accountingUnit: item.accountingUnit,
              sortOrder: item.sortOrder,
            })),
          },
        }),
      },
    );
    const executionValidation = await api(
      batteryToken,
      `/execution/records/${executionRecord.id}/validate`,
    );
    if (!executionValidation.valid) {
      throw new Error(
        `Realtime execution validation failed: ${JSON.stringify(executionValidation.reasons)}`,
      );
    }
    await api(batteryToken, `/execution/records/${executionRecord.id}/post`, {
      method: 'POST',
      body: '{}',
    });

    const completeBefore = socketEvents.length;
    await api(batteryToken, `/service-orders/${createdOrderId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        startedAt: executionStartedAt.toISOString(),
        completedAt: now.toISOString(),
        actualQuantity: 1,
        resultType: 'target_suppressed',
        actualShellId: selectedShell.id,
        actualChargeId: selectedCharge.id,
      }),
    });
    const completeEvents = await collectEntityEvents(
      socketEvents,
      completeBefore,
      'service_order',
      createdOrderId,
      'completed',
    );
    assertUniqueScopes(completeEvents, 'service order complete');
    summary.checks.push({
      name: 'ВГЗ send/accept/start/complete',
      ok: true,
      sendScopes: sendEvents.map((event) => event.scope),
      acceptScopes: acceptEvents.map((event) => event.scope),
      startScopes: startEvents.map((event) => event.scope),
      completeScopes: completeEvents.map((event) => event.scope),
    });

    const mainDepot = Array.isArray(depots)
      ? depots.find((item) => item.depotType === 'main_pas')
      : null;
    if (!mainDepot) {
      throw new Error('No main PAS depot found for stock movement smoke');
    }

    const stockBefore = socketEvents.length;
    const stockMovement = await api(adminToken, '/stock-movements', {
      method: 'POST',
      body: JSON.stringify({
        toDepotId: mainDepot.id,
        itemType: 'shell',
        itemId: shells[0].id,
        quantity: 1,
        comment: 'SMOKE realtime verification',
      }),
    });
    const stockEvents = await collectEntityEvents(
      socketEvents,
      stockBefore,
      'stock_operation',
      stockMovement.stockOperationId,
      'moved',
    );
    assertUniqueScopes(stockEvents, 'stock movement create');
    summary.checks.push({
      name: 'Stock movement',
      ok: true,
      scopes: stockEvents.map((event) => event.scope),
    });

    const route = await api(adminToken, '/planned-routes', {
      method: 'POST',
      body: JSON.stringify({
        name: `SMOKE Route ${Date.now()}`,
        description: 'Realtime verification route',
        points: [
          {
            name: 'Старт',
            lat: Number(firePosition.lat),
            lng: Number(firePosition.lng),
            isControl: true,
          },
          {
            name: 'Фініш',
            lat: Number(firePosition.lat) + 0.02,
            lng: Number(firePosition.lng) + 0.02,
            isControl: true,
          },
        ],
      }),
    });
    createdRouteId = route.id;

    const tripCreateBefore = socketEvents.length;
    const trip = await api(adminToken, '/planned-trips', {
      method: 'POST',
      body: JSON.stringify({
        routeId: route.id,
        vehicleLabel: 'SMOKE-VEHICLE',
        driverLabel: 'SMOKE-DRIVER',
        tripPurpose: 'Realtime verification',
        plannedStartAt: new Date().toISOString(),
      }),
    });
    createdTripId = trip.id;
    const tripCreateEvents = await collectEntityEvents(
      socketEvents,
      tripCreateBefore,
      'planned_trip',
      createdTripId,
      'created',
    );
    assertUniqueScopes(tripCreateEvents, 'planned trip create');

    const tripUpdateBefore = socketEvents.length;
    await api(adminToken, `/planned-trips/${createdTripId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'archived',
      }),
    });
    const tripUpdateEvents = await collectEntityEvents(
      socketEvents,
      tripUpdateBefore,
      'planned_trip',
      createdTripId,
      'completed',
    );
    assertUniqueScopes(tripUpdateEvents, 'planned trip update');
    summary.checks.push({
      name: 'Planned trip update',
      ok: true,
      createScopes: tripCreateEvents.map((event) => event.scope),
      updateScopes: tripUpdateEvents.map((event) => event.scope),
    });

    const mapBefore = socketEvents.length;
    await api(adminToken, `/fire-positions/${firePosition.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        readinessStatus:
          firePosition.readinessStatus === 'ready' ? 'combat_ready' : 'ready',
      }),
    });
    const mapEvents = await collectEntityEvents(
      socketEvents,
      mapBefore,
      'fire_position',
      firePosition.id,
      'updated',
    );
    assertUniqueScopes(mapEvents, 'fire position update');
    summary.checks.push({
      name: 'Map object update',
      ok: true,
      scopes: mapEvents.map((event) => event.scope),
    });

    const eventRefreshOk = socketEvents.some(
      (event) =>
        event.scope === 'events' &&
        event.entity === 'service_order' &&
        event.id === createdOrderId,
    );
    if (!eventRefreshOk) {
      throw new Error('Event feed scope did not receive service order events');
    }
    summary.checks.push({
      name: 'Event feed refresh',
      ok: true,
    });

    socket.disconnect();
    await waitFor(() => !socket.connected, 3000, 'Socket did not disconnect');
    socket.connect();
    await waitFor(() => socket.connected, 5000, 'Socket did not reconnect');

    const reconnectBefore = socketEvents.length;
    await api(adminToken, `/fire-positions/${firePosition.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        readinessStatus: firePositionRestorePayload.readinessStatus,
        notReadyReason: firePositionRestorePayload.notReadyReason,
      }),
    });
    const reconnectEvents = await collectEntityEvents(
      socketEvents,
      reconnectBefore,
      'fire_position',
      firePosition.id,
      'updated',
    );
    assertUniqueScopes(reconnectEvents, 'socket reconnect update');
    summary.checks.push({
      name: 'Socket reconnect',
      ok: true,
      scopes: reconnectEvents.map((event) => event.scope),
    });

    summary.totalRealtimeEvents = socketEvents.length;
    summary.ok = true;
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    try {
      if (tempUserId && adminToken) {
        await api(adminToken, `/users/${tempUserId}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        });
      }
    } catch (error) {
      console.error(`Cleanup warning (user): ${error.message}`);
    }

    socket?.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
