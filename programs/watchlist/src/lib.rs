pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("GqCdeBcZwZVbrSz6R1zPhrKRscAjHpgtabXEr6aPqpAs");

#[program]
pub mod watchlist {
    use super::*;

    pub fn add_token(ctx: Context<AddToken>, token: Pubkey) -> Result<()> {
        crate::instructions::add_token::handle_add_token(ctx, token)
    }
}
