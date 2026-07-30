const fs = require('fs');

const baseUrl = process.env.SECURITY_BASE_URL || 'http://127.0.0.1:3100';
const credentials = JSON.parse(
  fs.readFileSync(process.env.SECURITY_ADMIN_FILE, 'utf8'),
);
const fixtures = JSON.parse(
  fs.readFileSync(process.env.SECURITY_FIXTURES_FILE, 'utf8'),
);
const outputFile = process.env.SECURITY_OUTPUT_FILE;
const results = [];

async function request(label, method, path, body, token, expected) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}
  const pass = expected.includes(response.status);
  results.push({
    label,
    status: response.status,
    expected,
    pass,
    response: pass ? undefined : payload,
  });
  return { status: response.status, payload };
}

async function login(login, password) {
  const result = await request(
    `login:${login}`,
    'POST',
    '/auth/login',
    { login, password },
    null,
    [200, 201],
  );
  return result.payload.accessToken;
}

async function run() {
  await request('unauthorized read', 'GET', '/service-orders', undefined, null, [401]);
  const adminToken = await login(credentials.login, credentials.password);
  const suffix = Date.now().toString(36);

  const divisionB = (
    await request(
      'create sibling division',
      'POST',
      '/units',
      { name: `SECURITY-RC7-DIV-B-${suffix}`, type: 'division', sortOrder: 90 },
      adminToken,
      [200, 201],
    )
  ).payload;
  const batteryB = (
    await request(
      'create sibling battery',
      'POST',
      '/units',
      {
        name: `SECURITY-RC7-BAT-B-${suffix}`,
        type: 'battery',
        parentId: divisionB.id,
        sortOrder: 91,
      },
      adminToken,
      [200, 201],
    )
  ).payload;
  const userBLogin = `security_rc7_b_${suffix}`;
  const userBPassword = 'SecurityOnly123!';
  const userB = (
    await request(
      'create sibling operator',
      'POST',
      '/users',
      {
        login: userBLogin,
        password: userBPassword,
        fullName: 'SECURITY RC7 B',
        role: 'operator',
        scope: 'battery',
        unitId: batteryB.id,
        isActive: true,
      },
      adminToken,
      [200, 201],
    )
  ).payload;
  const userBToken = await login(userBLogin, userBPassword);
  const batteryAToken = await login(
    'release_preflight_battery',
    'PreflightBattery1!',
  );

  await request(
    'battery A cannot read battery B',
    'GET',
    `/units/${batteryB.id}`,
    undefined,
    batteryAToken,
    [403, 404],
  );
  await request(
    'battery A cannot create foreign depot',
    'POST',
    '/depots',
    {
      name: `SECURITY-RC7-FOREIGN-${suffix}`,
      unitId: batteryB.id,
      depotType: 'battery_ammo',
    },
    batteryAToken,
    [403, 404],
  );
  await request(
    'protected fields rejected',
    'POST',
    '/service-orders',
    {
      orderNumber: `SECURITY-RC7-MASS-${suffix}`,
      targetLat: 50.45,
      targetLng: 30.52,
      taskType: 'fire',
      plannedQuantity: 1,
      status: 'completed',
      postedByUserId: userB.id,
      createdAt: new Date().toISOString(),
    },
    adminToken,
    [400],
  );
  const malformed = await request(
    'malformed UUID normalized',
    'GET',
    '/service-orders/not-a-uuid',
    undefined,
    adminToken,
    [400],
  );
  const malformedText = JSON.stringify(malformed.payload);
  results.push({
    label: 'malformed UUID does not leak stack or constraint',
    status: malformed.status,
    expected: [400],
    pass: !/(stack|QueryFailed|constraint|relation|column)/i.test(malformedText),
  });
  await request(
    'SQL payload remains data',
    'GET',
    `/event-logs?search=${encodeURIComponent(`%' OR 1=1;--`)}`,
    undefined,
    adminToken,
    [200],
  );

  const observerLogin = `security_rc7_observer_${suffix}`;
  const observerPassword = 'SecurityOnly123!';
  await request(
    'create observer',
    'POST',
    '/users',
    {
      login: observerLogin,
      password: observerPassword,
      role: 'operator',
      scope: 'battery',
      unitId: fixtures.bat.id,
      isActive: true,
    },
    adminToken,
    [200, 201],
  );
  const observerToken = await login(observerLogin, observerPassword);
  const observerUser = (
    await request(
      'find observer',
      'GET',
      '/users',
      undefined,
      adminToken,
      [200],
    )
  ).payload.find((item) => item.login === observerLogin);
  results.push({
    label: 'user responses omit password hashes',
    status: 200,
    expected: [200],
    pass: observerUser && !('passwordHash' in observerUser),
  });
  await request(
    'change issued-token role to observer',
    'PATCH',
    `/users/${observerUser.id}`,
    { role: 'observer' },
    adminToken,
    [200],
  );
  await request(
    'changed role blocks old-token mutation',
    'POST',
    '/service-orders',
    {
      orderNumber: `SECURITY-RC7-OBSERVER-${suffix}`,
      targetLat: 50.45,
      targetLng: 30.52,
      taskType: 'fire',
      plannedQuantity: 1,
    },
    observerToken,
    [403],
  );

  await request(
    'archive authenticated user',
    'DELETE',
    `/users/${userB.id}`,
    undefined,
    adminToken,
    [200, 204],
  );
  await request(
    'archived user old token rejected',
    'GET',
    '/service-orders',
    undefined,
    userBToken,
    [401],
  );

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await request(
      `login rate attempt ${attempt}`,
      'POST',
      '/auth/login',
      { login: `missing_${suffix}`, password: 'wrong' },
      null,
      attempt === 6 ? [429] : [401],
    );
  }

  const allowedPreflight = await fetch(`${baseUrl}/service-orders`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://127.0.0.1:8944',
      'access-control-request-method': 'GET',
    },
  });
  results.push({
    label: 'allowed CORS preflight',
    status: allowedPreflight.status,
    expected: [204],
    pass:
      allowedPreflight.status === 204 &&
      allowedPreflight.headers.get('access-control-allow-origin') ===
        'http://127.0.0.1:8944',
  });
  const deniedPreflight = await fetch(`${baseUrl}/service-orders`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://192.168.1.77:8944',
      'access-control-request-method': 'GET',
    },
  });
  results.push({
    label: 'foreign LAN CORS denied',
    status: deniedPreflight.status,
    expected: [400, 500],
    pass:
      deniedPreflight.headers.get('access-control-allow-origin') === null,
  });

  const summary = {
    total: results.length,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass),
  };
  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify({ summary, results }, null, 2));
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
