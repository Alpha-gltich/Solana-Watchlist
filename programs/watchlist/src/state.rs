use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Watchlist {
    pub authority: Pubkey,
    #[max_len(10)]
    pub tokens: Vec<Pubkey>,
}
