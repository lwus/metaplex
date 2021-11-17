
import * as anchor from '@project-serum/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import BN from 'bn.js';

import {
  getMetadata,
  getMasterEdition,
  getTokenWallet,
} from '../accounts';
import {
  ASYNCART_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from '../constants';

export const ASYNCART_PREFIX = Buffer.from("asyncart");
export const ASYNCART_MINT = Buffer.from("mint");

export type Data = {
  name: string,
  symbol: string,
  uri: string,
  sellerFeeBasisPoints: number,
};

export const getAsyncArtMeta = async (
  base: PublicKey,
  index: Buffer = Buffer.from([]),
) => {
  return await PublicKey.findProgramAddress(
    [
      ASYNCART_PREFIX,
      base.toBuffer(),
      index,
    ],
    ASYNCART_PROGRAM_ID
  );
}

export const getAsyncArtMint = async (
  base: PublicKey,
  index: Buffer = Buffer.from([]),
) => {
  return await PublicKey.findProgramAddress(
    [
      ASYNCART_PREFIX,
      base.toBuffer(),
      ASYNCART_MINT,
      index,
    ],
    ASYNCART_PROGRAM_ID
  );
}

export const createMaster = async (
  schemaURI: string,
  data: Data,
  base: PublicKey,
  wallet: Keypair,
  anchorProgram: anchor.Program,
) => {
  const [masterKey, masterBump] = await getAsyncArtMeta(base);
  const [mintKey, mintBump] = await getAsyncArtMint(base);

  const metadataKey = await getMetadata(mintKey);
  const metadataMaster = await getMasterEdition(mintKey);
  const walletTokenKey = await getTokenWallet(wallet.publicKey, mintKey);

  return await anchorProgram.instruction.createMaster(
    masterBump,
    mintBump,
    schemaURI,
    data,
    {
      accounts: {
        base: base,
        master: masterKey,
        mint: mintKey,
        metadata: metadataKey,
        masterEdition: metadataMaster,
        payer: wallet.publicKey,
        payerAta: walletTokenKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        ataProgram: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      },
      signers: [],
    });
};

export const createLayer = async (
  index: number,
  data: Data,
  base: PublicKey,
  wallet: Keypair,
  anchorProgram: anchor.Program,
) => {

  const indexBuffer = Buffer.from(new BN(index).toArray("le", 8));
  const [layerKey, layerBump] = await getAsyncArtMeta(base, indexBuffer);

  const [mintKey, mintBump] = await getAsyncArtMint(base, indexBuffer);

  const metadataKey = await getMetadata(mintKey);
  const metadataMaster = await getMasterEdition(mintKey);

  const walletTokenKey = await getTokenWallet(wallet.publicKey, mintKey);

  return await anchorProgram.instruction.createLayer(
    layerBump,
    mintBump,
    new BN(index),
    new BN(0), // current
    data,
    {
      accounts: {
        base: base,
        layer: layerKey,
        mint: mintKey,
        metadata: metadataKey,
        masterEdition: metadataMaster,
        payer: wallet.publicKey,
        payerAta: walletTokenKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        ataProgram: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      },
      signers: [],
    });
};


