import React from "react";
import { RouteComponentProps, } from "react-router-dom";
import queryString from 'query-string';

import ContentLoader from 'react-content-loader';
import { Button, Image } from 'antd';
import {
  Box,
  Card,
  Chip,
  Link as HyperLink,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Stack,
  Tooltip,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import RemoveIcon from '@mui/icons-material/Remove';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import {
  AccountMeta,
  Connection as RPCConnection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  AccountLayout,
  MintLayout,
  Token,
} from '@solana/spl-token'
import * as anchor from '@project-serum/anchor';
import {
  Connection,
  useConnectionConfig,
  chunks,
  decodeEdition,
  decodeMasterEdition,
  decodeMetadata,
  getMultipleAccounts, // wrapper that does chunking
  getUnixTs,
  Metadata,
  MetadataKey,
  notify,
  shortenAddress,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@oyster/common';
import BN from 'bn.js';
import { capitalize } from 'lodash';

import {
  useLoading,
} from '../../components/Loader';
import {
  CachedImageContent,
} from '../../components/ArtContent';
import {
  useAnchorContext,
} from '../../contexts/anchorContext';
import useWindowDimensions from '../../utils/layout';
import {
  getAssociatedTokenAccount,
  getEdition,
  getEditionMarkerPda,
  getMetadata,
} from '../../utils/accounts';
import {
  FIREBALL_PREFIX,
  FIREBALL_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
} from '../../utils/ids';
import {
  envFor,
  explorerLinkFor,
} from '../../utils/transactions';
import {
  MerkleTree,
} from "../../utils/merkleTree";

export const ThreeDots = () => (
  <ContentLoader
    viewBox="0 0 212 200"
    height={200}
    width={212}
    backgroundColor="transparent"
    style={{
      width: '100%',
      margin: 'auto',
    }}
  >
    <circle cx="86" cy="100" r="8" />
    <circle cx="106" cy="100" r="8" />
    <circle cx="126" cy="100" r="8" />
  </ContentLoader>
);

const createMintAndAccount = async (
  connection : RPCConnection,
  walletKey : PublicKey,
  mint : PublicKey,
  setup : Array<TransactionInstruction>,
) => {
  const walletTokenKey = await getAssociatedTokenAccount(
      walletKey, mint);

  setup.push(SystemProgram.createAccount({
    fromPubkey: walletKey,
    newAccountPubkey: mint,
    space: MintLayout.span,
    lamports:
      await connection.getMinimumBalanceForRentExemption(
        MintLayout.span,
      ),
    programId: TOKEN_PROGRAM_ID,
  }));

  setup.push(Token.createInitMintInstruction(
    TOKEN_PROGRAM_ID,
    mint,
    0,
    walletKey,
    walletKey,
  ));

  setup.push(Token.createAssociatedTokenAccountInstruction(
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    walletTokenKey,
    walletKey,
    walletKey
  ));

  setup.push(Token.createMintToInstruction(
    TOKEN_PROGRAM_ID,
    mint,
    walletTokenKey,
    walletKey,
    [],
    1,
  ));

}

type MintAndImage = {
  mint: PublicKey,
  name: string,
  image: string,
  description: string,
};

type RelevantMint = MintAndImage & { ingredient : string };

type OnChainIngredient = RelevantMint;

type WalletIngredient = RelevantMint & {
  tokenAccount : PublicKey,
  parent ?: {
    edition : PublicKey,
    masterMint : PublicKey,
    masterEdition : PublicKey,
  },
};

// remaining is never technically strictly up-to-date...
// TODO: add as of block height?
type RecipeYield = MintAndImage & { remaining : number };

const fetchMintsAndImages = async (
  connection : RPCConnection,
  mintKeys : Array<PublicKey>
) : Promise<Array<MintAndImage>> => {
  const metadataKeys = await Promise.all(mintKeys.map(getMetadata));
  const metadataAccounts = await (connection as any).getMultipleAccountsInfo(metadataKeys);

  const metadatasDecoded : Array<Metadata> = metadataAccounts
    .map((account, idx) => {
      if (account === null) {
        const missingMint = mintKeys[idx].toBase58();
        notify({
          message: 'Fetch mint failed',
          description: `Could not fetch metadata for mint ${missingMint}`,
        });
        return null;
      }

      return decodeMetadata(account.data);
    })
    .filter((ret) : ret is Metadata => ret !== null);

  const schemas = await Promise.all(metadatasDecoded.map(m => fetch(m.data.uri)));
  const schemaJsons = await Promise.all(schemas.map(s => s.json()));

  console.log(schemaJsons);

  return schemaJsons.map((schema, idx) => {
    return {
      mint: new PublicKey(metadatasDecoded[idx].mint),
      name: schema.name,
      image: schema.image,
      description: schema.description,
    };
  });
};

export const getEditionsRemaining = async (
  connection : RPCConnection,
  masterMints: Array<PublicKey>,
) => {
  const masterEditions = await Promise.all(masterMints.map(m => getEdition(m)));

  const editionAccounts = await (connection as any).getMultipleAccountsInfo(masterEditions);
  return editionAccounts
    .map((account, idx) => {
      if (account === null) {
        const missingMint = masterMints[idx].toBase58();
        console.warn(`Could not fetch master edition for mint ${missingMint}`);
        return null;
      }

      const edition = decodeMasterEdition(account.data);
      if (!edition.maxSupply) {
        return NaN;
      }
      const maxSupply = new BN(edition.maxSupply);
      const supply = new BN(edition.supply);
      if (supply.gte(maxSupply)) {
        return [0, maxSupply.toNumber()];
      } else {
        return [maxSupply.sub(supply).toNumber(), maxSupply.toNumber()];
      }
    })
    .reduce((acc, n, idx) => {
      return {
        ...acc,
        [masterMints[idx].toBase58()]: n,
      }
    },
    {});
}

export const remainingText = (rem) => {
  if (rem.remaining === null) {
    return ''; // not found
  }
  if (typeof rem.remaining === 'number' && isNaN(rem.remaining)) {
    return ''; // TODO?
  }
  if (rem.remaining[0] === 0) {
    return 'SOLD OUT';
  }
  return `${rem.remaining[0]}/${rem.remaining[1]} remaining`;
};

const getRecipeYields = async (
  connection : RPCConnection,
  masterMints : Array<PublicKey>,
) => {
  const remaining = await getEditionsRemaining(connection, masterMints);

  return (await fetchMintsAndImages(
      connection,
      masterMints,
    ))
    .map(r => ({ ...r, remaining: remaining[r.mint.toBase58()] }));
};

const getOnChainIngredients = async (
  connection : RPCConnection,
  recipeKey : PublicKey,
  walletKey : PublicKey,
  ingredientList : Array<any>,
) => {
  const [dishKey, ] = await PublicKey.findProgramAddress(
    [
      FIREBALL_PREFIX,
      recipeKey.toBuffer(),
      walletKey.toBuffer(),
    ],
    FIREBALL_PROGRAM_ID,
  );

  const storeKeys = await Promise.all(ingredientList.map((group, idx) => {
          const ingredientNum = new BN(idx);
          return PublicKey.findProgramAddress(
            [
              FIREBALL_PREFIX,
              dishKey.toBuffer(),
              Buffer.from(ingredientNum.toArray('le', 8)),
            ],
            FIREBALL_PROGRAM_ID,
          );
        }));

  const storeAccounts = await (connection as any).getMultipleAccountsInfo(storeKeys.map(s => s[0]));

  const mints = {};
  for (let idx = 0; idx < ingredientList.length; ++idx) {
    const group = ingredientList[idx];
    const storeAccount = storeAccounts[idx];
    if (storeAccount !== null) {
      const currentStore = AccountLayout.decode(Buffer.from(storeAccount.data));
      mints[new PublicKey(currentStore.mint).toBase58()] = group.ingredient;
    }
  }
  console.log(mints);
  const ingredientImages = await fetchMintsAndImages(
      connection, Object.keys(mints).map(r => new PublicKey(r)));
  const ret = ingredientImages.map(
      r => ({ ...r, ingredient: mints[r.mint.toBase58()] }));
  ret.sort((lft, rht) => lft.ingredient.localeCompare(rht.ingredient));
  return ret;
};

const getRelevantTokenAccounts = async (
  connection : RPCConnection,
  walletKey : PublicKey,
  ingredientList : Array<any>,
) => {
  const mints = {};
  for (const group of ingredientList)
    for (const [idx, mint] of group.mints.entries())
      mints[mint] = {
        ingredient: group.ingredient,
        allowLimitedEdition: group.allowLimitedEditions && group.allowLimitedEditions[idx],
      };

  const owned = await connection.getTokenAccountsByOwner(
      walletKey,
      { programId: TOKEN_PROGRAM_ID },
    );

  const decoded = owned.value.map(v => AccountLayout.decode(v.account.data));

  let editionParentKeys;
  const mintEditions = {};
  if (Object.values(mints).every(m => !(m as any).allowLimitedEdition)) {
    console.log('No limited editions allowed. Skipping fetches');
    editionParentKeys = new Array(decoded.length);
  } else {
    for (const m of Object.keys(mints)) {
      const edition = (await getEdition(new PublicKey(m))).toBase58();
      mintEditions[edition] = {
        allowLimitedEdition: mints[m].allowLimitedEdition,
        ingredient: mints[m].ingredient,
        key: new PublicKey(m),
      };
    }

    const editionKeys = await Promise.all(decoded.map(async (a) => {
      const mint = new PublicKey(a.mint);
      return (await getEdition(mint)).toBase58();
    }));
    const editionDatas = (await getMultipleAccounts(
      // TODO: different commitment?
      connection, editionKeys, 'processed')).array;
    editionParentKeys = editionDatas.map(e => {
      if (!e) {
        // skip if this is a non-NFT token
        return undefined;
      }
      if (e.data[0] == MetadataKey.EditionV1) {
        return decodeEdition(e.data).parent;
      } else {
        return undefined;
      }
    });
  }

  const relevant = decoded
    .map((a, idx) => ({
      ...a,
      tokenAccount: owned.value[idx].pubkey,
      editionParentKey: editionParentKeys[idx],
    }))
    .filter(a => {
    const editionParentKey = a.editionParentKey;
    const mintMatches =
      (new PublicKey(a.mint).toBase58()) in mints
      || (editionParentKey && mintEditions[editionParentKey]?.allowLimitedEdition);
    const hasToken = new BN(a.amount, 'le').toNumber() > 0;
    return mintMatches && hasToken;
  });

  // TODO: getMultipleAccounts
  const relevantImages = await fetchMintsAndImages(
      connection, relevant.map(r => new PublicKey(r.mint)));
  const ret = await Promise.all(relevantImages.map(async (r, idx) => {
    // TODO: better
    const mint = r.mint.toBase58();
    const editionParentKey = relevant[idx].editionParentKey;
    console.log('TA for ', mint, relevant[idx].tokenAccount.toBase58());
    if (mint in mints) {
      return {
        ...r,
        ingredient: mints[mint].ingredient,
        tokenAccount: relevant[idx].tokenAccount,
      };
    } else {
      const parent = mintEditions[editionParentKey];
      if (!(await getEdition(parent.key)).equals(new PublicKey(editionParentKey))) {
        throw new Error(`internal error: mismatched master mint and parent edition`);
      }
      return {
        ...r,
        ingredient: parent.ingredient,  // lookup by parent edition
        tokenAccount: relevant[idx].tokenAccount,
        parent: {
          edition: await getEdition(new PublicKey(mint)),
          masterMint: parent.key,
          masterEdition: new PublicKey(editionParentKey),
        },
      };
    }
  }));
  console.log(ret);
  ret.sort((lft, rht) => lft.ingredient.localeCompare(rht.ingredient));
  return ret;
};

const fetchWalletIngredients = async (
  connection : RPCConnection,
  recipeKey : PublicKey,
  walletKey : PublicKey,
  ingredientList: Array<any>,
) => {
  const onChainIngredientsPromise = getOnChainIngredients(
      connection, recipeKey, walletKey, ingredientList);

  const relevantMintsPromise = getRelevantTokenAccounts(
      connection, walletKey, ingredientList);

  return await Promise.all([onChainIngredientsPromise, relevantMintsPromise]);
};

const fetchRelevantMints = async (
  anchorWallet : anchor.Wallet,
  program : anchor.Program,
  connection : RPCConnection,
  recipeKey : PublicKey,
) => {
  if (!anchorWallet || !program) {
    return;
  }

  const startTime = getUnixTs();
  let recipe;
  try {
    recipe = await program.account.recipe.fetch(recipeKey);
  } catch (err: any) {
    const recipeKeyStr = recipeKey.toBase58();
    throw new Error(`Failed to find recipe ${recipeKeyStr}`);
  }

  console.log('Finished recipe fetch', getUnixTs() - startTime);

  const ingredientUrl = recipe.ingredients.replace(/\0/g, '');
  const ingredientList = await (await fetch(ingredientUrl)).json();

  console.log('Finished ingredients fetch', getUnixTs() - startTime);

  if (recipe.roots.length !== ingredientList.length) {
    throw new Error(`Recipe has a different number of ingredient lists and merkle hashes. Bad configuration`);
  }

  const [onChainIngredients, relevantMints] = await fetchWalletIngredients(
      connection, recipeKey, anchorWallet.publicKey, ingredientList);

  console.log('Finished relevant tokens fetch', getUnixTs() - startTime);

  return {
    ingredientList,
    onChainIngredients,
    relevantMints,
  };
};

enum IngredientView {
  add = 'add',
  recover = 'recover',
}

export type Recipe = {
  image: string,
  name: string,
  mint: PublicKey,
};

export const FireballView = (
  props : {
    recipeKey : PublicKey,
    recipeYields : Array<Recipe>,
    ingredients : { [key: string]: string },
  }
) => {
  const { connection, endpoint, wallet, anchorWallet, program } = useAnchorContext();

  const recipeKey = props.recipeKey;
  const recipes = props.recipeYields;
  const ingredients = props.ingredients;

  const [recipeYields, setRecipeYields] = React.useState<Array<RecipeYield>>([]);
  const [relevantMints, setRelevantMints] = React.useState<Array<WalletIngredient>>([]);
  const [ingredientList, setIngredientList] = React.useState<Array<any>>([]);
  const [dishIngredients, setIngredients] = React.useState<Array<OnChainIngredient>>([]);
  const [changeList, setChangeList] = React.useState<Array<any>>([]);
  const [matchingIndices, setMatchingIndices] = React.useState<{ [key: string]: number }>({});

  const numIngredients = Object.keys(ingredients).length;
  const collected = Object.keys(ingredients).reduce((acc, ingredient) => {
    return acc + +!!(
      dishIngredients.find(c => c.ingredient === ingredient)
      || relevantMints.find(c => c.ingredient === ingredient)
    );
  }, 0);

  const { loading, setLoading } = useLoading();

  React.useEffect(() => {
    if (!connection) return;
    setLoading(true);
    const wrap = async () => {
      try {
        const recipeYieldsPromise = getRecipeYields(connection, recipes.map(r => r.mint));

        setRecipeYields(await recipeYieldsPromise);
      } catch (err: any) {
        console.log('Fetch recipe yields err', err);
      }
      setLoading(false);
    };
    wrap();
  }, [!connection, recipeKey.toBase58()]);

  React.useEffect(() => {
    if (!anchorWallet) {
      setIngredients([])
      setRelevantMints([]);
      setMatchingIndices({});
      return;
    }
    if (!connection || !program) return;
    setLoading(true);
    try {
      const wrap = async () => {
        try {
          const relevantMintsPromise = fetchRelevantMints(
              anchorWallet, program, connection, recipeKey);

          const relevantMintsRes = await relevantMintsPromise;

          if (!relevantMintsRes) {
            notify({
              message: `Failed fetching wallet mints`,
            });
            setLoading(false);
            return;
          }

          const { ingredientList, onChainIngredients, relevantMints } = relevantMintsRes;

          if (ingredientList.length !== numIngredients) {
            notify({
              message: `Mismatching on-chain ingredients list`,
              description: `Expected ${numIngredients} got ${ingredientList.length}`,
            });
          }
          setIngredientList(ingredientList);
          setIngredients(onChainIngredients)
          setRelevantMints(relevantMints);
          setMatchingIndices({});
        } catch (err: any) {
          console.log('Fetch relevant mints err', err);
        }
        setLoading(false);
      };
      wrap();
    } catch (err: any) {
      console.log('Key decode err', err);
      setLoading(false);
    }
  }, [anchorWallet?.publicKey, !program, !connection, recipeKey.toBase58()]);


  const addIngredient = async (e : React.SyntheticEvent, ingredient: string, mint: PublicKey) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    if (dishIngredients.find(c => c.ingredient === ingredient)) {
      throw new Error(`Ingredient ${ingredient} has already been added to this dish`);
    }

    const match = changeList.find(c => c.ingredient === ingredient);
    if (match) {
      if (match.mint.equals(mint)) return;
      if (match.operation !== 'add') {
        throw new Error(`Internal error: Cannot recover and add a mint`);
      }
      const prev = match.mint.toBase58();
      const next = mint.toBase58();
      notify({
        message: "Dish Changes",
        description: `Replaced ingredient ${prev} with ${next}`,
      });

      match.mint = mint;
    } else {
      setChangeList(
        [
          ...changeList,
          {
            ingredient: ingredient,
            mint: mint,
            operation: IngredientView.add,
          },
        ]
      );
    }
  };

  const recoverIngredient = async (e : React.SyntheticEvent, ingredient : string) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    const mint = dishIngredients.find(c => c.ingredient === ingredient);
    if (!mint) {
      throw new Error(`Ingredient ${ingredient} is not part of this dish`);
    }

    const match = changeList.find(c => c.ingredient === ingredient);
    if (match) {
      if (match.mint !== mint.mint || match.operation !== 'recover') {
        throw new Error(`Internal error: Cannot recover and add a mint`);
      }
      // already added
    } else {
      setChangeList(
        [
          ...changeList,
          {
            ingredient: ingredient,
            mint: mint.mint,
            operation: IngredientView.recover,
          },
        ]
      );
    }
  };

  const cancelChangeForIngredient = async (e : React.SyntheticEvent, ingredient: string) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    const newList = [...changeList];
    const idx = newList.findIndex(c => c.ingredient === ingredient);
    if (idx === -1) {
      throw new Error(`Ingredient ${ingredient} is not part of the change-list`);
    }

    newList.splice(idx, 1);
    setChangeList(newList);
  };

  const buildDishChanges = async (e : React.SyntheticEvent, changeList : Array<any>) => {
    e.preventDefault();
    if (!anchorWallet || !program) {
      throw new Error(`Wallet or program is not connected`);
    }

    if (ingredientList.length === 0) {
      throw new Error(`No ingredient list`);
    }

    const startTime = getUnixTs();

    const [dishKey, dishBump] = await PublicKey.findProgramAddress(
      [
        FIREBALL_PREFIX,
        recipeKey.toBuffer(),
        anchorWallet.publicKey.toBuffer(),
      ],
      FIREBALL_PROGRAM_ID,
    );

    const setup : Array<TransactionInstruction> = [];

    const dishAccount = await connection.getAccountInfo(dishKey);
    if (dishAccount === null) {
      setup.push(await program.instruction.startDish(
        dishBump,
        {
          accounts: {
            recipe: recipeKey,
            dish: dishKey,
            payer: anchorWallet.publicKey,
            systemProgram: SystemProgram.programId,
          },
          signers: [],
          instructions: [],
        }
      ));
    }

    console.log('Finished finding dish', getUnixTs() - startTime);

    const storeKeysAndBumps = await Promise.all(ingredientList.map(
      (_, idx) => {
        const ingredientNum = new BN(idx);
        return PublicKey.findProgramAddress(
          [
            FIREBALL_PREFIX,
            dishKey.toBuffer(),
            Buffer.from(ingredientNum.toArray('le', 8)),
          ],
          FIREBALL_PROGRAM_ID,
        );
      }
    ));
    const storeAccounts = await (connection as any).getMultipleAccountsInfo(
        storeKeysAndBumps.map(s => s[0]));
    console.log('Finished fetching stores', getUnixTs() - startTime);

    const recipeData = await program.account.recipe.fetch(recipeKey) as any;

    for (let idx = 0; idx < ingredientList.length; ++idx) {
      const group = ingredientList[idx];
      const change = changeList.find(c => c.ingredient === group.ingredient);

      if (!change) {
        continue;
      }

      const ingredientNum = new BN(idx);
      const [storeKey, storeBump] = storeKeysAndBumps[idx];
      const storeAccount = storeAccounts[idx];
      if (change.operation === IngredientView.add) {
        if (storeAccount === null) {
          // nothing
        } else {
          throw new Error(`Ingredient ${group.ingredient} has already been added to this dish`);
        }

        const relevantMint = relevantMints.find(c => c.mint.equals(change.mint));
        if (!relevantMint) {
          throw new Error(`Could not find wallet mint matching ${relevantMint}`);
        }

        // TODO: cache?
        const mintsKeys = group.mints.map(m => new PublicKey(m));
        const mintIdx = mintsKeys.findIndex(m => m.equals(change.mint));
        const parentIdx = relevantMint.parent
          ? mintsKeys.findIndex(m => m.equals(relevantMint.parent?.masterMint))
          : -1;
        if (mintIdx === -1 && parentIdx == -1) {
          const changeMint = change.mint.toBase58();
          throw new Error(`Could not find mint matching ${changeMint} in ingredient group ${group.ingredient}`);
        }

        const dataFlags = mintsKeys.map((m, idx) => {
          return group.allowLimitedEditions && group.allowLimitedEditions[idx] ? 0x02 : 0x00;
        });
        const tree = new MerkleTree(
          mintsKeys.map(m => m.toBuffer()),
          dataFlags,
        );

        if (!Buffer.from(recipeData.roots[idx]).equals(tree.getRoot())) {
          throw new Error(`Merkle tree for ingredient ${group.ingredientMint} does not match chain`);
        }

        const remainingAccounts : Array<AccountMeta> = [];
        let proof, ingredientMint;
        if (mintIdx !== -1) {
          proof = tree.getProof(mintIdx);
          ingredientMint = change.mint;
        } else {
          if (!relevantMint.parent) { // typescript...
            throw new Error(`internal error: inconsistent parent state`);
          }
          proof = tree.getProof(parentIdx);
          ingredientMint = relevantMint.parent.masterMint;
          remainingAccounts.push(
            {pubkey: change.mint, isSigner: false, isWritable: false},
            {pubkey: relevantMint.parent.edition, isSigner: false, isWritable: false},
            {pubkey: relevantMint.parent.masterEdition, isSigner: false, isWritable: false},
          );
        }

        if (!tree.verifyProof(mintIdx !== -1 ? mintIdx : parentIdx, proof, tree.getRoot())) {
          throw new Error(`Invalid ingredient ${change.mint.toBase58()}: bad merkle proof`);
        }

        setup.push(await program.instruction.addIngredient(
          storeBump,
          ingredientNum,
          proof,
          {
            accounts: {
              recipe: recipeKey,
              dish: dishKey,
              ingredientMint,
              ingredientStore: storeKey,
              payer: anchorWallet.publicKey,
              from: relevantMint.tokenAccount,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            },
            remainingAccounts,
            signers: [],
            instructions: [],
          }
        ));
      } else if (change.operation === IngredientView.recover) {
        if (storeAccount === null) {
          throw new Error(`Ingredient ${group.ingredient} is not in this dish`);
        }

        const walletATA = await getAssociatedTokenAccount(
          anchorWallet.publicKey, change.mint);

        if (!await connection.getAccountInfo(walletATA)) {
          setup.push(Token.createAssociatedTokenAccountInstruction(
            SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            change.mint,
            walletATA,
            anchorWallet.publicKey,
            anchorWallet.publicKey
          ));
        }

        setup.push(await program.instruction.removeIngredient(
          storeBump,
          ingredientNum,
          {
            accounts: {
              dish: dishKey,
              ingredientMint: change.mint,
              ingredientStore: storeKey,
              payer: anchorWallet.publicKey,
              to: walletATA,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            },
            signers: [],
            instructions: [],
          }
        ));
      } else {
        throw new Error(`Unknown change operation ${change.operation}`);
      }
    }

    console.log('Finished building instrs', getUnixTs() - startTime);

    return setup;
  };


  const submitDishChanges = async (e : React.SyntheticEvent) => {
    if (!program || !anchorWallet) {
      // duplicated in buildDishChanges...
      throw new Error(`Wallet or program is not connected`);
    }
    const setup = await buildDishChanges(e, changeList);
    console.log(setup);
    if (setup.length === 0) {
      notify({
        message: `No Dish changes found`,
      });
      return;
    }

    console.log(setup);

    const instrsPerTx = 2; // TODO: adjust based on proof size...
    const chunked = chunks(setup, instrsPerTx);
    let failed = false;
    await Connection.sendTransactions(
      program.provider.connection,
      anchorWallet,
      chunked,
      new Array<Keypair[]>(chunked.length).fill([]),
      Connection.SequenceType.StopOnFailure,
      'singleGossip',
      // success callback
      (txid: string, ind: number) => {
        notify({
          message: `Dish Changes succeeded: ${ind + 1} of ${chunked.length}`,
          description: (
            <HyperLink href={explorerLinkFor(txid, connection)}>
              View transaction on explorer
            </HyperLink>
          ),
        });
      },
      // failure callback
      (reason: string, ind: number) => {
        console.log(`Dish Changes failed on ${ind}: ${reason}`);
        failed = true;
        return true;
      },
    );

    if (failed) {
      throw new Error(`One of the dish changes failed. See console logs`);
    }

    const [ingredients, relevantMints] = await fetchWalletIngredients(
        connection, recipeKey, anchorWallet.publicKey, ingredientList);

    setIngredients(ingredients);
    setRelevantMints(relevantMints);
    setChangeList([]);
    setMatchingIndices({});
  };

  const mintRecipe = async (
    e : React.SyntheticEvent,
    masterMintKey : PublicKey,
    changeList : Array<any>,
  ) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    if (!anchorWallet || !program) {
      throw new Error(`Wallet or program is not connected`);
    }

    if (collected !== numIngredients) {
      throw new Error(`You have not collected all ${numIngredients} ingredients!`);
    }

    const [dishKey, ] = await PublicKey.findProgramAddress(
      [
        FIREBALL_PREFIX,
        recipeKey.toBuffer(),
        anchorWallet.publicKey.toBuffer(),
      ],
      FIREBALL_PROGRAM_ID,
    );

    const [recipeMintOwner, recipeMintBump] = await PublicKey.findProgramAddress(
      [
        FIREBALL_PREFIX,
        recipeKey.toBuffer(),
      ],
      FIREBALL_PROGRAM_ID
    );

    const recipeATA = await getAssociatedTokenAccount(
        recipeMintOwner, masterMintKey);

    const recipeData = await program.account.recipe.fetch(recipeKey) as any;

    const newMint = Keypair.generate();
    const newMetadataKey = await getMetadata(newMint.publicKey);
    const masterMetadataKey = await getMetadata(masterMintKey);
    const newEdition = await getEdition(newMint.publicKey);
    const masterEdition = await getEdition(masterMintKey);

    const setup : Array<TransactionInstruction> = [];
    await createMintAndAccount(connection, anchorWallet.publicKey, newMint.publicKey, setup);

    const masterEditionAccount = await connection.getAccountInfo(masterEdition);
    if (masterEditionAccount === null) {
      throw new Error(`Could not retrieve master edition for mint ${masterMintKey.toBase58()}`);
    }
    const masterEditionDecoded = decodeMasterEdition(masterEditionAccount.data);

    // TODO: less naive?
    const masterEditionSupply = new BN(masterEditionDecoded.supply);
    const edition = masterEditionSupply.add(new BN(1));
    if (!masterEditionDecoded.maxSupply) {
      // no limit. try for next
    } else {
      const maxSupply = new BN(masterEditionDecoded.maxSupply);
      if (edition.gt(maxSupply)) {
        const masterMintStr = masterMintKey.toBase58();
        throw new Error(`No more editions remaining for ${masterMintStr}`);
      }
    }

    const editionMarkKey = await getEditionMarkerPda(masterMintKey, edition);

    setup.push(await program.instruction.makeDish(
      recipeMintBump,
      edition, // edition
      {
        accounts: {
          recipe: recipeKey,
          dish: dishKey,
          payer: anchorWallet.publicKey,
          metadataNewMetadata: newMetadataKey,
          metadataNewEdition: newEdition,
          metadataMasterEdition: masterEdition,
          metadataNewMint: newMint.publicKey,
          metadataEditionMarkPda: editionMarkKey,
          metadataNewMintAuthority: anchorWallet.publicKey,
          metadataMasterTokenOwner: recipeMintOwner,
          metadataMasterTokenAccount: recipeATA,
          metadataNewUpdateAuthority: recipeData.authority,
          metadataMasterMetadata: masterMetadataKey,
          metadataMasterMint: masterMintKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        },
        signers: [],
        instructions: [],
      }
    ));

    const dishChanges = await buildDishChanges(e, changeList);
    const txs = [...dishChanges.map(ix => [ix]), setup];
    const signers = new Array<Keypair[]>(txs.length).fill([]);
    signers[signers.length - 1] = [newMint];
    let failed = false;
    await Connection.sendTransactions(
      program.provider.connection,
      anchorWallet,
      txs,
      signers,
      Connection.SequenceType.StopOnFailure,
      'singleGossip',
      // success callback
      (txid: string, ind: number) => {
        const message =
          ind + 1 < txs.length
          ? `Dish Changes succeeded: ${ind + 1} of ${txs.length - 1}`
          : `Mint succeeded!`;
          notify({
            message,
            description: (
              <HyperLink href={explorerLinkFor(txid, connection)}>
                View transaction on explorer
              </HyperLink>
            ),
          });
      },
      // failure callback
      (reason: string, ind: number) => {
        console.log(`Mint failed on ${ind}: ${reason}`);
        failed = true;
        return true;
      },
    );

    if (failed) {
      throw new Error(`One of the mint instructions failed. See console logs`);
    }

    setRecipeYields(await getRecipeYields(connection, recipes.map(r => r.mint)));

    const [ingredients, relevantMints] = await fetchWalletIngredients(
        connection, recipeKey, anchorWallet.publicKey, ingredientList);

    setIngredients(ingredients);
    setRelevantMints(relevantMints);
    setChangeList([]);
    setMatchingIndices({});
  };


  const explorerLinkForAddress = (key : PublicKey, shorten: boolean = true) => {
    return (
      <HyperLink
        href={`https://explorer.solana.com/address/${key.toBase58()}?cluster=${envFor(connection)}`}
        target="_blank"
        rel="noreferrer"
        title={key.toBase58()}
        underline="none"
        sx={{ fontFamily: 'Monospace' }}
      >
        {shorten ? shortenAddress(key.toBase58()) : key.toBase58()}
      </HyperLink>
    );
  };

  const batchChangeWrapper = (
    inBatch : boolean,
    r : RelevantMint,
    operation : IngredientView,
  ) => {
    return e => {
      setLoading(true);
      const wrap = async () => {
        try {
          if (inBatch) {
            await cancelChangeForIngredient(e, r.ingredient);
          } else if (operation === 'add') {
            await addIngredient(e, r.ingredient, r.mint);
          } else if (operation === 'recover') {
            await recoverIngredient(e, r.ingredient);
          } else {
            // TODO: error earlier...
            throw new Error(`Unknown operation ${operation}`);
          }
          setLoading(false);
        } catch (err: any) {
          notify({
            message: `${inBatch ? 'Cancel of ' : ''} ${capitalize(operation)} ingredient failed`,
            description: `${err}`,
          });
          setLoading(false);
        }
      };
      wrap();
    };
  };

  // TODO: more robust
  const maxWidth = 1440;
  const outerPadding = 96 * 2;
  const columnsGap = 40;
  const maxColumns = 4;
  const columnWidth = (maxWidth - outerPadding - columnsGap * (maxColumns - 1)) / maxColumns;

  const tilePadding = 0;
  const imageWidth = columnWidth - tilePadding * 2;

  const { width } = useWindowDimensions();
  const sizedColumns = (width : number) => {
           if (width > columnWidth * 4 + columnsGap * 3 + outerPadding) {
      return 4;
    } else if (width > columnWidth * 3 + columnsGap * 2 + outerPadding) {
      return 3;
    } else if (width > columnWidth * 2 + columnsGap * 1 + outerPadding) {
      return 2;
    } else {
      return 1;
    }
  };
  const cols = sizedColumns(width);
  const topDisabled = !anchorWallet || !program || loading;

  const imgBorderStyle = {
    borderRadius: "5px",
    padding: 2,
    backgroundColor: "#888",
  };

  const onCraft = (recipe) => {
    return e => {
      setLoading(true);
      const wrap = async () => {
        try {
          const newIngredients = Object.keys(ingredients).reduce(
            (acc, ingredient) => {
              if (dishIngredients.find(c => c.ingredient === ingredient)) {
                return acc;
              }
              const matchingIngredients = relevantMints.filter(
                  c => c.ingredient === ingredient);
              if (matchingIngredients.length === 0) {
                throw new Error(`You don't have ingredient ${ingredient}`);
              }
              let index = matchingIndices[ingredient] || 0;
              if (index >= matchingIngredients.length) {
                console.warn(`Bad index ${index} of ${matchingIngredients.length} for ${ingredient}`);
                index = 0;
              }
              const m = matchingIngredients[index];
              return {
                ...acc,
                [ingredient]: {
                  ingredient,
                  mint: m.mint,
                  operation: IngredientView.add,
                },
              };
            },
            {}
          );
          setChangeList(Object.values(newIngredients));
          await mintRecipe(e, recipe.mint, Object.values(newIngredients));
          setLoading(false);
        } catch (err: any) {
          notify({
            message: `Mint failed`,
            description: err.message,
          });
          setChangeList([]);
          setLoading(false);
        }
      };
      wrap();
    }
  };

  const craftButtonC = (recipe, disabled, buttonStyle = {}) => {
    return (
      <Tooltip
        title={(
          <div>
            Craft with the first {numIngredients} ingredients found in your
            wallet. Pick and choose specific ingredients below!
          </div>
        )}
      >
        <span>
        <Button
          style={{
            ...buttonStyle,
            borderRadius: "30px",
            height: "45px",
            color: disabled ? "gray" : "white",
            borderColor: disabled ? "gray" : "white",
          }}
          disabled={disabled}
          onClick={onCraft(recipe)}
        >
          Craft
        </Button>
        </span>
      </Tooltip>
    );
  };


  const singleYieldC = () => {
    if (recipes.length !== 1) {
      throw new Error(`internal error: expected exactly 1 yield for this view`);
    }
    const recipe = recipes[0];
    const recipeYieldAvailable = recipeYields.find(y => y.mint.equals(recipe.mint));
    const actualColumnWidth = (Math.min(width, maxWidth) - outerPadding - columnsGap * (cols - 1)) / cols;
    return (
      <React.Fragment>
        <p className={"text-title"}>{recipe.name}</p>
        <p className={"text-subtitle"}>
          You can burn {numIngredients} NFTs to redeem this limited edition.
        </p>
        <Box style={{ height: '10px' }} />
        <Stack
          direction={cols > 1 ? "row" : "column"}
          spacing={0}
        >
          <CachedImageContent
            uri={recipe.image}
            className={"fullAspectRatio"}
            style={{
              ...(cols > 1 ? { maxWidth: actualColumnWidth } : {}),
              minWidth: actualColumnWidth,
            }}
          />
          <Stack
            spacing={1}
            style={{
              ...(cols > 3 ? { paddingRight: '200px' } : {}),
              ...(
                cols > 1
                ? { paddingLeft: `${columnsGap}px` }
                : { paddingTop: '20px', paddingBottom: '20px', }
              ),
            }}
          >
            <div>
              <p
                className={"text-subtitle"}
                style={{ fontSize: '15px' }}
              >
                {recipeYieldAvailable?.description}
              </p>
            </div>
            <div>
              {explorerLinkForAddress(recipe.mint)}
            </div>
            <div>
            {recipeYieldAvailable && (
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: "10px",
                  color: "gray",
                  lineHeight: "normal",
                }}
              >
                {remainingText(recipeYieldAvailable)}
              </p>
            )}
            </div>
            <div>
            {craftButtonC(recipe, topDisabled || !recipeYieldAvailable)}
            </div>
          </Stack>
        </Stack>
      </React.Fragment>
    );
  };

  const multipleYieldC = () => (
    <React.Fragment>
      <p className={"text-subtitle"}>
        <div>
          You can burn {numIngredients} NFTs to redeem one of these limited
          editions.
        </div>
      </p>
      <Box style={{ height: '10px' }} />
      <ImageList cols={cols} gap={columnsGap}>
        {recipes.map((r, idx) => {
          const recipeYieldAvailable = recipeYields.find(y => y.mint.equals(r.mint));
          return (
            <div
              key={idx}
            >
              <ImageListItem>
                <CachedImageContent
                  uri={r.image}
                  className={"fullAspectRatio"}
                />
                <ImageListItemBar
                  title={r.name}
                  subtitle={(
                    <div>
                      {explorerLinkForAddress(r.mint)}
                    </div>
                  )}
                  position="below"
                />
                {recipeYieldAvailable && (
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: "10px",
                      color: "gray",
                      lineHeight: "normal",
                    }}
                  >
                    {remainingText(recipeYieldAvailable)}
                  </p>
                )}
                {craftButtonC(r, topDisabled || !recipeYieldAvailable)}
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>
    </React.Fragment>
  );

  // TODO: lift wording
  return (
    <Stack
      spacing={1}
    >
      {recipes.length > 1 ? multipleYieldC() : singleYieldC()}

      <Box style={{ height: '20px' }} />

      <div className={"row"}>
        <p className={"text-title"}>Your NFTs</p>
        <div className={"unlock-nft"}>
          <p className={"unlock-text"}>
            {`${collected}/${Object.keys(ingredients).length} NFTs collected`}
          </p>
        </div>
      </div>
      <p className={"text-subtitle"}>The NFTs you have collected.</p>
      <Tooltip
        title="Manually add or remove ingredients by selecting mints"
        style={{
          maxWidth: "300px",
        }}
      >
        <span>
        <Button
          style={{
            width: "100%",
            borderRadius: "30px",
            height: "30px",
            color: topDisabled ? "gray" : "white",
            borderColor: topDisabled ? "gray" : "white",
          }}
          disabled={topDisabled}
          onClick={e => {
            setLoading(true);
            const wrap = async () => {
              try {
                await submitDishChanges(e);
                setLoading(false);
              } catch (err: any) {
                console.log(err);
                notify({
                  message: `Dish Changes failed`,
                  description: err.message,
                });
                setLoading(false);
              }
            };
            wrap();
          }}
        >
          Change Ingredients
        </Button>
        </span>
      </Tooltip>

      <ImageList
        cols={cols}
        gap={columnsGap}
        style={{
          paddingTop: '20px',
        }}
      >
        {Object.keys(ingredients).map((ingredient, idx) => {
          const dishIngredient = dishIngredients.find(c => c.ingredient === ingredient);
          const matchingIngredients = relevantMints.filter(c => c.ingredient === ingredient);

          let imgStyle, disabled;
          if (dishIngredient || matchingIngredients.length > 0) {
            imgStyle = {}
            disabled = false;
          } else {
            imgStyle = { filter: "grayscale(100%)", };
            disabled = true;
          }

          let index = matchingIndices[ingredient] || 0;
          if (matchingIngredients.length > 0 && index >= matchingIngredients.length) {
            console.warn(`Bad index ${index} of ${matchingIngredients.length} for ${ingredient}`);
            index = 0;
          }
          const r = dishIngredient ? dishIngredient : matchingIngredients[index];
          const operation = dishIngredient ? IngredientView.recover: IngredientView.add;
          const inBatch = changeList.find(
              c => r && c.mint.equals(r.mint) && c.operation === operation);
          return (
            <div
              key={idx}
              style={{
                minWidth: columnWidth,
              }}
            >
              <ImageListItem>
                <CachedImageContent
                  uri={ingredients[ingredient]}
                  style={{
                    ...imgBorderStyle,
                    padding: inBatch ? 10 : imgBorderStyle.padding,
                    backgroundColor: dishIngredient ? "#2D1428" : imgBorderStyle.backgroundColor,
                    ...imgStyle,
                  }}
                />
                <ImageListItemBar
                  title={(
                    <div
                      style={{
                        maxWidth: columnWidth
                            - tilePadding * 2
                            - 40 * (matchingIngredients.length > 1 ? 3 : 1),
                        overflow: 'wrap',
                      }}
                    >
                      {ingredient}
                    </div>
                  )}
                  subtitle={
                    r
                      ? (
                        <div>
                          {explorerLinkForAddress(r.mint)}
                          {"\u00A0"}
                          {dishIngredient && (
                            <Tooltip
                              title="Added for Crafting"
                            >
                            <Chip
                              label="Added"
                              size="small"
                              style={{
                                background: "#4E2946",
                                color: "white",
                              }}
                            />
                            </Tooltip>
                          )}
                        </div>
                      )
                      : <p style={{ fontFamily: 'Monospace' }}>{"\u00A0"}</p>
                  }
                  actionIcon={
                    <div style={{ paddingTop: "6px", paddingBottom: "12px" }}>
                      {!dishIngredient && matchingIngredients.length > 1 && (
                        <React.Fragment>
                          <IconButton
                            style={{
                              color: index == 0 ? "gray" : "white",
                            }}
                            disabled={index == 0}
                            onClick={() => {
                              const nextIndex = index - 1;
                              setMatchingIndices({
                                ...matchingIndices,
                                [ingredient]: nextIndex,
                              });
                            }}
                          >
                            <ChevronLeftIcon />
                          </IconButton>
                          <IconButton
                            style={{
                              color: index == matchingIngredients.length - 1 ? "gray" : "white",
                            }}
                            disabled={index == matchingIngredients.length - 1}
                            onClick={() => {
                              const nextIndex = index + 1;
                              setMatchingIndices({
                                ...matchingIndices,
                                [ingredient]: nextIndex,
                              });
                            }}
                          >
                            <ChevronRightIcon />
                          </IconButton>
                        </React.Fragment>
                      )}
                      <IconButton
                        style={{
                          color: disabled ? "gray" : "white",
                        }}
                        disabled={disabled}
                        onClick={batchChangeWrapper(inBatch, r, operation)}
                      >
                        {!inBatch ? (operation == IngredientView.add ? <AddIcon /> : <RemoveIcon />)
                                  : <CancelIcon />}
                      </IconButton>
                    </div>
                  }
                  position="below"
                />
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>
    </Stack>
  );
};

