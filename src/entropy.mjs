// Where the dice come from. Each roll XORs 32 bytes from every source that answered:
//   LfD QRNG     quantum noise             private, pooled 64 bytes per request (OTH Regensburg's Quantis card, free, no key)
//   drand        League of Entropy beacon  public: anyone can read the same round, so it adds a verifiable source, never secrecy
//   NIST beacon  US-government beacon      public, 512 bits a minute, same rule as drand
//   local CSPRNG crypto.getRandomValues    always in the mix; on its own only when every outside source is down
// XOR of independent sources is uniform if any one of them is, so the mix is at least as random as its best source.
// Every roll reports which sources served it; "csprng only" is the labelled fallback.
// With a pool token (MODEL_SALT_POOL_TOKEN, or on a Mac the Keychain item model-salt.pool / token) the physical bytes come
// from the Model Salt entropy pool, which holds the CPU hardware noise of its server (RDSEED) and LfD QRNG and hands
// each byte out once. Without one, or when the pool doesn't answer, each process fetches from the sources itself.

const LFD = 'https://lfdr.de/qrng_api/qrng?length=64&format=HEX';
// ANU's QRNG left the mix: its free API stopped answering in Oct 2026 and its keyed trial is one person's 100 a month.
const env0 = (typeof process !== 'undefined' && process.env) || {};
let poolUrl = env0.MODEL_SALT_POOL || 'https://entropy.modelsalt.com';
let poolToken = env0.MODEL_SALT_POOL_TOKEN ?? null; // null: not looked up yet
// policy (for a hosted server): a function read at each roll that may say { pool: false } (this roll takes nothing
// from the pool) and { direct: false } (never fetch LfD from this process, only the pool). Left unset, every roll works as before.
let policy = null;
export function configure(env = {}) { // the Worker passes its secrets here
  if (env.MODEL_SALT_POOL) poolUrl = env.MODEL_SALT_POOL;
  if (env.MODEL_SALT_POOL_TOKEN) poolToken = env.MODEL_SALT_POOL_TOKEN;
  if (typeof env.policy === 'function') policy = env.policy;
}
// Codex starts MCP servers with a clean environment, so on a Mac the token is read from the Keychain (no prompt for it).
function token() {
  if (poolToken !== null) return poolToken;
  poolToken = '';
  try {
    if (globalThis.process?.platform !== 'darwin') return poolToken;
    const { execFileSync } = process.getBuiltinModule('node:child_process');
    poolToken = execFileSync('security', ['find-generic-password', '-s', 'model-salt.pool', '-a', 'token', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
  } catch {}
  return poolToken;
}
// One call to the pool: [label, 32 bytes] for each physical source it holds, or null when there is no token or it doesn't answer.
async function fromPool(ms) {
  const t = token();
  if (!t) return null;
  try {
    const r = await fetch(`${poolUrl}/take`, { method: 'POST', headers: { ...UA, authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: JSON.stringify({ n: ROLL, client: 'model-salt' }), signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const j = await r.json();
    const got = Object.entries(j.bytes || {}).filter(([, h]) => h.length === ROLL * 2).map(([k, h]) => [j.labels?.[k] || k, hex(h)]);
    return got.length ? got : null;
  } catch { return null; }
}
const UA = { 'user-agent': 'model-salt/0.6 (+https://modelsalt.com)' };
const ROLL = 32;
const DRAND = ['https://drand.cloudflare.com', 'https://api.drand.sh', 'https://api2.drand.sh'].map((h) => `${h}/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest`);

async function get(url, ms, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r;
}
const hex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)));

// A private true-random pool: refilled by one request at a time, each byte used once.
function pool(name, label, fetchBytes, minGapMs) {
  let bytes = new Uint8Array(0), inflight = null, last = 0, backoff = 0;
  const refill = () => {
    if (inflight || Date.now() < last + minGapMs || Date.now() < backoff) return inflight;
    last = Date.now();
    inflight = fetchBytes()
      .then((b) => { const n = new Uint8Array(bytes.length + b.length); n.set(bytes); n.set(b, bytes.length); bytes = n; })
      .catch((e) => { backoff = Date.now() + (String(e.message).startsWith('quota') ? 600_000 : 60_000); })
      .finally(() => { inflight = null; });
    return inflight;
  };
  return {
    name, label,
    async take(waitMs) {
      if (bytes.length < ROLL) await Promise.race([refill(), new Promise((r) => setTimeout(r, waitMs))]);
      if (bytes.length < ROLL) return null;
      const out = bytes.slice(0, ROLL); bytes = bytes.slice(ROLL);
      if (bytes.length < ROLL * 4) refill(); // top up in the background
      return out;
    },
  };
}

const lfd = pool('lfd', 'LfD QRNG quantum noise (OTH Regensburg)', async () => {
  const j = await (await get(LFD, 2500)).json();
  if (!(typeof j.qrn === 'string' && j.qrn.length === 128)) throw new Error('lfd');
  return hex(j.qrn);
}, 0);

async function drand(ms) {
  for (const url of DRAND) {
    try { const j = await (await get(url, ms)).json(); if (j.randomness) return { round: j.round, bytes: hex(j.randomness) }; } catch {}
  }
  return null;
}

// The NIST Randomness Beacon (since 1.0.4): 512 bits a minute from a US-government lab, offered "as a public
// utility" (csrc.nist.gov/projects/interoperable-randomness-beacons), no key or quota. Public like drand, so it is hashed with
// the local bytes before mixing, and NIST says never to use it alone as a secret. Asked at most once a minute per process.
const NIST = 'https://beacon.nist.gov/beacon/2.0/pulse/last';
let nistHit = { at: 0, v: null };
async function nist(ms) {
  if (nistHit.v && Date.now() - nistHit.at < 60_000) return nistHit.v;
  if (Date.now() - nistHit.at < 60_000) return null; // a failed ask also waits a minute
  nistHit.at = Date.now();
  try {
    const p = (await (await get(NIST, ms)).json()).pulse;
    if (typeof p?.outputValue === 'string' && p.outputValue.length === 128) nistHit.v = { index: p.pulseIndex, bytes: hex(p.outputValue) };
    else nistHit.v = null;
  } catch { nistHit.v = null; }
  return nistHit.v;
}

// Waits at most about 2.5 s for the network; a source that is slower is left out of this roll and refilled behind it.
export async function roll() {
  const local = crypto.getRandomValues(new Uint8Array(ROLL));
  // the pool first; a process with no pool, or one the pool can't serve, asks the sources itself
  const p = policy?.() || {};
  const [pooled, dr, ni] = await Promise.all([p.pool === false ? null : fromPool(2500), drand(800), nist(800)]);
  const physicalBytes = pooled || (p.direct === false ? [] : (await Promise.all([lfd].map(async (src) => [src.label, await src.take(2500)]))).filter(([, b]) => b));
  const out = Uint8Array.from(local);
  const sources = [];
  for (const [label, b] of physicalBytes) { b.forEach((x, i) => (out[i] ^= x)); sources.push(pooled ? `${label} (pool)` : label); }
  if (dr) {
    // the beacon round is public, so it is hashed with the local bytes before mixing: two calls in the same 3 s round still differ
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...dr.bytes, ...local])));
    h.forEach((x, i) => (out[i] ^= x));
    sources.push(`drand beacon round ${dr.round}`);
  }
  if (ni) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...ni.bytes, ...local, 1])));
    h.forEach((x, i) => (out[i] ^= x));
    sources.push(`NIST beacon pulse ${ni.index}`);
  }
  sources.push('local CSPRNG');
  const physical = physicalBytes.length > 0;
  return { bytes: out, sources, physical, via: pooled ? 'pool' : 'direct', kind: physical ? 'physical' : dr || ni ? 'beacon + CSPRNG fallback' : 'CSPRNG only fallback' };
}

// Uniform integers from a roll's bytes by rejection sampling (no modulo bias). 32 bytes cover the word and five dice
// with room to spare; in the rare case they run out, the stream continues with SHA-256 of what came before.
export function reader(bytes) {
  let buf = bytes, i = 0;
  const byte = async () => {
    if (i >= buf.length) { buf = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); i = 0; }
    return buf[i++];
  };
  return async function below(n) {
    const width = n <= 256 ? 1 : n <= 65536 ? 2 : 3;
    const span = 2 ** (8 * width), limit = Math.floor(span / n) * n;
    for (;;) {
      let v = 0;
      for (let k = 0; k < width; k++) v = v * 256 + (await byte());
      if (v < limit) return v % n;
    }
  };
}
