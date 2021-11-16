
use anchor_lang::prelude::*;
use anchor_spl::token::{self};

use spl_associated_token_account::create_associated_token_account;

use metaplex_token_metadata::{
    instruction::{
        create_metadata_accounts,
        create_master_edition,
    },
    utils::{
        create_or_allocate_account_raw,
        puffed_out_string,
    },
};

use solana_program::{
    program::{invoke},
};

declare_id!("Ax22eZWmvg77HAE5eWbvhdzZYLPmv6C8TV28ivasjB5L");

// Schema is roughly
//
// master
// -- layer 0
//   -- image 0
//   -- ...
//   -- image n
// ...
// -- layer n
//   -- ...
//
// Where `master` is a Keypair and each `layer` is a PDA of `master` and the index and each `image`
// is a PDA of it's layer and index. Everything is an NFT that can be independently traded.
//
// `layer` has additional metadata owned by the `asyncart` program that describes the currently
// active image. The NFT URI points to a cover image as with the existing asyncart layers.
//
// `master` is a mutable NFT that represents the currently selected layers composed with a schema
// that can be generated with an off-chain program. There will be both a 'current' representation
// maintained by a view, and a canonically traded NFT that can snapshot the current view. We allow
// an authority on the `master` to update the URI (probably held by a server that does the snapshot
// / query directly after uploading to arweave).
//
// We can have a lambda for an update every minute or so and then layer holders can pay to push it
// more quickly?


pub const PREFIX: &[u8] = b"asyncart";
pub const LAYER: &[u8] = b"layer";
pub const MINT: &[u8] = b"mint";
pub const MAX_SCHEMA_URI_LENGTH: usize = 200; // smaller?

#[program]
pub mod asyncart {
    use super::*;

    pub fn create_master(
        ctx: Context<CreateMaster>,
        _bump: u8,
        mint_bump: u8,
        schema: String,
        data: Data,
    ) -> ProgramResult {

        create_mint_at_pda(
            &ctx.accounts.mint,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            &ctx.accounts.token_program,
            &ctx.accounts.rent,
            ctx.accounts.base.key(),
            ctx.accounts.base.key(),
            mint_bump,
            None,
        )?;

        invoke(
            &create_associated_token_account(
                &ctx.accounts.payer.key(),
                &ctx.accounts.payer.key(),
                &ctx.accounts.mint.key(),
            ),
            &[
                ctx.accounts.payer_ata.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.ata_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;

        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.payer_ata.to_account_info(),
                    authority: ctx.accounts.base.to_account_info(),
                },
            ),
            1,
        )?;

        create_metadata_and_edition(
            &ctx.accounts.base,
            &ctx.accounts.mint,
            &ctx.accounts.metadata,
            &ctx.accounts.master_edition,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            &ctx.accounts.token_program,
            &ctx.accounts.token_metadata_program,
            &ctx.accounts.rent,
            &data,
        )?;

        let master = &mut ctx.accounts.master;

        master.schema = puffed_out_string(&schema, MAX_SCHEMA_URI_LENGTH);

        Ok(())
    }

    pub fn create_layer(
        ctx: Context<CreateLayer>,
        _lbump: u8,
        mint_bump: u8,
        layer_index: u64,
        current: u64,
        data: Data,
    ) -> ProgramResult {

        create_mint_at_pda(
            &ctx.accounts.mint,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            &ctx.accounts.token_program,
            &ctx.accounts.rent,
            ctx.accounts.base.key(),
            ctx.accounts.base.key(),
            mint_bump,
            Some(layer_index),
        )?;

        invoke(
            &create_associated_token_account(
                &ctx.accounts.payer.key(),
                &ctx.accounts.payer.key(),
                &ctx.accounts.mint.key(),
            ),
            &[
                ctx.accounts.payer_ata.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.ata_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;

        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.payer_ata.to_account_info(),
                    authority: ctx.accounts.base.to_account_info(),
                },
            ),
            1,
        )?;

        create_metadata_and_edition(
            &ctx.accounts.base,
            &ctx.accounts.mint,
            &ctx.accounts.metadata,
            &ctx.accounts.master_edition,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            &ctx.accounts.token_program,
            &ctx.accounts.token_metadata_program,
            &ctx.accounts.rent,
            &data,
        )?;

        let layer = &mut ctx.accounts.layer;

        layer.current = current;

        Ok(())
    }

    pub fn create_image(
        ctx: Context<CreateImage>,
        layer_bump: u8,
        lindex: u64,
        mint_bump: u8,
        mint_index: u64,
        data: Data,
    ) -> ProgramResult {
        require!(
            Pubkey::create_program_address(
                &[
                    PREFIX.as_ref(),
                    ctx.accounts.base.key().to_bytes().as_ref(),
                    lindex.to_le_bytes().as_ref(),
                    &[layer_bump],
                ],
                &ID)
                == Ok(ctx.accounts.layer.key()),
            ErrorCode::InvalidLayerPDA
        );

        create_mint_at_pda(
            &ctx.accounts.mint,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            &ctx.accounts.token_program,
            &ctx.accounts.rent,
            ctx.accounts.layer.key(),
            ctx.accounts.base.key(),
            mint_bump,
            Some(mint_index),
        )?;

        invoke(
            &create_associated_token_account(
                &ctx.accounts.payer.key(),
                &ctx.accounts.payer.key(),
                &ctx.accounts.mint.key(),
            ),
            &[
                ctx.accounts.payer_ata.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.ata_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;

        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.payer_ata.to_account_info(),
                    authority: ctx.accounts.base.to_account_info(),
                },
            ),
            1,
        )?;

        create_metadata_and_edition(
            &ctx.accounts.base,
            &ctx.accounts.mint,
            &ctx.accounts.metadata,
            &ctx.accounts.master_edition,
            &ctx.accounts.payer,
            &ctx.accounts.system_program,
            &ctx.accounts.token_program,
            &ctx.accounts.token_metadata_program,
            &ctx.accounts.rent,
            &data,
        )?;

        Ok(())
    }

    pub fn update_master_schema(
        ctx: Context<UpdateMasterSchema>,
        bump: u8,
        schema: String,
    ) -> ProgramResult {
        require!(
            Pubkey::create_program_address(
                &[
                    PREFIX.as_ref(),
                    ctx.accounts.base.key().to_bytes().as_ref(),
                    &[bump],
                ],
                &ID)
                == Ok(ctx.accounts.master.key()),
            ErrorCode::InvalidMintPDA
        );

        let master = &mut ctx.accounts.master;

        master.schema = puffed_out_string(&schema, MAX_SCHEMA_URI_LENGTH);

        Ok(())
    }
}

fn create_mint_at_pda<'info>(
    mint: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    token_program: &Program<'info, token::Token>,
    rent: &Sysvar<'info, Rent>,
    deriv: Pubkey,
    mint_authority: Pubkey,
    bump: u8,
    index: Option<u64>,
) -> ProgramResult {

    // TODO: simplify lifetimes...
    let deriv_as_bytes = deriv.to_bytes();
    let mut mint_create_seeds = vec![
        PREFIX.as_ref(),
        &deriv_as_bytes,
        MINT.as_ref(),
    ];

    let index_as_bytes = index.unwrap_or(0).to_le_bytes();
    match index {
        Some(_) => {
            mint_create_seeds.push(&index_as_bytes);
        }
        None => {}
    };

    let bump_as_bytes = [bump];
    mint_create_seeds.push(&bump_as_bytes);

    require!(
        Pubkey::create_program_address(mint_create_seeds.as_slice(), &ID)
            == Ok(*mint.key),
        ErrorCode::InvalidMintPDA
    );

    create_or_allocate_account_raw(
        token_program.key(),
        &mint.to_account_info(),
        &rent.to_account_info(),
        &system_program.to_account_info(),
        &payer.to_account_info(),
        token::Mint::LEN,
        mint_create_seeds.as_slice(),
    )?;

    token::initialize_mint(
        CpiContext::new(
            token_program.to_account_info(),
            token::InitializeMint {
                mint: mint.to_account_info(),
                rent: rent.to_account_info(),
            },
        ),
        0,
        &mint_authority,
        Some(&mint_authority),
    )?;

    Ok(())
}

fn create_metadata_and_edition<'info>(
    base: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    metadata: &AccountInfo<'info>,
    master_edition: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &Program<'info, System>,
    token_program: &Program<'info, token::Token>,
    token_metadata_program: &AccountInfo<'info>,
    rent: &Sysvar<'info, Rent>,
    data: &Data,
) -> ProgramResult {

    let metadata_infos = vec![
        metadata.to_account_info(),
        mint.to_account_info(),
        base.to_account_info(),
        payer.to_account_info(),
        token_metadata_program.to_account_info(),
        token_program.to_account_info(),
        system_program.to_account_info(),
        rent.to_account_info(),
    ];

    let master_edition_infos = vec![
        master_edition.to_account_info(),
        mint.to_account_info(),
        base.to_account_info(),
        payer.to_account_info(),
        metadata.to_account_info(),
        token_metadata_program.to_account_info(),
        token_program.to_account_info(),
        system_program.to_account_info(),
        rent.to_account_info(),
    ];

    invoke(
        &create_metadata_accounts(
            *token_metadata_program.key,
            *metadata.key,
            *mint.key,
            *base.key, // mint_authority
            *payer.key,
            *base.key, // update_authority
            data.name.clone(),
            data.symbol.clone(),
            data.uri.clone(),
            Some(vec![
                 // TODO: add actual creator and make this share 0
                 metaplex_token_metadata::state::Creator {
                     address: base.key(),
                     verified: true,
                     share: 100,
                 }
            ]),
            data.seller_fee_basis_points,
            true,
            false, // TODO?
        ),
        metadata_infos.as_slice(),
    )?;

    invoke(
        &create_master_edition(
            *token_metadata_program.key,
            *master_edition.key,
            *mint.key,
            *base.key, // update_authority
            *base.key, // mint_authority
            *metadata.key,
            *payer.key,
            Some(0), // TODO
        ),
        master_edition_infos.as_slice(),
    )?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(bump: u8, mint_bump: u8)]
pub struct CreateMaster<'info> {
    pub base: Signer<'info>,

    #[account(
        init,
        seeds = [
            PREFIX.as_ref(),
            base.key().to_bytes().as_ref(),
        ],
        bump = bump,
        payer = payer,
        space = 8 + 4 + MAX_SCHEMA_URI_LENGTH,
    )]
    pub master: Account<'info, Master>,

    #[account(mut)]
    pub mint: AccountInfo<'info>,

    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    #[account(mut)]
    pub master_edition: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub payer_ata: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, token::Token>,

    pub ata_program: AccountInfo<'info>,

    pub token_metadata_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(layer_bump: u8, mint_bump: u8, layer_index: u64)]
pub struct CreateLayer<'info> {
    pub base: Signer<'info>,

    #[account(
        init,
        seeds = [
            PREFIX.as_ref(),
            base.key().to_bytes().as_ref(),
            layer_index.to_le_bytes().as_ref(),
        ],
        bump = layer_bump,
        payer = payer,
    )]
    pub layer: Account<'info, Layer>,

    #[account(mut)]
    pub mint: AccountInfo<'info>,

    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    #[account(mut)]
    pub master_edition: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub payer_ata: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, token::Token>,

    pub ata_program: AccountInfo<'info>,

    pub token_metadata_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateImage<'info> {
    pub base: Signer<'info>,

    // TODO: do we need this?
    pub layer: AccountInfo<'info>,

    #[account(mut)]
    pub mint: AccountInfo<'info>,

    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    #[account(mut)]
    pub master_edition: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub payer_ata: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, token::Token>,

    pub ata_program: AccountInfo<'info>,

    pub token_metadata_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct UpdateMasterSchema<'info> {
    pub base: Signer<'info>,

    // TODO: why can't I do this
    // #[account(
    //     seeds = [
    //         PREFIX.as_ref(),
    //         base.key().to_bytes().as_ref(),
    //     ],
    //     bump = bump,
    //     mut,
    // )]
    pub master: Account<'info, Master>,
}

#[account]
#[derive(Default)]
pub struct Master {
    pub schema: String,
}

#[account]
#[derive(Default)]
pub struct Layer {
    pub current: u64,
}

// as in metadata without creators
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct Data {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub seller_fee_basis_points: u16,
}

#[error]
pub enum ErrorCode {
    #[msg("Invalid Mint PDA")]
    InvalidMintPDA,
    #[msg("Invalid Layer PDA")]
    InvalidLayerPDA,
}
