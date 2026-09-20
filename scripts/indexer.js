const fs = require("fs");
const path = require("path");
const { Connection, PublicKey } = require("@solana/web3.js");

// --- RPC endpoint: no fallback, fail loudly ---------------------------------
const RPC_URL = process.env.ALCHEMY_DEVNET_URL;
if (!RPC_URL || !RPC_URL.startsWith("https://") || !RPC_URL.includes("devnet")) {
  throw new Error(
    "ALCHEMY_DEVNET_URL is missing or is not an https devnet endpoint. " +
      "Run from the repo root: node --env-file=.env scripts/indexer.js"
  );
}

// --- Secret scrubbing ---------------------------------------------------------
// The API key is the last path segment of the RPC URL. Any error text that might
// contain the URL or the key goes through scrub() before it is printed.
const RPC_KEY = new URL(RPC_URL).pathname.split("/").filter(Boolean).pop() || "";

function scrub(value) {
  let text = String(value);
  text = text.split(RPC_URL).join("[RPC_URL]");
  if (RPC_KEY) text = text.split(RPC_KEY).join("[KEY]");
  return text;
}

// Node's fetch reports just "fetch failed"; the real reason lives in err.cause.
function describeError(err) {
  const cause = err && err.cause;
  const code = cause && (cause.code || cause.name);
  return scrub((err && err.message) || err) + (code ? ` [cause: ${scrub(code)}]` : "");
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", scrub((reason && reason.stack) || reason));
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", scrub((err && err.stack) || err));
  process.exit(1);
});

// --- Constants ----------------------------------------------------------------
const SPL_TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const POLL_INTERVAL_MS = 5_000;
const STATS_EVERY_MS = 30_000;
const NO_SUCCESS_LIMIT_MS = 60_000; // no successful poll for this long: exit loudly
const MINT_ACCOUNT_SIZE = 82; // SPL Token Mint account layout
const MAX_KEYS_PER_CALL = 100; // getMultipleAccounts limit

// Anchored to this file's folder, not the directory node was launched from.
const WATCHED_MINTS_FILE = path.join(__dirname, "watched_mints.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadWatchedMints() {
  if (!fs.existsSync(WATCHED_MINTS_FILE)) {
    throw new Error("watched_mints.json not found at " + WATCHED_MINTS_FILE);
  }
  const list = JSON.parse(fs.readFileSync(WATCHED_MINTS_FILE, "utf8"));
  if (!Array.isArray(list)) {
    throw new Error("watched_mints.json must be a JSON array of mint addresses");
  }
  return [...new Set(list)].map((address) => {
    try {
      return { address, key: new PublicKey(address) };
    } catch {
      throw new Error("Invalid mint address in watched_mints.json: " + address);
    }
  });
}

// --- Mint account parsing -----------------------------------------------------
// Mint layout (82 bytes):
//   0..36   mint_authority   COption<Pubkey>  (4-byte tag + 32-byte key)
//   36..44  supply           u64
//   44      decimals         u8
//   45      is_initialized   u8
//   46..82  freeze_authority COption<Pubkey>
function readOptionalKey(data, tagOffset) {
  const tag = data.readUInt32LE(tagOffset);
  if (tag === 0) return null; // authority revoked / not set
  if (tag !== 1) throw new Error("bad COption tag " + tag);
  return new PublicKey(data.subarray(tagOffset + 4, tagOffset + 36)).toBase58();
}

function parseMint(account) {
  if (!account.owner.equals(SPL_TOKEN_PROGRAM)) {
    throw new Error("owner is not the SPL Token program (Token-2022 is not supported)");
  }
  const data = account.data;
  if (data.length !== MINT_ACCOUNT_SIZE) {
    throw new Error(`unexpected account size ${data.length}, expected ${MINT_ACCOUNT_SIZE}`);
  }
  if (data[45] !== 1) throw new Error("mint is not initialized");
  return {
    mintAuthority: readOptionalKey(data, 0),
    freezeAuthority: readOptionalKey(data, 46),
  };
}

// --- State ---------------------------------------------------------------------
const state = new Map(); // mint address -> { mintAuthority, freezeAuthority }
const warnedUnreadable = new Set(); // report an unreadable mint once, not every poll
const stats = { polls: 0, failed: 0, alerts: 0 };
let highestSlot = 0;
let lastSuccessAt = Date.now();

// Reads all watched mints. Rejects responses older than a slot we've already seen,
// because a load-balanced RPC can hand back a lagging node's older state, which
// would look like an authority change reverting.
async function fetchAccounts(connection, mints) {
  const results = new Map();
  const minSlot = highestSlot;
  for (let i = 0; i < mints.length; i += MAX_KEYS_PER_CALL) {
    const chunk = mints.slice(i, i + MAX_KEYS_PER_CALL);
    const config = { commitment: "confirmed" };
    if (minSlot) config.minContextSlot = minSlot;
    const res = await connection.getMultipleAccountsInfoAndContext(
      chunk.map((m) => m.key),
      config
    );
    if (res.context.slot < minSlot) {
      throw new Error(`stale response (slot ${res.context.slot} < ${minSlot})`);
    }
    highestSlot = Math.max(highestSlot, res.context.slot);
    chunk.forEach((m, idx) => results.set(m.address, res.value[idx]));
  }
  return results;
}

function describeAuthority(value) {
  return value === null ? "none" : value;
}

function raiseAlert(mintAddress, changes) {
  stats.alerts++;
  console.log("\n🚨 ALERT: Authority change on watched mint!");
  console.log("Mint:", mintAddress);
  for (const change of changes) console.log("  -", change);
  console.log("Detected:", new Date().toISOString());
  console.log(`Explorer: https://explorer.solana.com/address/${mintAddress}?cluster=devnet\n`);
}

const FIELDS = [
  ["mintAuthority", "Mint authority"],
  ["freezeAuthority", "Freeze authority"],
];

// isBaseline: the first read must succeed for every mint, or we crash. After that,
// an unreadable mint is reported once and skipped until it becomes readable again.
function applyAccounts(mints, accounts, isBaseline) {
  for (const m of mints) {
    let current;
    try {
      const account = accounts.get(m.address);
      if (!account) throw new Error("account not found on this cluster");
      current = parseMint(account);
    } catch (err) {
      if (isBaseline) {
        throw new Error(`Cannot read watched mint ${m.address}: ${err.message}`);
      }
      if (!warnedUnreadable.has(m.address)) {
        warnedUnreadable.add(m.address);
        console.error("MINT UNREADABLE:", m.address, err.message);
      }
      continue;
    }
    warnedUnreadable.delete(m.address);

    const previous = state.get(m.address);
    if (previous) {
      const changes = [];
      for (const [field, label] of FIELDS) {
        if (previous[field] !== current[field]) {
          changes.push(
            `${label}: ${describeAuthority(previous[field])} -> ${describeAuthority(current[field])}`
          );
        }
      }
      if (changes.length > 0) raiseAlert(m.address, changes);
    }
    state.set(m.address, current);
  }
}

async function main() {
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true, // failures are counted and printed by this script
  });
  const mints = loadWatchedMints();
  if (mints.length === 0) {
    throw new Error("watched_mints.json is empty, nothing to monitor");
  }

  // Host only. The API key lives in the URL path and must never be logged.
  console.log("HTTP host:", new URL(RPC_URL).host);
  console.log(`Watching ${mints.length} mint(s), polling every ${POLL_INTERVAL_MS / 1000}s.`);

  applyAccounts(mints, await fetchAccounts(connection, mints), true);
  lastSuccessAt = Date.now();

  console.log("Baseline recorded:");
  for (const m of mints) {
    const s = state.get(m.address);
    console.log(
      `  ${m.address}  mint authority: ${describeAuthority(s.mintAuthority)}  ` +
        `freeze authority: ${describeAuthority(s.freezeAuthority)}`
    );
  }
  console.log("Monitoring for authority changes...\n");

  let lastStatsAt = Date.now();
  while (true) {
    await sleep(POLL_INTERVAL_MS);
    try {
      applyAccounts(mints, await fetchAccounts(connection, mints), false);
      stats.polls++;
      lastSuccessAt = Date.now();
    } catch (err) {
      stats.failed++;
      console.error("POLL FAILED:", describeError(err));
    }

    const now = Date.now();
    if (now - lastSuccessAt > NO_SUCCESS_LIMIT_MS) {
      console.error(
        `WATCHDOG: no successful poll for ${Math.round((now - lastSuccessAt) / 1000)}s. Exiting.`
      );
      process.exit(1);
    }
    if (now - lastStatsAt >= STATS_EVERY_MS) {
      lastStatsAt = now;
      console.log(
        `[stats] polls=${stats.polls} failed=${stats.failed} alerts=${stats.alerts} slot=${highestSlot}`
      );
    }
  }
}

main().catch((err) => {
  console.error("Indexer failed:", scrub((err && err.stack) || err));
  process.exit(1);
});