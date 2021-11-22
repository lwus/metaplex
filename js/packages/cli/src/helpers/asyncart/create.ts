
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import log from 'loglevel';

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
import {
  decodeMetadata,
} from '../schema';

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

export const createImage = async (
  layerIndex: number,
  imageIndex: number,
  data: Data,
  base: PublicKey,
  wallet: Keypair,
  anchorProgram: anchor.Program,
) => {

  const layerIndexBuffer = Buffer.from(new BN(layerIndex).toArray("le", 8));
  const [layerKey, layerBump] = await getAsyncArtMeta(base, layerIndexBuffer);

  const imageIndexBuffer = Buffer.from(new BN(imageIndex).toArray("le", 8));
  const [mintKey, mintBump] = await getAsyncArtMint(layerKey, imageIndexBuffer);

  const metadataKey = await getMetadata(mintKey);
  const metadataMaster = await getMasterEdition(mintKey);

  const walletTokenKey = await getTokenWallet(wallet.publicKey, mintKey);

  return await anchorProgram.instruction.createImage(
    layerBump,
    new BN(layerIndex),
    mintBump,
    new BN(imageIndex),
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

export const compositeImage = async (
  base: PublicKey,
  anchorProgram: anchor.Program,
) => {
  const [masterKey, ] = await getAsyncArtMeta(base);

  const masterMetadata = await anchorProgram.account.master.fetch(masterKey);
  if (masterMetadata === null) {
    // mostly a sanity check...
    throw new Error(`Could not fetch master metadata for ${base.toBase58()}`);
  }

  let layerIndex = 0;
  const imageURIs : Array<string> = [];
  // eslint-disable-next-line no-constant-conditions
  while (true) {
    const layerIndexBuffer = Buffer.from(new BN(layerIndex).toArray("le", 8));
    const [layerKey, ] = await getAsyncArtMeta(base, layerIndexBuffer);

    const layerMetadata = await anchorProgram.account.layer.fetch(layerKey);
    if (layerMetadata === null) {
      break;
    }

    const imageIndexBuffer = Buffer.from(new BN(layerMetadata.current).toArray("le", 8));
    const [imageMintKey, ] = await getAsyncArtMint(layerKey, imageIndexBuffer);
    const imageMetadataKey = await getMetadata(imageMintKey);
    const imageMetadataAccount = await anchorProgram.provider.connection.getAccountInfo(imageMetadataKey);
    if (imageMetadataAccount === null) {
      log.warn(`Layer metadata ${layerIndex} points to `
               + `invalid image index ${layerMetadata.current}`);
    } else {
      const imageMetadataDecoded = decodeMetadata(imageMetadataAccount.data);
      imageURIs.push(imageMetadataDecoded.data.uri);
    }

    ++layerIndex;
  }

  console.log(`Fetching images ${imageURIs} from ${layerIndex} layers`);

  const compositeDir = path.join(os.tmpdir(), 'img-');
  fs.mkdtempSync(compositeDir);
  const imageFiles = [];
  for (const uri of imageURIs) {
    const offchainImageMetadata = await (await fetch(uri)).json();
    if (!offchainImageMetadata.image) {
      log.error(`Did not find image field on off-chain metadata at ${uri}`);
      continue;
    }

    const imageBlob = await (await fetch(offchainImageMetadata.image)).blob();
    const imageFile = path.join(compositeDir, offchainImageMetadata.name);
    fs.writeFileSync(imageFile, Buffer.from(await imageBlob.arrayBuffer()));
    imageFiles.push(imageFile);
  }

  if (imageFiles.length === 0) {
    throw new Error('Ended up with 0 image files to composite');
  }

  const output = imageFiles[0];
  for (let index = 1; index < imageFiles.length; ++index) {
    // call `composite imageFiles[index] output`
  }
}
