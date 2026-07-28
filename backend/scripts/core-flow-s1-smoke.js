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

function executionBody({
  orderId,
  keySuffix,
  purpose,
  quantity,
  comment,
  kit,
  weapon,
  startedAt,
  completedAt,
}) {
  return {
    idempotencyKey: `release-smoke:${orderId}:${keySuffix}`,
    executionType: 'artillery',
    purpose,
    result: 'executed',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    quantity,
    comment,
    artillery: {
      compositionSource: 'template',
      sourceShotConfigurationId: kit.shotConfigurationId,
      weaponModelId: weapon.weaponModelId,
      shellId: kit.shellId,
      fuzeId: kit.fuzeId,
      primerId: kit.primerId,
      maxRangeM: kit.maxRangeM,
      compositionSnapshot: {
        name: kit.shotConfigurationName,
        zoneNumber: kit.zoneNumber,
      },
      charges: kit.charges.map((item) => ({
        chargeId: item.chargeId,
        chargeName: item.charge.marking,
        quantityPerShot: item.quantityPerShot,
        accountingUnit: item.accountingUnit,
        sortOrder: item.sortOrder,
      })),
    },
  };
}

async function main() {
  const suffix = Date.now();
  const adminToken = await login(ADMIN_LOGIN, ADMIN_PASSWORD);
  let temporaryUserId = null;
  let temporaryShotConfigurationId = null;

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

    const shotConfigurations = await api(adminToken, '/shot-configurations');
    const baseConfiguration = shotConfigurations.find(
      (item) =>
        item.isActive &&
        item.weaponModelId === weapon.weaponModelId &&
        item.shellId &&
        item.fuzeId &&
        item.primerId &&
        item.charges?.length > 0,
    );
    if (!baseConfiguration) {
      throw new Error('No complete active shot configuration to clone for alternate warmup');
    }
    const temporaryShotConfiguration = await api(adminToken, '/shot-configurations', {
      method: 'POST',
      body: JSON.stringify({
        name: `RELEASE-SMOKE-ALT-${suffix}`,
        weaponModelId: baseConfiguration.weaponModelId,
        shellId: baseConfiguration.shellId,
        fuzeId: baseConfiguration.fuzeId,
        primerId: baseConfiguration.primerId,
        zoneNumber: baseConfiguration.zoneNumber,
        maxRangeM: baseConfiguration.maxRangeM,
        isActive: true,
        note: 'RELEASE-STAB-1 alternate warmup kit',
        charges: baseConfiguration.charges.map((item) => ({
          chargeId: item.chargeId,
          quantityPerShot: Number(item.quantityPerShot),
          accountingUnit: item.accountingUnit,
          sortOrder: item.sortOrder,
        })),
      }),
    });
    temporaryShotConfigurationId = temporaryShotConfiguration.id;

    const order = await api(adminToken, '/service-orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber: `RELEASE-SMOKE-${suffix}`,
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
      (item) =>
        item.executorType === 'fire_position' &&
        item.firePositionId === position.id &&
        item.weaponSystemId === weapon.id &&
        item.ready === true &&
        item.variants?.length > 0,
    );
    if (!candidate) throw new Error('Suggestion response has no compatible fire-position kit');
    const kit = candidate.variants[0];

    await api(adminToken, `/service-orders/${order.id}/select-position`, {
      method: 'POST',
      body: JSON.stringify({
        firePositionId: candidate.firePosition.id,
        weaponSystemId: candidate.weaponSystemId,
        shotConfigurationId: kit.shotConfigurationId,
      }),
    });

    const tempLogin = `RELEASE-SMOKE-${suffix}`;
    const tempPassword = 'Smoke123!';
    const tempUser = await api(adminToken, '/users', {
      method: 'POST',
      body: JSON.stringify({
        login: tempLogin,
        password: tempPassword,
        fullName: 'RELEASE-SMOKE operator',
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
    const warmupKit = candidate.variants[1] || kit;
    const warmupRecord = await api(
      batteryToken,
      `/execution/service-orders/${order.id}/records`,
      {
        method: 'POST',
        body: JSON.stringify(
          executionBody({
            orderId: order.id,
            keySuffix: 'warmup',
            purpose: 'barrel_warmup',
            quantity: 1,
            comment: 'RELEASE-SMOKE warmup',
            kit: warmupKit,
            weapon,
            startedAt,
            completedAt,
          }),
        ),
      },
    );
    const warmupValidation = await api(
      batteryToken,
      `/execution/records/${warmupRecord.id}/validate`,
    );
    if (!warmupValidation.valid) {
      throw new Error(
        `Warmup validation failed: ${JSON.stringify(warmupValidation.reasons)}`,
      );
    }
    const postedWarmup = await api(
      batteryToken,
      `/execution/records/${warmupRecord.id}/post`,
      { method: 'POST', body: '{}' },
    );

    const record = await api(batteryToken, `/execution/service-orders/${order.id}/records`, {
      method: 'POST',
      body: JSON.stringify(
        executionBody({
          orderId: order.id,
          keySuffix: 'main',
          purpose: 'main_fire',
          quantity: 2,
          comment: 'RELEASE-SMOKE перевищення плану підтверджено оператором',
          kit,
          weapon,
          startedAt,
          completedAt,
        }),
      ),
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

    const blockingDraft = await api(
      batteryToken,
      `/execution/service-orders/${order.id}/records`,
      {
        method: 'POST',
        body: JSON.stringify(
          executionBody({
            orderId: order.id,
            keySuffix: 'blocking-draft',
            purpose: 'adjustment',
            quantity: 999999,
            comment: 'RELEASE-SMOKE insufficient stock blocking draft',
            kit,
            weapon,
            startedAt,
            completedAt,
          }),
        ),
      },
    );
    const insufficientValidation = await api(
      batteryToken,
      `/execution/records/${blockingDraft.id}/validate`,
    );
    if (insufficientValidation.valid) {
      throw new Error('Insufficient-stock draft unexpectedly passed validation');
    }
    let insufficientPostMessage = null;
    try {
      await api(batteryToken, `/execution/records/${blockingDraft.id}/post`, {
        method: 'POST',
        body: '{}',
      });
    } catch (error) {
      insufficientPostMessage = error.message;
    }
    if (!insufficientPostMessage?.includes('передвогневу перевірку')) {
      throw new Error(
        `Insufficient stock did not reject post with domain error: ${insufficientPostMessage}`,
      );
    }
    const completionPayload = {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        actualQuantity: 3,
        resultType: 'hit',
        resultComment: 'RELEASE-SMOKE complete with documented deviation',
    };
    let blockingMessage = null;
    try {
      await api(batteryToken, `/service-orders/${order.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(completionPayload),
      });
    } catch (error) {
      blockingMessage = error.message;
    }
    if (!blockingMessage?.includes('Є непроведене виконання')) {
      throw new Error(`Blocking draft did not prevent completion: ${blockingMessage}`);
    }
    await api(batteryToken, `/execution/records/${blockingDraft.id}/cancel`, {
      method: 'POST',
      body: '{}',
    });

    const completed = await api(batteryToken, `/service-orders/${order.id}/complete`, {
      method: 'POST',
      body: JSON.stringify(completionPayload),
    });
    const repeatedComplete = await api(
      batteryToken,
      `/service-orders/${order.id}/complete`,
      {
        method: 'POST',
        body: JSON.stringify(completionPayload),
      },
    );
    if (
      repeatedComplete.status !== 'completed' ||
      Number(repeatedComplete.actualQuantity) !== Number(completed.actualQuantity)
    ) {
      throw new Error('Repeated completion changed the completed result');
    }
    const notifications = await api(batteryToken, '/operational-notifications');

    process.stdout.write(`${JSON.stringify({
      orderId: order.id,
      candidateId: candidate.firePosition.id,
      kitId: kit.shotConfigurationId,
      deliveryId: delivery.id,
      warmupExecutionRecordId: warmupRecord.id,
      warmupStockOperationId: postedWarmup.stockOperationId,
      warmupUsedAlternateKit: warmupKit.shotConfigurationId !== kit.shotConfigurationId,
      executionRecordId: record.id,
      stockOperationId: posted.stockOperationId,
      repeatedPostStockOperationId: repeatedPost.stockOperationId,
      blockingDraftId: blockingDraft.id,
      insufficientValidationReasons: insufficientValidation.reasons,
      insufficientPostMessage,
      blockingCompletionMessage: blockingMessage,
      completedStatus: completed.status,
      actualQuantity: completed.actualQuantity,
      repeatedCompleteStatus: repeatedComplete.status,
      notificationCount: notifications.length,
    }, null, 2)}\n`);
  } finally {
    if (temporaryShotConfigurationId) {
      await api(
        adminToken,
        `/shot-configurations/${temporaryShotConfigurationId}/activate`,
        {
          method: 'POST',
          body: JSON.stringify({ isActive: false }),
        },
      ).catch(() => undefined);
    }
    if (temporaryUserId) {
      await api(adminToken, `/users/${temporaryUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
