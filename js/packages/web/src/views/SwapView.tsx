import React from "react";
import useWindowDimensions from '../utils/layout';
import {
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Stack,
} from "@mui/material";
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { Collapse } from 'antd';
import {
  useConnection,
  notify,
  shortenAddress,
  decodeMetadata,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  WRAPPED_SOL_MINT,
  Metadata,
  getMultipleAccounts,
} from '@oyster/common';
import * as anchor from '@project-serum/anchor';
import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  Transaction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  AccountLayout,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { useWallet } from "@solana/wallet-adapter-react";
import BN from 'bn.js';

import {
  CachedImageContent,
} from '../components/ArtContent';
import { useLoading } from '../components/Loader';
import {
  envFor,
  explorerLinkFor,
  sendSignedTransaction,
} from '../utils/transactions';
import {
  TOKEN_ENTANGLEMENT_PROGRAM_ID,
} from '../utils/ids';
import {
  getAssociatedTokenAccount,
  getMetadata,
} from '../utils/accounts';


const entanglements = [
  {
    name: "red moon city",
    url: "https://arweave.net/eCHU4AYiHhcI1tI1-jnwHDopH2t-86UHpjAcnZs9jlw",
    image: "https://www.arweave.net/5QZEycZ7nbIpLEINkwjZwQLZuVPzoArW3ayr_931f0k",
    pairs: [
      {
        edition: 1,
        mintA: new PublicKey("9WGUcsZsdegD1YZwp7ACiGf226ZxWTXRskxvM6soWazq"),
        mintB: new PublicKey("6SiZLr5vRdAMWmJRLC63DYs27gHq2gDMQNp3jSV43yrU"),
      },
      {
        edition: 2,
        mintA: new PublicKey("6qqnX651YSsjPPCjDf4PaKVk69waSfMEVuB5USxppeWk"),
        mintB: new PublicKey("9QCLF2M17HdCLKu7whcV688SkC3g8YhxJiEXxAkPSCaT"),
      },
      {
        edition: 3,
        mintA: new PublicKey("HV9DrFAaWBoNqi3bW1Kbu3pkYQ9YBVXEUrvc9WBBVoXd"),
        mintB: new PublicKey("6EUY2rL4kQnw1BShhnaAfV62HRgmgcoVh2CEDUKDPiR5"),
      },
      {
        edition: 4,
        mintA: new PublicKey("AD97f7kJjsBzRx5xL6aTXmWQD7kYejEW14Z3jcxLczDE"),
        mintB: new PublicKey("AMenJXE9h4XjwBsnkUuvcBSxqxmujjxGQCCdixXSJNrN"),
      },
      {
        edition: 5,
        mintA: new PublicKey("BentUWDMka73geHD2qTwokfXoxorb8K8VrtKuZkKE9No"),
        mintB: new PublicKey("HB6ReN7r1tiQ6MXDkkkpTiu5yPahexremSqVSdT2VTYh"),
      },
    ],
  },
  {
    name: "blue moon beach",
    url: "https://arweave.net/2cYtDvEZbrCFlQAEZd4aNW0-lLwPxJ1qvJA5u49FyfE",
    image: "https://www.arweave.net/fVAV9PqndSynp4dPx8iLxk6ZCVnu3ZRSRFaQ2TeF_2o",
    pairs: [
      {
        edition: 1,
        mintA: new PublicKey("3t8S6FUqtDriWX18K7eGqeUnvjKXR6utqg7GqLfcwKXc"),
        mintB: new PublicKey("AurY6syPcbGxWvsgMQiEcMfjY22YHdDqwLwtGU7hzfWS"),
      },
      {
        edition: 2,
        mintA: new PublicKey("3C6beAkftjvYexRua9heov6qh2t8L3UC81JN85KmPdRx"),
        mintB: new PublicKey("9MCSb2C8mh4BVeWf69f411qNCXyQTrDJDmLUk2QFLqVZ"),
      },
    ],
  },
  {
    name: "once in a solana moon",
    url: "https://arweave.net/W61PKwyKmGOjYowwt_6vGAp2a-KV7SV2L2ntlsfIjXQ",
    image: "https://www.arweave.net/pp8f8nU1NUuashXVrTMdD53SSBN0DCr1r8FAAhd_nXY",
    pairs: [
      {
        edition: 1,
        mintA: new PublicKey("B7T1QJFH1ZczVEB4Y9z6XKQU7vnQWvRGpoEjgg3piMLC"),
        mintB: new PublicKey("92onn8pS3LBLSP6hEMPFCRqESEFLojkFkPmHiKM3KvPN"),
      },
    ],
  },
  {
    name: "mighty knighty duck",
    url: "https://arweave.net/FSMivfIxfhqtQwDSLYx-JM08y953mDGTrozLU6CC0Do",
    image: "https://arweave.net/BoTz5W6otbilTcLzLmEqt5HYtAgB27YRDRtfWPrskJQ",
    pairs: [
      {
        edition: 14,
        mintA: new PublicKey("6aa1kP42MzdguucsJbEgcA6u32UfyHdcXqgB7ofgDzPT"),
        mintB: new PublicKey("6DA1aU7tfWw5wnuP6YuscXD3fvLYzagNW9PbpwiS28z6"),
      },
      {
        edition: 13,
        mintA: new PublicKey("3CUvSTgizJfacfzxy6Z1MUkNy2oSH57absXM9meUyLhT"),
        mintB: new PublicKey("47vHB9YqdYc8TEhb3rra6JNPxrtDLWsbgSQYZz35R4wJ"),
      },
      {
        edition: 12,
        mintA: new PublicKey("7EnejDExTUUh9YA3DMVgsjr5uM4UEaCVqYbfP7S2vpkQ"),
        mintB: new PublicKey("9fuzps9tqAGw1nE5mwznvHsC3k5mFsRM1EteS5JqqRwE"),
      },
      {
        edition: 11,
        mintA: new PublicKey("6Y61AW16iiMmCQt9MtXA2dKhat8fsBwJRSm9ZYFEcd9i"),
        mintB: new PublicKey("BjtmUTXLQ4yKx8oCJHPmXVAfDcFh5X6h1wufGzKU36pH"),
      },
      {
        edition: 10,
        mintA: new PublicKey("2A89DmpzVqKXuV1qwDiNbRDtQuJtp6DXbCNyPKhBcxLk"),
        mintB: new PublicKey("6JcX5b1PcuXiQgGz82GGrXUXiZ24fGfU8q8cbjfp7urm"),
      },
      {
        edition: 9,
        mintA: new PublicKey("5AfYwLWDe1jswXZb8VT5QDyLkBJaoEj9hv6ScTy3pfzz"),
        mintB: new PublicKey("Cc1oqFLV1A9Q2z2haiDwAfJSRvsuN92GGZuQWa4n7cGC"),
      },
      {
        edition: 8,
        mintA: new PublicKey("5ijGf7XVxxSeKHePsNJ8LMwdSD2EosBLQxi9yjcQCVbz"),
        mintB: new PublicKey("DNfi28rPLBVpWE9zkSTGdbNeYEqAvKzxKhkFHHCU7C75"),
      },
      {
        edition: 7,
        mintA: new PublicKey("FLwCoEiaeqZ5XRZB7KFjLEAY6HnMQuYx2egNceCc1RDJ"),
        mintB: new PublicKey("2MrnT1gjphTLxJNjZT7QXT44fZjjTNUTDrgU4E5cDaRa"),
      },
      {
        edition: 6,
        mintA: new PublicKey("5zE6F7pFpGyEziyGWrX3nJdSpsEqP5pyaxvNDDbfZhD5"),
        mintB: new PublicKey("J9JBiYKAB1ZHJB71yVfvvDzrnvw5mk62TxvfR5PNfzbp"),
      },
      {
        edition: 5,
        mintA: new PublicKey("GqGXTPLHN3M5mNUsBv156eAvsX4kjQcHhDV3nqUpwG3T"),
        mintB: new PublicKey("2bcokg3NZ3YMFra748zAY7E56GTcdv2RRAioweqFCkNV"),
      },
      {
        edition: 4,
        mintA: new PublicKey("6PEskoXZtGKZRgqEL9RunQC1P4tipeoB2QsCpYyS5dUM"),
        mintB: new PublicKey("3YbAdn8QTgijY5yCHxcjEwaBtPtgL5kFY6LhUCKEwrGg"),
      },
      {
        edition: 3,
        mintA: new PublicKey("S6C5s4AHaFxiGvj5L1JNptoG95fCFSCzLLpGGhRqdGh"),
        mintB: new PublicKey("32mQ9778oRXmDxLPVfgNqQunUL67G5AYrGp3sRtEV9Y6"),
      },
      {
        edition: 2,
        mintA: new PublicKey("EavxtZYmTCLed7ShCPLLVbg4YBFtcqN5WGwyUEJtshd4"),
        mintB: new PublicKey("ymTbjqvNUo9xFRGD89eKhUM6sHRxPihCTyP3G2vGtDA"),
      },
      {
        edition: 1,
        mintA: new PublicKey("3qjo19UiFaWZEdZCixH2ADebpHTABQp16JfXiRdpBGUu"),
        mintB: new PublicKey("6RFoyNMoxax22gPJr8rR7d3rQ8sU2bo4s8FCYd43Vroa"),
      },
    ]
  },
  {
    name: "professor ape cyborg",
    image: "https://arweave.net/w2I8pcZ4bRWpDOxxZOFS2CEzgm9GOf9nhVW0ZFNluJU",
    url: "https://arweave.net/AxsdBOOdn344qozM6iW0kr-9PhY6uohJdLv-FISw0ow",
    pairs: [
      {
        edition: 3,
        mintA: new PublicKey("4zoKQanNtzJsCmWnH36aSw91ZHLXrLa5Xfe8xXHwTZnR"),
        mintB: new PublicKey("52WYhZ6sKTdzk9dDqkFKBQp5WBUmpmDo3k49pkLt5gxZ"),
      },
      {
        edition: 2,
        mintA: new PublicKey("4SnpnbuwBbh29Ts13JhhpGjkvgmWi2Xriknm8mpMTdCy"),
        mintB: new PublicKey("7SzLVw9fs2ztEEJ5S7K9D4EPMmpr1URHgWzjAyyfciw5"),
      },
      {
        edition: 1,
        mintA: new PublicKey("GzAbFfG6T3k4AtK5jRtDJZ6Ju6iDo6sTbsAAjYh8VsVm"),
        mintB: new PublicKey("HGinUtX9ERUpkmfATbpTQPi2kBmazH7nUyXmMATkWHWg"),
      },
    ]
  },
];

export const MonospacedPublicKey = ({ address }: { address: PublicKey }) => {
  const connection = useConnection();
  return (
    <a
      href={`https://explorer.solana.com/address/${address.toBase58()}?cluster=${envFor(connection)}`}
      target="_blank"
      rel="noreferrer"
      title={address.toBase58()}
      // style={{ underline: 'none' }}
    >
      <span style={{ fontFamily: 'Monospace' }}>
        {shortenAddress(address.toBase58())}
      </span>
    </a>
  );
}

export const TOKEN_ENTANGLER = 'token_entangler';
export const getTokenEntanglement = async (
  mintA: PublicKey,
  mintB: PublicKey,
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(TOKEN_ENTANGLER), mintA.toBuffer(), mintB.toBuffer()],
    TOKEN_ENTANGLEMENT_PROGRAM_ID,
  );
};

export const ESCROW = 'escrow';
export const A = 'A';
export const B = 'B';
export const getTokenEntanglementEscrows = async (
  mintA: PublicKey,
  mintB: PublicKey,
): Promise<[PublicKey, number, PublicKey, number]> => {
  return [
    ...(await PublicKey.findProgramAddress(
      [
        Buffer.from(TOKEN_ENTANGLER),
        mintA.toBuffer(),
        mintB.toBuffer(),
        Buffer.from(ESCROW),
        Buffer.from(A),
      ],
      TOKEN_ENTANGLEMENT_PROGRAM_ID,
    )),
    ...(await PublicKey.findProgramAddress(
      [
        Buffer.from(TOKEN_ENTANGLER),
        mintA.toBuffer(),
        mintB.toBuffer(),
        Buffer.from(ESCROW),
        Buffer.from(B),
      ],
      TOKEN_ENTANGLEMENT_PROGRAM_ID,
    )),
  ];
};

export const SwapView = () => {
  const wallet = useWallet();
  const connection = useConnection();
  const [program, setProgram] = React.useState<anchor.Program | null>(null);

  const { setLoading } = useLoading();

  const [relevantMints, setRelevantMints] = React.useState<Array<PublicKey>>([]);

  React.useEffect(() => {
    const wrap = async () => {
      try {
        setProgram(await anchor.Program.at(
          TOKEN_ENTANGLEMENT_PROGRAM_ID,
          new anchor.Provider(connection, null as any, {})
        ));
      } catch (err) {
        console.error(err);
        notify({
          message: `Failed to fetch anchor IDL ${TOKEN_ENTANGLEMENT_PROGRAM_ID.toBase58()}`,
          description: `${err.message}`,
        });
        return null;
      }
    };
    wrap();
  }, []);

  const entangledMints: Array<PublicKey> = React.useMemo(() =>
    entanglements.map(e => e.pairs.map(p => [p.mintA, p.mintB]).flat()).flat(), []);

  React.useEffect(() => {
    const wrap = async () => {
      if (!wallet.publicKey) return;
      const owned = await connection.getTokenAccountsByOwner(
        wallet.publicKey,
        { programId: TOKEN_PROGRAM_ID },
      );

      const decoded = owned.value.map(v => AccountLayout.decode(v.account.data));
      const matching = decoded.filter(
          acc => entangledMints.findIndex(e => e.equals(new PublicKey(acc.mint))) !== -1)
        .map(acc => new PublicKey(acc.mint));
      setRelevantMints(matching);
    };
    wrap();
  }, [wallet?.publicKey]);

  React.useEffect(() => {
    const wrap = async () => {
      const entanglementKeys = (await Promise.all(entanglements.map(e => e.pairs).flat().map(
        p => getTokenEntanglement(p.mintA, p.mintB)))).map(v => v[0]);

      const entanglementInfos = await getMultipleAccounts(
        connection, entanglementKeys.map(k => k.toBase58()));

      for (const [index, info] of entanglementInfos.array.entries()) {
        if (info === null) {
          notify({
            message: 'Fetch error',
            description: `Could not find token entanglement ${entanglementKeys[index]}`,
          });
        } else {
          console.log(`Found entanglement ${entanglementKeys[index]}`);
        }
      }
    };
    wrap();
  }, []);

  const SwapButton = (props) => {
    return (
      <IconButton
        disabled={props.disabled|| !program || !wallet.publicKey}
        style={{
          color: 'white',
        }}
        onClick={() => {
          setLoading(true);
          const wrap = async () => {
            console.log(props);

            const walletKey = wallet.publicKey;
            if (!program || !walletKey) {
              return;
            }

            const [epKey] = await getTokenEntanglement(props.mintA, props.mintB);
            const epObj = await program.account.entangledPair.fetch(epKey) as any;
            if (!epObj.mintA.equals(props.mintA)
                || !epObj.mintB.equals(props.mintB)
                || !epObj.treasuryMint.equals(WRAPPED_SOL_MINT)) {
              throw new Error(`Entanglement ${shortenAddress(epKey.toBase58())} seems misconfigured!`);
            }

            const aATA = await getAssociatedTokenAccount(walletKey, epObj.mintA);
            const bATA = await getAssociatedTokenAccount(walletKey, epObj.mintB);
            const aATAInfo = await connection.getAccountInfo(aATA);
            const aTokens = new BN(aATAInfo ? AccountLayout.decode(aATAInfo.data).amount : 0);

            let token, replacementToken, tokenMint, replacementTokenMint;
            if (aTokens.eq(new BN(0))) {
              token = bATA;
              tokenMint = epObj.mintB;
              replacementToken = aATA;
              replacementTokenMint = epObj.mintA;
            } else {
              token = aATA;
              tokenMint = epObj.mintA;
              replacementToken = bATA;
              replacementTokenMint = epObj.mintB;
            }

            const [tokenAEscrow, _, tokenBEscrow] = await getTokenEntanglementEscrows(
                epObj.mintA, epObj.mintB);

            const replacementTokenMetadata = await getMetadata(replacementTokenMint);
            const metadataObj = await connection.getAccountInfo(replacementTokenMetadata);
            if (!metadataObj) {
              // really shouldn't be possible since entanglement wouldn't exist eighet
              throw new Error(`Could not fetch metadata for token ${tokenMint.toBase58()}`);
            }
            const metadataDecoded: Metadata = decodeMetadata(metadataObj.data);

            const remainingAccounts: Array<AccountMeta> = [];
            for (const creator of (metadataDecoded.data.creators || [])) {
              remainingAccounts.push({
                pubkey: new PublicKey(creator.address),
                isWritable: true,
                isSigner: false,
              });
            }

            const instruction = await program.instruction.swap({
              accounts: {
                treasuryMint: epObj.treasuryMint,
                payer: walletKey,
                paymentAccount: walletKey,
                paymentTransferAuthority: walletKey,
                transferAuthority: walletKey,
                token,
                tokenMint,
                replacementToken,
                replacementTokenMint,
                replacementTokenMetadata,
                tokenAEscrow,
                tokenBEscrow,
                entangledPair: epKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                ataProgram: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
              },
              remainingAccounts,
            });

            const recentBlockhash = (
              await connection.getRecentBlockhash('confirmed')
            ).blockhash;
            console.log('blockhash', recentBlockhash);
            const tx = new Transaction({
              feePayer: wallet.publicKey,
              recentBlockhash,
            });
            tx.add(instruction);
            tx.setSigners(walletKey);

            await wallet.signTransaction(tx);

            const { txid } = await sendSignedTransaction({
              signedTransaction: tx,
              connection,
            });
            notify({
              message: 'Swapped succesfully',
              description: (
                <a
                  href={explorerLinkFor(txid, connection)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'black' }}
                >
                  View transaction on explorer
                </a>
              ),
            });
          };

          wrap()
            .then(() => setLoading(false))
            .catch(reason => {
              console.error(reason);
              notify({
                message: 'Unknown error',
                description: reason.message ? `${reason.message}` : JSON.stringify(reason),
              })
              setLoading(false)
            });
        }}
      >
        <SwapHorizIcon />
      </IconButton>
    );
  };

  const EntangledList = (props) => {
    const findPair = p => relevantMints.findIndex(m => m.equals(p.mintA) || m.equals(p.mintB));
    const matching = props.pairs.filter(p => findPair(p) !== -1);
    const nonMatching = props.pairs.filter(p => findPair(p) === -1);
    const numPairs = props.pairs.length;

    const EntangledPair = (props) => {
      return (
        <div key={props.edition}>
        <div
          key={props.edition}
          style={{
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: props.disabled ? 'inherit': '16px',
          }}
        >
          <span style={{ color: '#bbb' }}>{props.edition}/{numPairs}</span>&nbsp;&nbsp;
          <MonospacedPublicKey address={props.mintA} />
          <SwapButton {...props} />
          <MonospacedPublicKey address={props.mintB} />
        </div>
        </div>
      );
    };

    return (
      <>
        <div style={{ paddingTop: 12 }}>
          {matching.map(p => <EntangledPair key={p.edition} {...p} disabled={false} />)}
        </div>
        <Collapse>
          <Collapse.Panel header="Other entanglements" key="1">
            {nonMatching.map(p => <EntangledPair key={p.edition} {...p} disabled={true} />)}
          </Collapse.Panel>
        </Collapse>
      </>
    );
  };

  // TODO: more robust
  const maxWidth = 960;
  const outerPadding = 96 * 2;
  const columnsGap = 40;
  const maxColumns = 3;
  const columnWidth = (maxWidth - columnsGap * (maxColumns - 1)) / maxColumns;

  const tilePadding = 0;
  const imageWidth = columnWidth - tilePadding * 2;

  const { width } = useWindowDimensions();
  const sizedColumns = (width : number) => {
           if (width > columnWidth * 3 + columnsGap * 2 + outerPadding) {
      return 3;
    } else if (width > columnWidth * 2 + columnsGap * 1 + outerPadding) {
      return 2;
    } else {
      return 1;
    }
  };
  const cols = sizedColumns(width);
  return (
    <Stack
      spacing={1}
      style={{
        ...(width >= maxWidth + outerPadding ? { width: maxWidth } : {}),
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <ImageList cols={cols} gap={columnsGap}>
        {entanglements.map(r => {
          return (
            <div
              key={r.name}
              style={{
                minWidth: columnWidth,
              }}
            >
              <ImageListItem>
                <CachedImageContent
                  uri={r.image}
                  preview={false}
                  className={"fullAspectRatio"}
                />
                <ImageListItemBar
                  title={r.name}
                  position="below"
                  subtitle={<EntangledList pairs={r.pairs} />}
                />
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>
    </Stack>
  );
}
