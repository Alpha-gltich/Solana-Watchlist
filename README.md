# Aegis

Aegis watches Solana token mints and sends a Telegram message when a mint's **mint authority** or **freeze authority** changes. Devnet only.

Why it matters: whoever holds the mint authority can create new supply, and whoever holds the freeze authority can freeze holders' balances. A change to either is worth knowing about immediately.

Built for the Colosseum Crypto World's Fair hackathon (September 2026).

## What it does

- Polls the watched mint accounts every 5 seconds over HTTP RPC.
- Compares each mint's mint authority and freeze authority with the last state it saw.
- On a change (revoked, set, or moved to another address) it prints an alert in the terminal and sends it to Telegram with an Explorer link.
- Retries failed Telegram sends (4 attempts, 5 second timeout each). A failed send is reported loudly in the terminal and never stops the monitor.
- Scrubs the RPC key and the bot token from every printed error.

## Verified

Tested live on devnet with fresh test mints, with the alert confirmed arriving on a phone:

- mint authority revoked
- freeze authority revoked
- freeze authority moved to a different address

Telegram delivery was tested on a network with intermittent timeouts. The retry logic recovered the send in those runs.

Not tested yet:

- mint authority moved to a different address (same code path as freeze authority)
- watching more than one mint at once
- Token-2022 mints (rejected by design, see limits)

## Known limits

- Polling every 5 seconds. End-to-end alert latency has not been measured.
- The baseline lives in memory only. Authority changes made while the monitor is down are missed.
- Alerts do not include a transaction signature. They link to the mint on Solana Explorer instead.
- Classic SPL Token mints only. Token-2022 mints are rejected.
- The watchlist is read from `scripts/watched_mints.json`, **not** from the on-chain program in this repo (see Part 2).
- One Telegram chat ID, set in `.env`.
- If all 4 Telegram attempts fail, that alert is lost. There is no persistent queue. The terminal alert still prints.
- Devnet only.
- If no poll succeeds for 60 seconds the monitor exits. A failed startup read is retried up to 6 times before giving up.

## Quickstart

Requirements: Node 20.6 or newer (uses `--env-file`; developed on v24), a Solana devnet RPC URL that starts with `https://` and contains `devnet` (tested with Alchemy), and a Telegram account. To create test mints you also need the Solana CLI and `spl-token`.

1. Clone and install (dependencies live in `scripts/`, not the repo root):
```
   git clone https://github.com/Alpha-gltich/Solana-Watchlist.git
   cd Solana-Watchlist
   npm install --prefix scripts
```
2. Create a `.env` file in the repo root (it is gitignored). Never commit it:
```
   ALCHEMY_DEVNET_URL=<your https devnet RPC URL>
   TELEGRAM_BOT_TOKEN=<token from BotFather>
   TELEGRAM_CHAT_ID=<your numeric chat id>
```
3. Create a Telegram bot: message @BotFather, send `/newbot`, and put the token in `.env`. Open your new bot, press Start, and send it "hi". Then run:
```
   node --env-file=.env scripts/telegram_setup.js
```
   It prints your chat ID and sends a test message. Put the printed `TELEGRAM_CHAT_ID=...` line in `.env`. If it fails with `ETIMEDOUT`, retry with `node --dns-result-order=ipv4first --env-file=.env scripts/telegram_setup.js`.
4. Choose what to watch. Put mint addresses in `scripts/watched_mints.json` as a JSON array:
```
   ["<MINT_ADDRESS>"]
```
   To make a test mint that has both authorities: `spl-token create-token --enable-freeze --url devnet`
5. Start the monitor. A "started" message should arrive on Telegram:
```
   node --env-file=.env scripts/indexer.js
```
6. Trigger an alert from another terminal:
```
   spl-token authorize <MINT_ADDRESS> freeze --disable --url devnet
```

The monitor reads `watched_mints.json` once at startup. Restart it after editing the file.

## How it works

Every 5 seconds, `scripts/indexer.js` calls `getMultipleAccounts` (confirmed commitment) for all watched mints, parses the 82-byte SPL Token mint layout, and compares both authority fields against the previous state. Responses from a slot older than one already seen are rejected, because a lagging RPC node could otherwise make a change look like it reverted.

The first design filtered token program logs for SetAuthority. On devnet those logs contain no instruction names, so it could never fire. Aegis now compares on-chain account state instead. There is no WebSocket in the design, because Alchemy's devnet endpoint rejected `logsSubscribe`.

## Files

- `scripts/indexer.js`: the monitor
- `scripts/telegram_setup.js`: finds your chat ID and sends a test message
- `scripts/watched_mints.json`: the watchlist the monitor reads
- `scripts/verify_add_token.js`, `scripts/read_watchlist.js`: helpers for the on-chain program in Part 2 (they use the public devnet RPC)

## Pre-existing code

The on-chain watchlist program and its web app in Part 2 were built before the hackathon sprint began on Sep 14, 2026. The monitor, the Telegram alerts, and a `telegram_chat_id` field added to the program were built during it. The monitor does not read that field yet.

---

# Part 2: Solana Watchlist (on-chain program)

A Solana dApp for tracking token prices on-chain. Connect Phantom, add up to 10 token mint addresses to a personal on-chain watchlist (stored in a PDA), and view live prices via Jupiter.

## Stack

- Program: Rust + Anchor (anchor-lang 1.1.2)
- Frontend: Vanilla HTML/JS, raw @solana/web3.js (no Anchor TS client)
- Price data: Jupiter Price API v3
- Network: Solana Devnet

## Scope (v1)

This is an add-only watchlist. There is no remove_token instruction. This is an intentional scope decision for v1, not a missing feature.

## Live Deployment

- Program ID: GqCdeBcZwZVbrSz6R1zPhrKRscAjHpgtabXEr6aPqpAs
- Cluster: Devnet
- Verify on-chain: `solana program show GqCdeBcZwZVbrSz6R1zPhrKRscAjHpgtabXEr6aPqpAs --url https://api.devnet.solana.com`

## Running locally

1. Set Phantom to Devnet (Settings, Developer Settings, Solana Devnet).
2. Serve the frontend over HTTP, since wallet extensions block file:// origins. From the app directory, run: `python3 -m http.server 8080`
3. Open http://localhost:8080 and connect Phantom.

## Known limitation

Price lookups only resolve for tokens with real market liquidity on Jupiter. Devnet-only token mints (used for testing) will correctly show "no price data" since they have no real-world market. This is expected, not a bug.

## Testing

Program logic is tested with LiteSVM. Run: `cargo test --release`
