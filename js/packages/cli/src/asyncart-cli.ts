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
import {
  createLayer,
  createMaster,
} from './helpers/asyncart/create';

program.version('0.0.1');

const LOG_PATH = './.log';

if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH);
}

log.setLevel(log.levels.INFO);

programCommand('create_master')
  .action(async (options, cmd) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const instr = await createMaster(
      "https://arweave.net/rZjs-LbK1eRMl3UkQjKbThQz95jJo8H1HYBMlHuRb4A",
      {
        name: "tester",
        symbol: "test",
        uri: "https://www.arweave.net/3xP6orSwjIjhuxX4ttQkjf-d3QiYbU-lqOXoLTYjOOI",
        sellerFeeBasisPoints: 0,
      },
      wallet,
      anchorProgram
    );

    const createResult = await sendTransactionWithRetry(
      anchorProgram.provider.connection,
      wallet,
      [instr],
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

    const instr = await createLayer(
      index,
      {
        name: "testerL2",
        symbol: "test",
        uri: "https://www.arweave.net/3xP6orSwjIjhuxX4ttQkjf-d3QiYbU-lqOXoLTYjOOI",
        sellerFeeBasisPoints: 0,
      },
      wallet,
      anchorProgram
    );

    const createResult = await sendTransactionWithRetry(
      anchorProgram.provider.connection,
      wallet,
      [instr],
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
