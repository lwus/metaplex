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

programCommand('create')
  .action(async (options, cmd) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const connection = new anchor.web3.Connection(
      //@ts-ignore
      options.rpcUrl || anchor.web3.clusterApiUrl(options.env),
    );

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
    const createMaster = new TransactionInstruction({
        programId: ASYNCART_PROGRAM_ID,
        keys: [
            { pubkey: wallet.publicKey          , isSigner: true  , isWritable: false } ,
            { pubkey: masterKey                 , isSigner: false , isWritable: true  } ,
            { pubkey: mintKey                   , isSigner: false , isWritable: true  } ,
            { pubkey: metadataKey               , isSigner: false , isWritable: true  } ,
            { pubkey: metadataMaster            , isSigner: false , isWritable: true  } ,
            { pubkey: wallet.publicKey          , isSigner: true  , isWritable: true  } ,
            { pubkey: walletTokenKey            , isSigner: false , isWritable: true  } ,
            { pubkey: SystemProgram.programId   , isSigner: false , isWritable: false } ,
            { pubkey: TOKEN_PROGRAM_ID          , isSigner: false , isWritable: false } ,
            {
              pubkey: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
              isSigner: false,
              isWritable: false,
            },
            { pubkey: TOKEN_METADATA_PROGRAM_ID , isSigner: false , isWritable: false } ,
            { pubkey: SYSVAR_RENT_PUBKEY        , isSigner: false , isWritable: false } ,
        ],
        data: Buffer.from([
          ...Buffer.from(sha256.digest("global:create_master")).slice(0, 8),
          ...new BN(masterBump).toArray("le", 1),
          ...new BN(mintBump).toArray("le", 1),
          ...new BN(schemaURI.length).toArray("le", 4),
          ...Buffer.from(schemaURI),
          ...new BN(name.length).toArray("le", 4),
          ...Buffer.from(name),
          ...new BN(symbol.length).toArray("le", 4),
          ...Buffer.from(symbol),
          ...new BN(uri.length).toArray("le", 4),
          ...Buffer.from(uri),
          ...new BN(0).toArray("le", 2),
        ])
    });

    const createResult = await sendTransactionWithRetry(
      connection,
      wallet,
      [createMaster],
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
