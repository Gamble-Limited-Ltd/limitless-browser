import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { meterPct, level, pushQuery, cpuPeaks } from '../../scripts/lib/vpsmeter.mjs';

test('both directions count, 5 TB limit', () => {
  assert.equal(meterPct({ rx: 1.75e12, tx: 1.75e12 }), 70);
});
test('levels at 70 and 90', () => {
  assert.deepEqual(['ok', 'ok', 'warn', 'warn', 'crit'], [level(0), level(69.9), level(70), level(89.9), level(90)]);
});
test('push: up below 70, down with level in the message above', () => {
  assert.equal(pushQuery({ month: '2026-11', rx: 1e9, tx: 1e9 }).status, 'up');
  const q = pushQuery({ month: '2026-11', rx: 2.3e12, tx: 2.3e12 });
  assert.equal(q.status, 'down');
  assert.equal(q.msg, 'crit: 2026-11 transfer 4600 GB of 5000 GB, 92.0 percent');
});
test('cpu peaks per container', () => {
  const p = cpuPeaks([{ containers: [{ n: 'relay', cpu: 10, memMb: 50 }] }, { containers: [{ n: 'relay', cpu: 30, memMb: 70 }, { n: 'dns', cpu: null, memMb: 5 }] }]);
  assert.deepEqual(p.relay, { peak: 30, memMbPeak: 70, avg: 20 });
  assert.equal(p.dns.avg, null);
});

test('sample.sh: accumulates both directions, survives a counter reset and a month change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samp-'));
  const nd = path.join(dir, 'netdev'), ds = path.join(dir, 'stats');
  fs.writeFileSync(ds, 'relay|12.5%|40.5MiB / 1.9GiB\n');
  fs.writeFileSync(path.join(dir, 'mem'), 'MemTotal: 2048000 kB\nMemAvailable: 1024000 kB\n');
  const run = (rx, tx, now) => {
    fs.writeFileSync(nd, `Inter-|\n face |\n  eth0: ${rx} 1 0 0 0 0 0 0 ${tx} 1 0 0 0 0 0 0\n`);
    execFileSync(path.resolve('deploy/relay-vps/sample.sh'), { env: { ...process.env, LB_SAMPLE_DIR: path.join(dir, 'out'), LB_NETDEV: nd, LB_MEMINFO: path.join(dir, 'mem'), LB_DOCKER_STATS: ds, LB_IFACE: 'eth0', LB_NOW: now } });
    return JSON.parse(fs.readFileSync(path.join(dir, 'out/meter.json'), 'utf8'));
  };
  assert.deepEqual([run(1000, 500, '2026-11-20T10:00:00Z').rx, run(1600, 900, '2026-11-20T10:01:00Z').tx], [0, 400]);
  const rst = run(50, 20, '2026-11-20T10:02:00Z'); // reboot: counters restart
  assert.deepEqual([rst.rx, rst.tx], [650, 420]);
  const nov = run(150, 70, '2026-12-01T00:00:00Z'); // new month starts from zero, first delta of a month counts
  assert.deepEqual([nov.month, nov.rx, nov.tx], ['2026-12', 100, 50]);
  const last = JSON.parse(fs.readFileSync(path.join(dir, 'out/samples.jsonl'), 'utf8').trim().split('\n').at(-1));
  assert.deepEqual([last.memAvailMb, last.containers[0]], [1000, { n: 'relay', cpu: 12.5, memMb: 40 }]);
});
