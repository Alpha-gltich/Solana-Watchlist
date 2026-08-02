use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

#[test]
fn test_add_token() {
    let program_id = watchlist::id();
    let payer = Keypair::new();
    let watchlist_pda = Pubkey::find_program_address(
        &[b"watchlist", payer.pubkey().as_ref()],
        &program_id,
    )
    .0;

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/watchlist.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let fake_token = Pubkey::new_unique();

    let instruction = Instruction::new_with_bytes(
        program_id,
        &watchlist::instruction::AddToken { token: fake_token }.data(),
        watchlist::accounts::AddToken {
            payer: payer.pubkey(),
            watchlist: watchlist_pda,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let watchlist_account = svm.get_account(&watchlist_pda).unwrap();
    let mut data: &[u8] = &watchlist_account.data;
    let watchlist_state = watchlist::state::Watchlist::try_deserialize(&mut data).unwrap();

    assert_eq!(watchlist_state.authority, payer.pubkey());
    assert_eq!(watchlist_state.tokens.len(), 1);
    assert_eq!(watchlist_state.tokens[0], fake_token);
}

