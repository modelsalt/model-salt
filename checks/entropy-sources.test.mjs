// The roll's sources after 1.0.3: random.org is gone (its free terms don't cover a public service), the
// NIST beacon is mixed in like drand (public, hashed with local bytes, asked at most once a minute).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roll, configure } from '../src/entropy.mjs';

const PULSE = { pulse: { pulseIndex: 42, outputValue: 'ab'.repeat(64) } };
test('a roll names the NIST beacon, never calls random.org, and asks NIST once a minute', async () => {
  const seen = [], real = globalThis.fetch;
  globalThis.fetch = async (u) => {
    seen.push(String(u));
    if (String(u).includes('beacon.nist.gov')) return new Response(JSON.stringify(PULSE));
    throw new Error('offline');
  };
  try {
    configure({ MODEL_SALT_POOL_TOKEN: 'x', policy: () => ({ pool: false, direct: true }) });
    const a = await roll(), b = await roll();
    assert.ok(a.sources.includes('NIST beacon pulse 42'), a.sources.join());
    assert.equal(a.kind, 'beacon + CSPRNG fallback');
    assert.notDeepEqual(a.bytes, b.bytes, 'the same pulse still gives a different roll');
    assert.equal(seen.filter((u) => u.includes('beacon.nist.gov')).length, 1);
    assert.ok(!seen.some((u) => /random\.org/.test(u)), seen.join());
    assert.ok(seen.some((u) => u.includes('lfdr.de')), 'LfD is still asked directly when there is no pool');
  } finally { globalThis.fetch = real; }
});
