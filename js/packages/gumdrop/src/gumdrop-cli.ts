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
} from "@solana/web3.js";
import {
  MintInfo,
  Token,
} from "@solana/spl-token";
import { sha256 } from "js-sha256";
import BN from 'bn.js';
import * as bs58 from "bs58";
import * as crypto from "crypto";

import {
  ClaimantInfo,
  buildGumdrop,
  closeGumdrop,
  parseClaimants,
  validateTransferClaims,
  validateCandyClaims,
  validateEditionClaims,
} from "./utils/claimant";
import {
  setupSes,
  setupManual,
  setupWalletListUpload,
} from "./utils/communication";
import {
  CANDY_MACHINE_ID,
  GUMDROP_TEMPORAL_SIGNER,
  GUMDROP_DISTRIBUTOR_ID,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./utils/ids";
import {
  MerkleTree,
} from "./utils/merkleTree";
import {
  sendSignedTransaction,
} from "./utils/transactions";

program.version('0.0.1');

const LOG_PATH= "./.log";

if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH);
}

log.setLevel(log.levels.INFO);

programCommand('create')
  .option(
    '--claim-integration <method>',
    'Backend for claims. Either `transfer` for token-transfers through approve-delegate, `candy` for minting through a candy-machine, or `edition` for minting through a master edition'
  )
  .option(
    '--transfer-mint <mint>',
    'transfer: public key of mint'
  )
  .option(
    '--candy-config <config>',
    'candy: public key of the candy machine config'
  )
  .option(
    '--candy-uuid <uuid>',
    'candy: uuid used to construct the candy machine'
  )
  .option(
    '--edition-mint <mint>',
    'edition: mint of the master edition'
  )
  .option(
    '--distribution-method <method>',
    // TODO: more explanation
    'Off-chain distribution of claims. Either `aws`, `manual`, or `wallets`'
  )
  .option(
    '--aws-otp-auth <auth>',
    'Off-chain OTP from claim. Either `default` for AWS OTP endpoint (email) or `none` to skip OTP'
  )
  .option(
    '--aws-ses-access-key-id <string>',
    'Access Key Id'
  )
  .option(
    '--aws-ses-secret-access-key <string>',
    'Secret Access Key'
  )
  .option(
    '--manual-otp-auth <auth>',
    'Off-chain OTP from claim. Either `default` for AWS OTP endpoint (email) or `none` to skip OTP'
  )
  .option(
    '--distribution-list <path>',
    'Off-chain OTP from claim. Either `default` for AWS OTP endpoint (email) or `none` to skip OTP'
  )
  .option(
    '--resend-only',
    'Distribute list with off-chain method only. Assumes a validator and urls already exist'
  )
  .option(
    '--host <string>',
    'Website to claim gumdrop',
    "https://lwus.github.io/gumdrop/"
  )
  .action(async (options, cmd) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const connection = new anchor.web3.Connection(
      //@ts-ignore
      options.rpcUrl || anchor.web3.clusterApiUrl(options.env),
    );

    const getTemporalSigner = (auth) => {
      switch (auth){
        case "default" : return GUMDROP_TEMPORAL_SIGNER;
        case "none"    : return PublicKey.default;
        default        : throw new Error(`Unknown OTP authorization type ${auth}`)
      }
    };

    if (!options.host) {
      throw new Error("No host website specified");
    }

    let temporalSigner, sender;
    switch (options.distributionMethod) {
      case "wallets": {
        sender = setupWalletListUpload({}, "");
        temporalSigner = GUMDROP_DISTRIBUTOR_ID;
        break;
      }
      case "manual": {
        sender = setupManual({}, "");
        temporalSigner = getTemporalSigner(options.manualOtpAuth);
        break;
      }
      case "aws": {
        sender = setupSes(
          {
            accessKeyId: options.awsSesAccessKeyId,
            secretAccessKey: options.awsSesSecretAccessKey,
          },
          "santa@aws.metaplex.com",
        );
        temporalSigner = getTemporalSigner(options.awsOtpAuth);
        break;
      }
      default:
        throw new Error(
          "Distribution method must either be 'aws', 'manual', or 'wallets'.",
        );
    }
    console.log(`temporal signer: ${temporalSigner.toBase58()}`);


    let claimantsStr;
    try {
      claimantsStr = fs.readFileSync(options.distributionList).toString();
    } catch (err) {
      throw new Error(`Could not read distribution list ${err}`);
    }

    const claimants = parseClaimants(claimantsStr);
    if (claimants.length === 0) {
      throw new Error(`No claimants provided`);
    }

    let claimInfo;
    switch (options.claimIntegration) {
      case "transfer": {
        claimInfo = await validateTransferClaims(
          connection,
          options.env,
          wallet.publicKey,
          claimants,
          options.transferMint,
        );
        break;
      }
      case "candy": {
        claimInfo = await validateCandyClaims(
          connection,
          options.env,
          wallet.publicKey,
          claimants,
          options.candyConfig,
          options.candyUuid,
        );
        break;
      }
      case "edition": {
        claimInfo = await validateEditionClaims(
          connection,
          options.env,
          wallet.publicKey,
          claimants,
          options.editionMint,
        );
        break;
      }
      default:
        throw new Error(
          "Claim integration must either be 'transfer', 'candy', or 'edition'.",
        );
    }

    if (options.resendOnly) {
      if (claimants.some(c => typeof c.url !== "string")) {
        throw new Error("Specified resend only but not all claimants have a 'url'");
      }
      for (const c of claimants) {
        await sender(c, claimInfo.info);
      }
    }

    claimants.forEach(c => {
      c.pin = new BN(randomBytes());
      c.seed = options.claimIntegration === "transfer" ? claimInfo.mint.key
             : options.claimIntegration === "candy"    ? claimInfo.config
             : /* === edition */            claimInfo.masterMint.key;
    });



    const base = Keypair.generate();

    const instructions = await buildGumdrop(
      connection,
      wallet.publicKey,
      options.distributionMethod !== "wallets",
      options.claimIntegration,
      options.host,
      base.publicKey,
      temporalSigner,
      claimants,
      claimInfo
    );

    const basePath = logPath(options.env, `${base.publicKey.toBase58()}.json`);
    console.log(`writing base to ${basePath}`);
    fs.writeFileSync(basePath, JSON.stringify([...base.secretKey]));

    const urlPath = logPath(options.env, `urls-${base.publicKey.toBase58()}.json`);
    console.log(`writing claims to ${urlPath}`);
    fs.writeFileSync(urlPath, JSON.stringify(claimants));

    const createResult = await sendTransactionWithRetry(
      connection,
      wallet,
      instructions,
      [base]
    );

    console.log(createResult);
    if (typeof createResult === "string") {
      throw new Error(createResult);
    } else {
      console.log(
        'gumdrop creation succeeded',
        `https://explorer.solana.com/tx/${createResult.txid}?cluster=${options.env}`
      );
    }

    console.log("distributing claim URLs");
    for (const c of claimants) {
      await sender(c, claimInfo.info);
    }
  });


programCommand('close')
  .option(
    '--claim-integration <method>',
    'Backend for claims. Either `transfer` for token-transfers through approve-delegate, `candy` for minting through a candy-machine, or `edition` for minting through a master edition'
  )
  .option(
    '--candy-config <config>',
    'candy: public key of the candy machine config'
  )
  .option(
    '--candy-uuid <uuid>',
    'candy: uuid used to construct the candy machine'
  )
  .option(
    '--edition-mint <mint>',
    'edition: mint of the master edition'
  )
  .option(
    '--base <path>',
    'gumdrop authority generated on create'
  )
  .action(async (options, cmd) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const base = loadWalletKey(options.base);
    const connection = new anchor.web3.Connection(
      //@ts-ignore
      options.rpcUrl || anchor.web3.clusterApiUrl(options.env),
    );

    switch (options.claimIntegration) {
      case "transfer": {
        break;
      }
      case "candy": {
        if (!options.candyConfig || !options.candyUuid) {
          throw new Error("No candy-config or candy-uuid provided. Needed to transfer back candy-machine authority");
        }
        break;
      }
      case "edition": {
        if (!options.editionMint) {
          throw new Error("No master-mint provided. Needed to transfer back master");
        }
        break;
      }
      default:
        throw new Error(
          "Claim integration must either be 'transfer', 'candy', or 'edition'.",
        );
    }

    const instructions = await closeGumdrop(
      connection,
      wallet.publicKey,
      base,
      options.claimIntegration,
      options.candyConfig,
      options.candyUuid,
      options.editionMint,
    );

    const closeResult = await sendTransactionWithRetry(
      connection,
      wallet,
      instructions,
      [base]
    );

    console.log(closeResult);
    if (typeof closeResult === "string") {
      throw new Error(closeResult);
    } else {
      console.log(
        'gumdrop close succeeded',
        `https://explorer.solana.com/tx/${closeResult.txid}?cluster=${options.env}`
      );
    }
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
    .option(
      '-r, --rpc-url <string>',
      'Custom rpc url',
    )
    .option('-l, --log-level <string>', 'log level', setLogLevel)
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}

function loadWalletKey(keypair) : Keypair {
  if (!keypair || keypair == '') {
    throw new Error('Keypair is required!');
  }
  const loaded = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString())),
  );
  log.info(`wallet public key: ${loaded.publicKey}`);
  return loaded;
}

function logPath(
  env: string,
  logName: string,
  cPath: string = LOG_PATH,
) {
  return path.join(cPath, `${env}-${logName}`);
}

// NB: assumes no overflow
function randomBytes() : Uint8Array {
  // TODO: some predictable seed? sha256?
  return crypto.randomBytes(4);
}

async function sendTransactionWithRetry(
  connection: RPCConnection,
  wallet: Keypair,
  instructions: Array<TransactionInstruction>,
  signers: Array<Keypair>,
  commitment: Commitment = "singleGossip",
) : Promise<string| { txid: string; slot: number }> {

  let transaction = new Transaction();
  instructions.forEach((instruction) => transaction.add(instruction));
  transaction.recentBlockhash = (
    (await connection.getRecentBlockhash(commitment))
  ).blockhash;

  transaction.setSigners(
    // fee payed by the wallet owner
    wallet.publicKey,
    ...signers.map((s) => s.publicKey)
  );

  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }
  transaction.partialSign(wallet);

  return sendSignedTransaction({
    connection,
    signedTransaction: transaction,
  });
};

program.parse(process.argv);
