#!/usr/bin/env node
// usage: node scripts/entropy-check.mjs [rolls]; live check of the randomness sources: each source's latency and status,
// then that many rolls in one process (the first one fills the pools, the rest draw from them) with the sources that served each.
// Calls random.org at most twice (one quota check, one 256-byte pool), so it stays well inside its per-IP quota.
import { roll } from '../src/entropy.mjs';
const n = Number(process.argv[2] || 8);
const time = async (f) => { const t = performance.now(); try { const r = await f(); return [Math.round(performance.now() - t), r]; } catch (e) { return [Math.round(performance.now() - t), `failed: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`]; } };
const head = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(4000) }); return `${r.status} ${(await r.text()).slice(0, 60).replace(/\s+/g, ' ')}`; };
for (const [name, url] of [
  ['drand (Cloudflare)', 'https://drand.cloudflare.com/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest'],
  ['drand (api.drand.sh)', 'https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest'],
  ['NIST beacon (not used, for reference)', 'https://beacon.nist.gov/beacon/2.0/pulse/last'],
  ['random.org quota', 'https://www.random.org/quota/?format=plain'],
]) { const [ms, r] = await time(() => head(url)); console.log(`${name.padEnd(38)} ${String(ms).padStart(5)} ms  ${r}`); }
for (let i = 1; i <= n; i++) {
  const [ms, r] = await time(roll);
  console.log(`roll ${i}: ${String(ms).padStart(5)} ms  ${r.kind}: ${r.sources.join(', ')}`);
}
process.exit(0);
