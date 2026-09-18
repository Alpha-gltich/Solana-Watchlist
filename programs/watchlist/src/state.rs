use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Watchlist {
    pub authority: Pubkey,
    pub telegram_chat_id: i64,
    #[max_len(10)]
    pub tokens: Vec<Pubkey>,
}