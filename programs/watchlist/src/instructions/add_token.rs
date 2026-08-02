use anchor_lang::prelude::*;
use crate::state::Watchlist;

#[derive(Accounts)]
pub struct AddToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Watchlist::INIT_SPACE,
        seeds = [b"watchlist", payer.key().as_ref()],
        bump
    )]
    pub watchlist: Account<'info, Watchlist>,
    pub system_program: Program<'info, System>,
}

pub fn handle_add_token(ctx: Context<AddToken>, token: Pubkey) -> Result<()> {
    let watchlist = &mut ctx.accounts.watchlist;
    watchlist.authority = ctx.accounts.payer.key();
    if !watchlist.tokens.contains(&token) {
        watchlist.tokens.push(token);
    }
    Ok(())
}
