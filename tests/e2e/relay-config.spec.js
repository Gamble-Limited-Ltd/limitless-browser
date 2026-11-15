// @ts-check
// Prod relay config must keep refusing non-global destinations; the test-only fixture config may allow only the fixture subnet.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const key = (toml, k) => (toml.match(new RegExp(`^${k}\\s*=\\s*(\\S+)`, 'm')) || [])[1];

test('prod relay config.toml still has allow_non_global = false and no host overrides', () => {
  const prod = read('deploy/relay/config.toml');
  expect(key(prod, 'allow_non_global')).toBe('false');
  expect(prod).not.toMatch(/^allow_hosts\s*=/m);
  expect(read('deploy/relay/Dockerfile')).toContain('COPY config.toml /etc/epoxy/config.toml');
  // The rehearsal override must be opt-in (speed run) and never referenced from the prod compose file.
  expect(read('deploy/docker-compose.yml')).not.toContain('relay-fixtures');
});

test('fixture relay config allows non-global but blocks every private literal except 10.89.85.0/24', () => {
  const t = read('deploy/rehearsal/relay-fixtures.toml');
  expect(key(t, 'allow_non_global')).toBe('true');
  const rx = [...t.matchAll(/^\s*'(\^[^']+)',?$/gm)].map((m) => new RegExp(m[1]));
  expect(rx.length).toBeGreaterThan(4);
  const blocked = (h) => rx.some((r) => r.test(h));
  for (const h of ['127.0.0.1', '0.0.0.0', '169.254.169.254', '192.168.1.1', '172.16.0.1', '172.31.255.1', '100.64.0.1',
    '10.0.0.1', '10.88.80.1', '10.89.80.1', '10.89.84.5', '10.89.86.1', '10.89.0.1', '10.90.85.10', '10.1.1.59']) {
    expect(blocked(h), h).toBe(true);
  }
  for (const h of ['10.89.85.10', '10.89.85.1', '10.89.85.254', '1.1.1.1', '93.184.216.34', '172.32.0.1', 'example.com']) {
    expect(blocked(h), h).toBe(false);
  }
});

test('0.3.0: relay and dns are compose profile relay, the gate does not require the relay, the network stays', () => {
  const c = read('deploy/docker-compose.yml');
  const svc = (n) => (c.match(new RegExp(`^  ${n}:\\n([\\s\\S]*?)(?=^  \\w|^networks:)`, 'm')) || [])[1] || '';
  expect(svc('relay')).toMatch(/profiles: \["relay"\]/);
  expect(svc('dns')).toMatch(/profiles: \["relay"\]/);
  expect(svc('lbgate')).toMatch(/relay:\n\s+condition: service_started\n\s+required: false/);
  expect(svc('lbgate')).toContain('RELAY_URL: ws://relay:4000/');
  expect(svc('lbgate')).toContain('lb_relay');
  expect(svc('web')).not.toContain('profiles');
});
