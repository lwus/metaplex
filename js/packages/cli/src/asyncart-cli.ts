#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { program } from 'commander';
import log from 'loglevel';

import * as anchor from '@project-serum/anchor';
import {
  Commitment,
  Connection as RPCConnection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { sha256 } from "js-sha256";
import BN from 'bn.js';

import {
  getMetadata,
  getMasterEdition,
  loadAsyncArtProgram,
} from './helpers/accounts';
import {
  ASYNCART_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from './helpers/constants';
import {
  sendSignedTransaction,
} from './helpers/transactions';

program.version('0.0.1');

const LOG_PATH = './.log';

if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH);
}

log.setLevel(log.levels.INFO);

const ASYNCART_PREFIX = Buffer.from("asyncart");
const ASYNCART_MINT = Buffer.from("mint");

programCommand('create_master')
  .action(async (options, cmd) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const [masterKey, masterBump] = await PublicKey.findProgramAddress(
      [
        ASYNCART_PREFIX,
        wallet.publicKey.toBuffer(),
      ],
      ASYNCART_PROGRAM_ID
    );

    const [mintKey, mintBump] = await PublicKey.findProgramAddress(
      [
        ASYNCART_PREFIX,
        wallet.publicKey.toBuffer(),
        ASYNCART_MINT,
      ],
      ASYNCART_PROGRAM_ID
    );

    const metadataKey = await getMetadata(mintKey);
    const metadataMaster = await getMasterEdition(mintKey);

    const [walletTokenKey, ] = await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintKey.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    );

    const schemaURI = "https://arweave.net/rZjs-LbK1eRMl3UkQjKbThQz95jJo8H1HYBMlHuRb4A";
    const name = "tester";
    const symbol = "test";
    const uri = "https://www.arweave.net/3xP6orSwjIjhuxX4ttQkjf-d3QiYbU-lqOXoLTYjOOI?ext=png";
    const createMaster = await anchorProgram.instruction.createMaster(
      masterBump,
      mintBump,
      schemaURI,
      {
        name: name,
        symbol: symbol,
        uri: uri,
        sellerFeeBasisPoints: 0,
      },
      {
        accounts: {
          base: wallet.publicKey,
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

    const createResult = await sendTransactionWithRetry(
      anchorProgram.provider.connection,
      wallet,
      [createMaster],
      [],
    );

    log.info(createResult);
  });

programCommand('create_layer')
  .option(
    '--index <number>',
    `Layer index`,
  )
  .action(async (options, cmd) => {
    log.info(`Parsed options:`, options);

    const index = Number(options.index);
    if (isNaN(index)) {
      throw new Error(`Unable to parse index ${options.index}`);
    }

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const indexBuffer = Buffer.from(new BN(index).toArray("le", 8));
    const [layerKey, layerBump] = await PublicKey.findProgramAddress(
      [
        ASYNCART_PREFIX,
        wallet.publicKey.toBuffer(),
        indexBuffer,
      ],
      ASYNCART_PROGRAM_ID
    );

    const [mintKey, mintBump] = await PublicKey.findProgramAddress(
      [
        ASYNCART_PREFIX,
        wallet.publicKey.toBuffer(),
        ASYNCART_MINT,
        indexBuffer,
      ],
      ASYNCART_PROGRAM_ID
    );

    const metadataKey = await getMetadata(mintKey);
    const metadataMaster = await getMasterEdition(mintKey);

    const [walletTokenKey, ] = await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintKey.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    );

    const name = "testerL2";
    const symbol = "test";
    const uri = "https://www.arweave.net/3xP6orSwjIjhuxX4ttQkjf-d3QiYbU-lqOXoLTYjOOI?ext=png";
    const createLayer = await anchorProgram.instruction.createLayer(
      layerBump,
      mintBump,
      new BN(index),
      new BN(0), // current
      {
        name: name,
        symbol: symbol,
        uri: uri,
        sellerFeeBasisPoints: 0,
      },
      {
        accounts: {
          base: wallet.publicKey,
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

    const createResult = await sendTransactionWithRetry(
      anchorProgram.provider.connection,
      wallet,
      [createLayer],
      [],
    );

    log.info(createResult);
  });

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'devnet', //mainnet-beta, testnet, devnet
    )
    .option(
      '-k, --keypair <path>',
      `Solana wallet location`,
      '--keypair not provided',
    )
    .option('-r, --rpc-url <string>', 'Custom rpc url')
    .option('-l, --log-level <string>', 'log level', setLogLevel);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}

function loadWalletKey(keypair): Keypair {
  if (!keypair || keypair == '') {
    throw new Error('Keypair is required!');
  }
  const loaded = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString())),
  );
  log.info(`wallet public key: ${loaded.publicKey}`);
  return loaded;
}

async function sendTransactionWithRetry(
  connection: RPCConnection,
  wallet: Keypair,
  instructions: Array<TransactionInstruction>,
  signers: Array<Keypair>,
  commitment: Commitment = 'singleGossip',
): Promise<string | { txid: string; slot: number }> {
  const transaction = new Transaction();
  instructions.forEach(instruction => transaction.add(instruction));
  transaction.recentBlockhash = (
    await connection.getRecentBlockhash(commitment)
  ).blockhash;

  transaction.setSigners(
    // fee payed by the wallet owner
    wallet.publicKey,
    ...signers.map(s => s.publicKey),
  );

  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }
  transaction.partialSign(wallet);

  return sendSignedTransaction({
    connection,
    signedTransaction: transaction,
  });
}

program.parse(process.argv);
