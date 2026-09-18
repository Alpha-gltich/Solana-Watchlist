const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

async function main() {
  const keypairPath = path.join(os.homedir(), ".config/solana/id.json");
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")));
  const payer = Keypair.fromSecretKey(secretKey);

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("./watchlist.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const [watchlistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("watchlist"), payer.publicKey.toBuffer()],
    program.programId
  );

  const account = await program.account.watchlist.fetch(watchlistPda);

  console.log("authority:", account.authority.toBase58());
  console.log("telegram_chat_id:", account.telegramChatId.toString());
  console.log("tokens:", account.tokens.map((t) => t.toBase58()));
}

main().catch((err) => {
  console.error("Read failed:", err);
  process.exit(1);
});