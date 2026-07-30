const fs = require('fs');
const jwt = require('jsonwebtoken');
const { io } = require(process.env.SECURITY_SOCKET_CLIENT_PATH);

const baseUrl = process.env.SECURITY_BASE_URL || 'http://127.0.0.1:3100';
const credentials = JSON.parse(fs.readFileSync(process.env.SECURITY_ADMIN_FILE, 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(process.env.SECURITY_FIXTURES_FILE, 'utf8'));
const results = [];

async function api(method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function login(loginName, password) {
  return (await api('POST', '/auth/login', { login: loginName, password })).body
    .accessToken;
}

function connect(options) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 2_000,
      ...options,
    });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('connection timeout'));
    }, 3_000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });
  });
}

async function isRejected(options) {
  try {
    const socket = await connect(options);
    socket.close();
    return false;
  } catch {
    return true;
  }
}

async function run() {
  const adminToken = await login(credentials.login, credentials.password);
  const batteryAToken = await login(
    'release_preflight_battery',
    'PreflightBattery1!',
  );
  const suffix = Date.now().toString(36);
  const divisionB = (
    await api(
      'POST',
      '/units',
      { name: `SECURITY-WS-DIV-${suffix}`, type: 'division' },
      adminToken,
    )
  ).body;
  const batteryB = (
    await api(
      'POST',
      '/units',
      {
        name: `SECURITY-WS-BAT-${suffix}`,
        type: 'battery',
        parentId: divisionB.id,
      },
      adminToken,
    )
  ).body;
  const userBPassword = 'SecurityOnly123!';
  const userB = (
    await api(
      'POST',
      '/users',
      {
        login: `security_ws_b_${suffix}`,
        password: userBPassword,
        role: 'operator',
        scope: 'battery',
        unitId: batteryB.id,
        isActive: true,
      },
      adminToken,
    )
  ).body;
  const tokenB = await login(userB.login, userBPassword);

  results.push({
    label: 'anonymous rejected before connect',
    pass: await isRejected({ auth: {} }),
  });
  results.push({
    label: 'query token rejected',
    pass: await isRejected({ query: { token: adminToken } }),
  });
  const expiredToken = jwt.sign(
    {
      sub: credentials.userId || 'expired-user',
      role: 'admin',
      scope: 'main',
    },
    process.env.SECURITY_JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: 'euclida-core',
      audience: 'euclida-clients',
      expiresIn: -1,
    },
  );
  results.push({
    label: 'expired JWT rejected',
    pass: await isRejected({ auth: { token: expiredToken } }),
  });

  const socketA = await connect({ auth: { token: batteryAToken } });
  const socketB = await connect({ auth: { token: tokenB } });
  const eventsA = [];
  const eventsB = [];
  socketA.on('realtime:event', (event) => eventsA.push(event));
  socketB.on('realtime:event', (event) => eventsB.push(event));

  await api(
    'POST',
    `/weapon-systems/${fixtures.w1.id}/readiness/confirm`,
    { readinessStatus: 'combat_ready' },
    adminToken,
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  results.push({
    label: 'own battery receives scoped event',
    pass: eventsA.length > 0,
    count: eventsA.length,
  });
  results.push({
    label: 'sibling battery receives no scoped event',
    pass: eventsB.length === 0,
    count: eventsB.length,
  });
  const eventKeys = eventsA.map((event) =>
    [
      event.scope,
      event.entity,
      event.id,
      event.action,
      event.reason,
    ].join('|'),
  );
  results.push({
    label: 'no duplicate event after one mutation',
    pass: new Set(eventKeys).size === eventKeys.length,
  });

  await api('DELETE', `/users/${userB.id}`, undefined, adminToken);
  await new Promise((resolve) => setTimeout(resolve, 300));
  results.push({
    label: 'archived user socket disconnected',
    pass: socketB.disconnected,
  });

  socketA.close();
  socketB.close();
  const summary = {
    total: results.length,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass),
  };
  fs.writeFileSync(
    process.env.SECURITY_OUTPUT_FILE,
    JSON.stringify({ summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
