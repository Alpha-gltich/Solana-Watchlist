pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("GqCdeBcZwZVbrSz6R1zPhrKRscAjHpgtabXEr6aPqpAs");

#[program]
pub mod watchlist {
    use super::*;

    pub fn add_token(ctx: Context<AddToken>, token: Pubkey, telegram_chat_id: i64) -> Result<()> {
        crate::instructions::add_token::handle_add_token(ctx, token, telegram_chat_id)
    }
}