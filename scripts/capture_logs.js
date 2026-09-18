const { Connection, PublicKey } = require("@solana/web3.js");

const SPL_TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  console.log("Subscribing to SPL Token Program logs on devnet...");
  console.log("Will print the first 10 log entries, then exit.\n");

  let count = 0;
  const MAX_SAMPLES = 10;

  const subscriptionId = connection.onLogs(
    SPL_TOKEN_PROGRAM,
    (logInfo, ctx) => {
      count++;
      console.log(`--- Sample ${count} ---`);
      console.log("signature:", logInfo.signature);
      console.log("err:", logInfo.err);
      console.log("logs:", logInfo.logs);
      console.log("");

      if (count >= MAX_SAMPLES) {
        connection.removeOnLogsListener(subscriptionId).then(() => {
          console.log("Captured", MAX_SAMPLES, "samples. Exiting.");
          process.exit(0);
        });
      }
    },
    "confirmed"
  );

  // Safety timeout in case devnet is quiet
  setTimeout(() => {
    console.log("\nTimed out after 60s. Captured", count, "samples.");
    process.exit(0);
  }, 60000);
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});