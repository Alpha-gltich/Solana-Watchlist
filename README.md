# Solana Watchlist

A Solana dApp for tracking token prices on-chain. Connect Phantom, add up to 10 token mint addresses to a personal on-chain watchlist (stored in a PDA), and view live prices via Jupiter.

## Stack

- Program: Rust + Anchor (anchor-lang 1.1.2)
- Frontend: Vanilla HTML/JS, raw @solana/web3.js (no Anchor TS client)
- Price data: Jupiter Price API v3
- Network: Solana Devnet

## Scope (v1)

This is an add-only watchlist. There is no remove_token instruction — this is an intentional scope decision for v1, not a missing feature.

## Live Deployment

- Program ID: GqCdeBcZwZVbrSz6R1zPhrKRscAjHpgtabXEr6aPqpAs
- Cluster: Devnet
- Verify on-chain: solana program show GqCdeBcZwZVbrSz6R1zPhrKRscAjHpgtabXEr6aPqpAs --url https://api.devnet.solana.com

## Running locally

1. Set Phantom to Devnet (Settings, Developer Settings, Solana Devnet).
2. Serve the frontend over HTTP, since wallet extensions block file:// origins. From the app directory, run: python3 -m http.server 8080
3. Open http://localhost:8080 and connect Phantom.

## Known limitation

Price lookups only resolve for tokens with real market liquidity on Jupiter. Devnet-only token mints (used for testing) will correctly show "no price data" since they have no real-world market. This is expected, not a bug.

## Testing

Program logic is tested with LiteSVM. Run: cargo test --release
