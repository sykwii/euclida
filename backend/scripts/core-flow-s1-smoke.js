const API_URL = process.env.API_URL || 'http://127.0.0.1:3001';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: ${body?.message || text}`);
  }
  return body;
}

async function login(loginName, password) {
  return (await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: loginName, password }),
  })).accessToken;
}

function api(token, path, options = {}) {
  return request(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

async function main() {
  const suffix = Date.now();
  const adminToken = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  let temporaryUserId = null;

  try {
    const [positions, weapons, existingOrders] = await Promise.all([
      api(adminToken, '/fire-positions'),
      api(adminToken, '/weapon-systems'),
      api(adminToken, '/service-orders'),
    ]);
    const busyPositionIds = new Set(
      existingOrders
        .filter((item) => ['proposed', 'sent', 'sent_to_division', 'sent_to_battery', 'accepted', 'in_progress'].includes(item.status))
        .map((item) => item.selectedFirePositionId)
        .filter(Boolean),
    );
    const position = positions.find((item) =>
      item.aggregateReady &&
      item.ammoDepotId &&
      item.unitId &&
      item.assignedWeapon &&
      !busyPositionIds.has(item.id),
    );
    if (!position) {
      throw new Error(`No aggregate-ready fire position with a local depot: ${JSON.stringify(
        positions.map((item) => ({
          id: item.id,
          aggregateReady: item.aggregateReady,
          reasons: item.aggregateReadinessReasons,
          notReadyReason: item.notReadyReason,
          ammoDepotId: item.ammoDepotId,
          hasWeapon: !!item.assignedWeapon,
          busy: busyPositionIds.has(item.id),
        })),
      )}`);
    }

    const weapon = weapons.find(
      (item) => item.currentFirePositionId === position.id && item.readinessStatus === 'combat_ready',
    );
    if (!weapon) throw new Error('Canonical assigned weapon was not returned');

    const order = await api(adminToken, '/service-orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber: `CORE-S1-${suffix}`,
        targetLat: Number(position.lat),
        targetLng: Number(position.lng),
        taskType: 'fire',
        plannedQuantity: 1,
      }),
    });

    const suggestions = await api(adminToken, `/service-orders/${order.id}/suggestions`, {
      method: 'POST',
      body: '{}',
    });
    const candidate = suggestions.find(
      (item) => item.executorType === 'fire_position' && item.variants?.length > 0,
    );
    if (!candidate) throw new Error('Suggestion response has no compatible fire-position kit');
    const kit = candidate.variants[0];

    await api(adminToken, `/service-orders/${order.id}/select-position`, {
      method: 'POST',
      body: JSON.stringify({
        firePositionId: candidate.firePosition.id,
        shotConfigurationId: kit.shotConfigurationId,
      }),
    });

    const tempLogin = `core_s1_${suffix}`;
    const tempPassword = 'Smoke123!';
    const tempUser = await api(adminToken, '/users', {
      method: 'POST',
      body: JSON.stringify({
        login: tempLogin,
        password: tempPassword,
        fullName: 'CORE S1 smoke operator',
        role: 'operator',
        scope: 'battery',
        unitId: candidate.firePosition.unitId,
        isActive: true,
      }),
    });
    temporaryUserId = tempUser.id;
    const batteryToken = await login(tempLogin, tempPassword);

    await api(adminToken, `/service-orders/${order.id}/send`, {
      method: 'POST',
      body: '{}',
    });
    const deliveries = await api(batteryToken, '/service-orders/deliveries');
    const delivery = deliveries.find(
      (item) => item.serviceOrderId === order.id && item.recipientLevel === 'battery',
    );
    if (!delivery) throw new Error('Battery delivery was not created');

    await api(batteryToken, `/service-orders/deliveries/${delivery.id}/view`, {
      method: 'POST',
      body: '{}',
    });
    await api(batteryToken, `/service-orders/deliveries/${delivery.id}/respond`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'accepted',
        selectedFirePositionId: candidate.firePosition.id,
        selectedWeaponSystemId: weapon.id,
        comment: 'CORE S1 smoke accepted',
      }),
    });
    await api(batteryToken, `/service-orders/${order.id}/start`, {
      method: 'POST',
      body: '{}',
    });

    const startedAt = new Date();
    const completedAt = new Date(startedAt.getTime() + 1000);
    const record = await api(batteryToken, `/execution/service-orders/${order.id}/records`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: `core-s1:${order.id}`,
        executionType: 'artillery',
        purpose: 'main_fire',
        result: 'executed',
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        quantity: 1,
        comment: 'CORE S1 smoke execution',
        artillery: {
          compositionSource: 'template',
          sourceShotConfigurationId: kit.shotConfigurationId,
          weaponModelId: weapon.weaponModelId,
          shellId: kit.shellId,
          fuzeId: kit.fuzeId,
          primerId: kit.primerId,
          maxRangeM: kit.maxRangeM,
          compositionSnapshot: { name: kit.shotConfigurationName, zoneNumber: kit.zoneNumber },
          charges: kit.charges.map((item) => ({
            chargeId: item.chargeId,
            chargeName: item.charge.marking,
            quantityPerShot: item.quantityPerShot,
            accountingUnit: item.accountingUnit,
            sortOrder: item.sortOrder,
          })),
        },
      }),
    });

    const validation = await api(batteryToken, `/execution/records/${record.id}/validate`);
    if (!validation.valid) throw new Error(`Execution validation failed: ${JSON.stringify(validation.reasons)}`);
    const posted = await api(batteryToken, `/execution/records/${record.id}/post`, {
      method: 'POST',
      body: '{}',
    });
    const repeatedPost = await api(batteryToken, `/execution/records/${record.id}/post`, {
      method: 'POST',
      body: '{}',
    });
    if (repeatedPost.stockOperationId !== posted.stockOperationId) {
      throw new Error('Repeated post returned a different stock operation');
    }

    const completed = await api(batteryToken, `/service-orders/${order.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        actualQuantity: 1,
        resultType: 'hit',
        resultComment: 'CORE S1 smoke complete',
      }),
    });
    const notifications = await api(batteryToken, '/operational-notifications');

    process.stdout.write(`${JSON.stringify({
      orderId: order.id,
      candidateId: candidate.firePosition.id,
      kitId: kit.shotConfigurationId,
      deliveryId: delivery.id,
      executionRecordId: record.id,
      stockOperationId: posted.stockOperationId,
      repeatedPostStockOperationId: repeatedPost.stockOperationId,
      completedStatus: completed.status,
      actualQuantity: completed.actualQuantity,
      notificationCount: notifications.length,
    }, null, 2)}\n`);
  } finally {
    if (temporaryUserId) {
      await api(adminToken, `/users/${temporaryUserId}`, { method: 'DELETE' });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
