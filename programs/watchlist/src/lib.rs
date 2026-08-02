pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GqCdeBcZwZVbrSz6R1zPhrKRscAjHpgtabXEr6aPqpAs");

#[program]
pub mod watchlist {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx)
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        crate::instructions::increment::handle_increment(ctx)
    }

    pub fn add_token(ctx: Context<AddToken>, token: Pubkey) -> Result<()> {
        crate::instructions::add_token::handle_add_token(ctx, token)
    
}

}
