#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { program } from 'commander';
import log from 'loglevel';
import fetch from 'node-fetch';

import {
  Commitment,
  Connection as RPCConnection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';

import {
  getMetadata,
  getTokenWallet,
  loadAsyncArtProgram,
} from './helpers/accounts';
import {
  loadCache,
  saveCache,
} from './helpers/cache';
import {
  EXTENSION_PNG,
} from './helpers/constants';
import {
  sendSignedTransaction,
} from './helpers/transactions';
import { arweaveUpload } from './helpers/upload/arweave';
import {
  createImage,
  createLayer,
  createMaster,
  compositeImage,
  getAsyncArtMeta,
  getAsyncArtMint,
  pasteRGBImage,
} from './helpers/asyncart/create';

program.version('0.0.1');

const LOG_PATH = './.log';

if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH);
}

log.setLevel(log.levels.DEBUG);

programCommand('upload')
  .option(
    '--file <number>',
    `File specification`,
  )
  .action(async (options) => {
    log.info(`Parsed options:`, options);

    const schema = JSON.parse(fs.readFileSync(options.file).toString());

    let files : Array<string> = [];
    files.push(schema.uri);
    for (const layer of schema.layers) {
      files.push(layer.uri);
      for (const image of layer.images) {
        files.push(image.uri);
      }
    }
    files = files.map(f => path.join(path.dirname(options.file), f));

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const savedContent = loadCache(options.cacheName, options.env);
    const cacheContent = savedContent || {};

    let existingInCache = [];
    if (!cacheContent.items) {
      cacheContent.items = {};
    } else {
      existingInCache = Object.keys(cacheContent.items);
    }

    const seen = {};
    const newFiles = [];

    files.forEach(f => {
      if (!seen[f.replace(EXTENSION_PNG, '').split('/').pop()]) {
        seen[f.replace(EXTENSION_PNG, '').split('/').pop()] = true;
        newFiles.push(f);
      }
    });
    existingInCache.forEach(f => {
      if (!seen[f]) {
        seen[f] = true;
        newFiles.push(f + '.png');
      }
    });

    const images = newFiles.filter(val => path.extname(val) === EXTENSION_PNG);
    const SIZE = images.length;

    for (let i = 0; i < SIZE; i++) {
      const image = images[i];
      const imageName = path.basename(image);
      const index = imageName.replace(EXTENSION_PNG, '');

      if (i % 50 === 0) {
        log.info(`Processing file: ${i}`);
      } else {
        log.debug(`Processing file: ${i}`);
      }

      let link = cacheContent?.items?.[index]?.link;
      if (!link) {
        const manifestPath = image.replace(EXTENSION_PNG, '.json');
        const manifestContent = fs
          .readFileSync(manifestPath)
          .toString()
          .replace(imageName, 'image.png')
          .replace(imageName, 'image.png');
        const manifest = JSON.parse(manifestContent);

        const manifestBuffer = Buffer.from(JSON.stringify(manifest));

        try {
          link = await arweaveUpload(
            wallet,
            anchorProgram,
            options.env,
            image,
            manifestBuffer,
            manifest,
            index,
          );

          if (link) {
            log.debug('setting cache for ', index);
            cacheContent.items[index] = {
              link,
              name: manifest.name,
            };
            saveCache(options.cacheName, options.env, cacheContent);
          }
        } catch (er) {
          log.error(`Error uploading file ${index}`, er);
        }
      }
    }

    if (!cacheContent.schema?.link) {
      try {
        const storedSchema = buildStoredSchema(schema, cacheContent);
        const storedBuffer = Buffer.from(JSON.stringify(storedSchema));
        storedSchema.name = 'schema'; // for logging...
        // lol create a temporary empty file to stand-in for the 'image'
        const empty = Keypair.generate().publicKey.toBase58();
        fs.writeFileSync(empty, '');
        const schemaLink = await arweaveUpload(
          wallet,
          anchorProgram,
          options.env,
          empty,
          storedBuffer,
          storedSchema,
          'schema',
        );

        if (schemaLink) {
          log.debug('setting cache for schema');
          cacheContent.schema = {
            link: schemaLink,
          };
          saveCache(options.cacheName, options.env, cacheContent);
        }
      } catch (er) {
        log.error(`Error uploading schema`, er);
      }
    }
  });

// NB: assumes already uploaded
programCommand('create')
  .option(
    '--base <path>',
    `Base key for the collection`,
    '--base not provided',
  )
  .action(async (options) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const base = loadWalletKey(options.base);

    const create = async (instr : TransactionInstruction) => {
      const createResult = await sendTransactionWithRetry(
        anchorProgram.provider.connection,
        wallet,
        [instr],
        [base],
      );

      log.info(createResult);
    };

    // TODO: this is somewhat RPC heavy... use local cache?
    const onChain = async (address : PublicKey) => {
      return await anchorProgram.provider.connection.getAccountInfo(address) !== null;
    }

    const cacheContent = loadCache(options.cacheName, options.env);

    if (!cacheContent?.schema?.link) {
      throw new Error("No schema uploaded yet");
    }

    const byLink = {};
    for (const idx of Object.keys(cacheContent.items)) {
      byLink[cacheContent.items[idx].link] = idx; // TODO: OG URI?
    }

    const schema = await (await fetch(cacheContent.schema.link)).json();

    const masterURI = schema.uri;
    if (!(masterURI in byLink)) {
      throw new Error(`Could not find URI ${masterURI} in cached state`);
    }

    if (!await onChain((await getAsyncArtMeta(base.publicKey))[0])) {
      log.info(`Creating master metadata`);
      const masterMetadata = await (await fetch(schema.uri)).json();
      const instr = await createMaster(
        cacheContent.schema.link,
        {
          name: masterMetadata.name,
          symbol: masterMetadata.symbol,
          uri: masterURI,
          sellerFeeBasisPoints: masterMetadata.seller_fee_basis_points,
        },
        base.publicKey,
        wallet,
        anchorProgram
      );

      await create(instr);
    }

    for (let layerIndex = 0; layerIndex < schema.layers.length; ++layerIndex) {
      const layer = schema.layers[layerIndex];
      if (!(layer.uri in byLink)) {
        throw new Error(`Could not find URI ${layer.uri} in cached state`);
      }

      const layerIndexBuffer = Buffer.from(new BN(layerIndex).toArray("le", 8));
      const [layerKey, ] = await getAsyncArtMeta(base.publicKey, layerIndexBuffer);
      if (!await onChain(layerKey)) {
        log.info(`Creating layer ${layerIndex} metadata`);
        const layerMetadata = await (await fetch(layer.uri)).json();
        const instr = await createLayer(
          layerIndex,
          {
            name: layerMetadata.name,
            symbol: layerMetadata.symbol,
            uri: layer.uri,
            sellerFeeBasisPoints: layerMetadata.seller_fee_basis_points,
          },
          base.publicKey,
          wallet,
          anchorProgram
        );

        await create(instr);
      }

      for (let imageIndex = 0; imageIndex < layer.images.length; ++imageIndex) {
        const image = layer.images[imageIndex];

        if (!(image.uri in byLink)) {
          throw new Error(`Could not find URI ${image.uri} in cached state`);
        }

        // TODO: a bit inconsistent that we use the mint here but no direct
        // metadata for the image
        const imageIndexBuffer = Buffer.from(new BN(imageIndex).toArray("le", 8));
        if (!await onChain((await getAsyncArtMint(layerKey, imageIndexBuffer))[0])) {
          log.info(`Creating image ${imageIndex} of layer ${layerIndex} metadata`);
          const imageMetadata = await (await fetch(image.uri)).json();
          const instr = await createImage(
            layerIndex,
            imageIndex,
            {
              name: imageMetadata.name,
              symbol: imageMetadata.symbol,
              uri: image.uri,
              sellerFeeBasisPoints: imageMetadata.seller_fee_basis_points,
            },
            base.publicKey,
            wallet,
            anchorProgram
          );

          await create(instr);
        }
      }
    }
  });

// NB: assumes already created. fetches configuration from on-chain
programCommand('composite_image')
  .option(
    '--base <pubkey>',
    `Base key for the collection`,
    '--base not provided',
  )
  .action(async (options) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const base = new PublicKey(options.base);

    await compositeImage(base, anchorProgram);
  });

// NB: assumes already created. fetches configuration from on-chain
programCommand('paste_rgb_image')
  .option(
    '--base <pubkey>',
    `Base key for the collection`,
    '--base not provided',
  )
  .action(async (options) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const base = new PublicKey(options.base);

    await pasteRGBImage(base, anchorProgram);
  });

programCommand('update_layer_value')
  .option(
    '--base <pubkey>',
    `Base key for the collection`,
    '--base not provided',
  )
  .option(
    '--layer <number>',
    `Layer to set value for`,
  )
  .option(
    '--value <number>',
    `Value to set`,
  )
  .action(async (options) => {
    log.info(`Parsed options:`, options);

    const layer = Number(options.layer);
    const value = Number(options.value);
    if (isNaN(layer) || isNaN(value)) {
      throw new Error(`Could not parse layer ${layer} or value ${value}`);
    }

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const base = new PublicKey(options.base);

    const layerIndexBuffer = Buffer.from(new BN(layer).toArray("le", 8));
    const [layerKey, layerBump] = await getAsyncArtMeta(base, layerIndexBuffer);

    {
      // check that this image exists...
      const imageIndexBuffer = Buffer.from(new BN(value).toArray("le", 8));
      const [imageMintKey, ] = await getAsyncArtMint(layerKey, imageIndexBuffer);

      const imageMetadataKey = await getMetadata(imageMintKey);
      const imageMetadataAccount = await anchorProgram.provider.connection.getAccountInfo(imageMetadataKey);

      if (imageMetadataAccount === null) {
        throw new Error(`Layer ${layer} does not have an image at index ${value}`);
      }
    }

    const [mintKey, mintBump] = await getAsyncArtMint(base, layerIndexBuffer);

    const walletTokenKey = await getTokenWallet(wallet.publicKey, mintKey);

    const instr = await anchorProgram.instruction.updateLayerValue(
      layerBump,
      mintBump,
      new BN(layer),
      new BN(value),
      {
        accounts: {
          base: base,
          layer: layerKey,
          mint: mintKey,
          payer: wallet.publicKey,
          payerTa: walletTokenKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [],
      },
    );

    const updateResult = await sendTransactionWithRetry(
      anchorProgram.provider.connection,
      wallet,
      [instr],
      [],
    );

    log.info(updateResult);
  });

programCommand('create_master')
  .action(async (options) => {
    log.info(`Parsed options:`, options);

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const cacheContent = loadCache(options.cacheName, options.env);

    if (!cacheContent?.schema?.link) {
      throw new Error("No schema uploaded yet");
    }

    const schema = await (await fetch(cacheContent.schema.link)).json();
    const master = await (await fetch(schema.uri)).json();

    const instr = await createMaster(
      cacheContent.schema.link,
      {
        name: master.name,
        symbol: master.symbol,
        uri: schema.uri,
        sellerFeeBasisPoints: master.seller_fee_basis_points,
      },
      wallet.publicKey,
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
  .action(async (options) => {
    log.info(`Parsed options:`, options);

    const index = Number(options.index);
    if (isNaN(index)) {
      throw new Error(`Unable to parse index ${options.index}`);
    }

    const wallet = loadWalletKey(options.keypair);
    const anchorProgram = await loadAsyncArtProgram(wallet, options.env);

    const cacheContent = loadCache(options.cacheName, options.env);

    if (!cacheContent?.schema?.link) {
      throw new Error("No schema uploaded yet");
    }

    const schema = await (await fetch(cacheContent.schema.link)).json();

    if (schema.layers.length >= index) {
      throw new Error(`Only ${schema.layers.length} layers available (0-indexed)`);
    }

    const layer = await (await fetch(schema.layers[index])).json();

    const instr = await createLayer(
      index,
      {
        name: layer.name,
        symbol: layer.symbol,
        uri: schema.layers[index],
        sellerFeeBasisPoints: layer.seller_fee_basis_points,
      },
      wallet.publicKey,
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
    .option('-c, --cache-name <string>', 'Cache file name', 'asyncart')
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

function buildStoredSchema(
  schema: any,
  cache: any,
) {
  const ret = JSON.parse(JSON.stringify(schema));
  ret.uri = cache.items[ret.uri.replace(EXTENSION_PNG, '')].link;
  for (const layer of ret.layers) {
    layer.uri = cache.items[layer.uri.replace(EXTENSION_PNG, '')].link;
    for (const image of layer.images) {
      image.uri = cache.items[image.uri.replace(EXTENSION_PNG, '')].link;
    }
  }
  return ret;
}

program.parse(process.argv);
