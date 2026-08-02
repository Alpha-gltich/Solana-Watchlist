use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}
#[account]
#[derive(InitSpace)]
pub struct Watchlist {
    pub authority: Pubkey,
    #[max_len(10)]
    pub tokens: Vec<Pubkey>,
}
