const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

async function main() {
  const keypairPath = path.join(os.homedir(), ".config/solana/id.json");
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")));
  const payer = Keypair.fromSecretKey(secretKey);

  console.log("Using wallet:", payer.publicKey.toBase58());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("./watchlist.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const fakeMint = Keypair.generate().publicKey;
  const telegramChatId = new anchor.BN("999999999");

  const [watchlistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("watchlist"), payer.publicKey.toBuffer()],
    program.programId
  );

  console.log("Watchlist PDA:", watchlistPda.toBase58());
  console.log("Calling add_token with mint:", fakeMint.toBase58(), "chat_id:", telegramChatId.toString());

  const txSig = await program.methods
    .addToken(fakeMint, telegramChatId)
    .accounts({
      payer: payer.publicKey,
      watchlist: watchlistPda,
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    })
    .rpc();

  console.log("Transaction signature:", txSig);
  console.log("Explorer link: https://explorer.solana.com/tx/" + txSig + "?cluster=devnet");

  const account = await program.account.watchlist.fetch(watchlistPda);

  console.log("\n--- Watchlist account read back ---");
  console.log("authority:", account.authority.toBase58());
  console.log("telegram_chat_id:", account.telegramChatId.toString());
  console.log("tokens:", account.tokens.map((t) => t.toBase58()));
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});