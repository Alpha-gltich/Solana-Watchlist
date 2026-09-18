const { Connection, PublicKey } = require("@solana/web3.js");
const fs = require("fs");

const SPL_TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SET_AUTHORITY_DISCRIMINATOR = 6; // SPL Token instruction enum: SetAuthority = 6

// Load watched mints from a simple local JSON file for now.
// (Later this reads from your on-chain Watchlist PDAs instead.)
const WATCHED_MINTS_FILE = "./watched_mints.json";

function loadWatchedMints() {
  if (!fs.existsSync(WATCHED_MINTS_FILE)) {
    fs.writeFileSync(WATCHED_MINTS_FILE, JSON.stringify([], null, 2));
  }
  const raw = fs.readFileSync(WATCHED_MINTS_FILE, "utf8");
  return new Set(JSON.parse(raw));
}

// Tracks signatures we've already processed, to avoid double-firing
// alerts on WebSocket reconnect/resend (per our reconnect-safety design).
const seenSignatures = new Set();

function decodeInstructionData(dataBase58) {
  // SPL Token instruction data uses base58 in JSON-parsed responses' "data" field
  // when encoding isn't jsonParsed for that instruction; jsonParsed usually gives
  // a structured object instead. We handle both cases defensively below.
  try {
    const bs58 = require("bs58");
    return bs58.decode(dataBase58);
  } catch (e) {
    return null;
  }
}

async function checkTransactionForSetAuthority(connection, signature, watchedMints) {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx) return null;

  const allInstructions = [];

  // Top-level instructions
  for (const ix of tx.transaction.message.compiledInstructions || []) {
    allInstructions.push(ix);
  }

  // Inner instructions (CPI calls)
  if (tx.meta && tx.meta.innerInstructions) {
    for (const innerSet of tx.meta.innerInstructions) {
      for (const ix of innerSet.instructions) {
        allInstructions.push(ix);
      }
    }
  }

  const accountKeys = tx.transaction.message.staticAccountKeys.map((k) => k.toBase58());

  for (const ix of allInstructions) {
    const programId = accountKeys[ix.programIdIndex];
    if (programId !== SPL_TOKEN_PROGRAM.toBase58()) continue;

    const dataBytes = decodeInstructionData(ix.data);
    if (!dataBytes || dataBytes.length === 0) continue;

    const discriminator = dataBytes[0];
    if (discriminator !== SET_AUTHORITY_DISCRIMINATOR) continue;

    // Instruction 0 (the account list index) is conventionally the mint
    // being modified for SetAuthority. Confirm against your program's
    // actual account ordering when you test this live.
    const mintAccountIndex = ix.accountKeyIndexes ? ix.accountKeyIndexes[0] : ix.accounts[0];
    const mintAddress = accountKeys[mintAccountIndex];

    if (watchedMints.has(mintAddress)) {
      return { signature, mintAddress, programId };
    }
  }

  return null;
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const watchedMints = loadWatchedMints();

  console.log("Watching", watchedMints.size, "mint(s) for SetAuthority events.");
  console.log("Subscribed to SPL Token Program logs on devnet...\n");

  connection.onLogs(
    SPL_TOKEN_PROGRAM,
    async (logInfo) => {
      if (logInfo.err) return; // ignore failed transactions
      if (seenSignatures.has(logInfo.signature)) return; // de-dup on reconnect
      seenSignatures.add(logInfo.signature);

      try {
        const result = await checkTransactionForSetAuthority(
          connection,
          logInfo.signature,
          watchedMints
        );
        if (result) {
          console.log("\n🚨 ALERT: SetAuthority detected on watched mint!");
          console.log("Mint:", result.mintAddress);
          console.log("Signature:", result.signature);
          console.log(
            "Explorer:",
            `https://explorer.solana.com/tx/${result.signature}?cluster=devnet`
          );
        }
      } catch (err) {
        console.error("Error checking transaction", logInfo.signature, err.message);
      }
    },
    "confirmed"
  );
}

main().catch((err) => {
  console.error("Indexer failed:", err);
  process.exit(1);
});