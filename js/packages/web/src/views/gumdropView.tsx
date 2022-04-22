import React from "react";
import { RouteComponentProps, Link } from "react-router-dom";
import queryString from 'query-string';

import {
  Button,
  Input,
  Select,
  Steps,
} from 'antd';
import {
  Box,
  CircularProgress,
  Link as HyperLink,
  Stack,
} from "@mui/material";

import {
  AccountMeta,
  Connection as RPCConnection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  AccountLayout,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  chunks,
  decodeMetadata,
  notify,
  shortenAddress,
  useLocalStorageState,
} from "@oyster/common";
import BN from 'bn.js';
import * as bs58 from "bs58";
import * as anchor from '@project-serum/anchor';

import {
  CachedImageContent,
} from '../components/ArtContent';
import {
  useAnchorContext,
} from '../contexts/anchorContext';
import {
  useDevModeContext,
} from '../contexts/devModeContext';
import {
  GUMDROP_PROGRAM_ID,
  GUMDROP_TEMPORAL_SIGNER,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
} from "../utils/ids";
import {
  getEdition,
  getEditionMarkerPda,
  getMetadata,
} from "../utils/accounts";
import { MerkleTree } from "../utils/merkleTree";
import {
  envFor,
  explorerLinkFor,
  sendSignedTransaction,
} from "../utils/transactions";

const walletKeyOrPda = async (
  walletKey : PublicKey,
  handle : string,
  pin : BN | null,
  seed : PublicKey,
) : Promise<[PublicKey, Array<Buffer>]> => {
  if (pin === null) {
    try {
      const key = new PublicKey(handle);
      if (!key.equals(walletKey)) {
        throw new Error("Claimant wallet handle does not match connected wallet");
      }
      return [key, []];
    } catch (err) {
      throw new Error(`Invalid claimant wallet handle ${err}`);
    }
  } else {
    const seeds : Array<Buffer> = [
      seed.toBuffer(),
      Buffer.from(handle),
      Buffer.from(pin.toArray("le", 4)),
    ];

    const splitHandle = chunks([...seeds[1]], 32).map(v => Buffer.from(v));

    const [claimantPda, ] = await PublicKey.findProgramAddress(
      [
        seeds[0],
        ...splitHandle,
        seeds[2],
      ],
      GUMDROP_PROGRAM_ID
    );
    return [claimantPda, seeds];
  }
}

type ClaimInstructions = {
  setup: Array<TransactionInstruction> | null,
  claim: Array<TransactionInstruction>,
};

const createMintAndAccount = async (
  connection : RPCConnection,
  walletKey : PublicKey,
  mint : PublicKey,
  setup : Array<TransactionInstruction>,
) => {
  const [walletTokenKey, ] = await PublicKey.findProgramAddress(
    [
      walletKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
  );

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

const buildEditionClaim = async (
  program : anchor.Program,
  walletKey : PublicKey,
  distributorKey : PublicKey,
  distributorInfo : any,
  masterMint : string,
  edition : number,
  proof : Array<Buffer>,
  handle : string,
  amount : number,
  index : number,
  pin : BN | null,
) : Promise<[ClaimInstructions, Array<Buffer>, Keypair]> => {

  let masterMintKey : PublicKey;
  try {
    masterMintKey = new PublicKey(masterMint);
  } catch (err) {
    throw new Error(`Invalid master mint key ${err}`);
  }

  const [secret, pdaSeeds] = await walletKeyOrPda(walletKey, handle, pin, masterMintKey);

  // should we assert that the amount is 1?
  const leaf = Buffer.from(
    [...new BN(index).toArray("le", 8),
     ...secret.toBuffer(),
     ...masterMintKey.toBuffer(),
     ...new BN(amount).toArray("le", 8),
     ...new BN(edition).toArray("le", 8),
    ]
  );

  const matches = MerkleTree.verifyClaim(
    leaf, proof, Buffer.from(distributorInfo.root)
  );

  if (!matches) {
    throw new Error("Gumdrop merkle proof does not match");
  }

  const [claimCount, cbump] = await PublicKey.findProgramAddress(
    [
      Buffer.from("ClaimCount"),
      Buffer.from(new BN(index).toArray("le", 8)),
      distributorKey.toBuffer(),
    ],
    GUMDROP_PROGRAM_ID
  );

  // atm the contract has a special case for when the temporal key is defaulted
  // (aka always passes temporal check)
  // TODO: more flexible
  const temporalSigner = distributorInfo.temporal.equals(PublicKey.default) || secret.equals(walletKey)
      ? walletKey : distributorInfo.temporal;

  const claimCountAccount = await program.provider.connection.getAccountInfo(claimCount);
  if (claimCountAccount !== null) {
    throw new Error(`This edition was already claimed`);
  }

  const setup : Array<TransactionInstruction> = [];

  const newMint = Keypair.generate();
  const newMetadataKey = await getMetadata(newMint.publicKey);
  const masterMetadataKey = await getMetadata(masterMintKey);
  const newEdition = await getEdition(newMint.publicKey);
  const masterEdition = await getEdition(masterMintKey);

  await createMintAndAccount(program.provider.connection, walletKey, newMint.publicKey, setup);

  const [distributorTokenKey, ] = await PublicKey.findProgramAddress(
    [
      distributorKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      masterMintKey.toBuffer(),
    ],
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
  );

  const editionMarkKey = await getEditionMarkerPda(masterMintKey, new BN(edition));

  const claim = await program.instruction.claimEdition(
    cbump,
    new BN(index),
    new BN(amount),
    new BN(edition),
    secret,
    proof,
    {
      accounts: {
        distributor: distributorKey,
        claimCount,
        temporal: temporalSigner,
        payer: walletKey,
        metadataNewMetadata: newMetadataKey,
        metadataNewEdition: newEdition,
        metadataMasterEdition: masterEdition,
        metadataNewMint: newMint.publicKey,
        metadataEditionMarkPda: editionMarkKey,
        metadataNewMintAuthority: walletKey,
        metadataMasterTokenAccount: distributorTokenKey,
        metadataNewUpdateAuthority: walletKey,
        metadataMasterMetadata: masterMetadataKey,
        metadataMasterMint: masterMintKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      }
    }
  );

  return [{ setup, claim: [claim] }, pdaSeeds, newMint];
}

const fetchDistributor = async (
  program : anchor.Program,
  distributorStr : string,
) => {
  let key;
  try {
    key = new PublicKey(distributorStr);
  } catch (err) {
    throw new Error(`Invalid distributor key ${err}`);
  }
  const info = await program.account.merkleDistributor.fetch(key);
  return [key, info];
};

const fetchNeedsTemporalSigner = async (
  program : anchor.Program,
  distributorStr : string,
  indexStr : string,
) => {
  const [key, info] = await fetchDistributor(program, distributorStr);
  if (!info.temporal.equals(GUMDROP_TEMPORAL_SIGNER)) {
    // default pubkey or program itself (distribution through wallets)
    return false;
  } else {
    // default to need one
    return true;
  }
};

export type ClaimProps = {};

type ClaimTransactions = {
  setup : Transaction | null,
  claim : Transaction,
};


// lol
const users = require('./recipe-gumdrop-users.json');
export const GumdropView = (
) => {
  const { devModeEnabled } = useDevModeContext();
  const { connection, endpoint, anchorWallet: wallet } = useAnchorContext();

  const [program, setProgram] = React.useState<anchor.Program | null>(null);

  React.useEffect(() => {
    if (!wallet) {
      return;
    }

    const wrap = async () => {
      try {
        const provider = new anchor.Provider(connection, wallet, {
          preflightCommitment: 'recent',
        });
        const idl = await anchor.Program.fetchIdl(GUMDROP_PROGRAM_ID, provider);

        const program = new anchor.Program(idl, GUMDROP_PROGRAM_ID, provider);
        setProgram(program);
      } catch (err) {
        console.error('Failed to fetch IDL', err);
      }
    };
    wrap();
  }, [wallet]);

  console.log('gateway', process.env.NEXT_PUBLIC_AWS_GATEWAY_API_ID);

  const [query, setClaimQuery] = React.useState("");
  console.log('query', query);

  const params = queryString.parse(query);
  const [distributor, setDistributor] = React.useState("");
  const [claimType, setClaimType] = React.useState("edition");
  const [tokenAcc, setTokenAcc] = React.useState("");
  const [candyConfig, setCandyConfig] = React.useState("");
  const [candyUUID, setCandyUUID] = React.useState("");
  const [masterMint, setMasterMint] = React.useState("");
  const [editionStr, setEditionStr] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [amountStr, setAmount] = React.useState("");
  const [indexStr, setIndex] = React.useState("");
  const [pinStr, setPin] = React.useState("");
  const [proofStr, setProof] = React.useState("");
  const [commMethod, setCommMethod] = React.useState("aws-email");

  React.useEffect(() => {
    setDistributor(params.distributor as string || "");
    setClaimType(
          params.tokenAcc ? "transfer"
        : params.config   ? "candy"
        : params.master   ? "edition"
        :                   "");
    setTokenAcc(params.tokenAcc as string || "");
    setCandyConfig(params.config as string || "");
    setCandyUUID(params.uuid as string || "");
    setMasterMint(params.master as string || "");
    setEditionStr(params.edition as string || "");
    setHandle(params.handle as string || "");
    setAmount(params.amount as string || "");
    setIndex(params.index as string || "");
    setPin(params.pin as string || "");
    setProof(params.proof as string || "");
    setCommMethod(params.method as string || "aws-email");
  }, [query]);

  const [editable, setEditable] = React.useState(false);

  // temporal verification
  const [transaction, setTransaction] = React.useState<ClaimTransactions | null>(null);
  const [OTPStr, setOTPStr] = React.useState("");

  // async computed
  const [asyncNeedsTemporalSigner, setNeedsTemporalSigner] = React.useState<boolean>(true);

  // stashed
  const [newMintStr, setNewMintStr] = useLocalStorageState(
      "gumdropNewMintStr", ""); // TODO: better default?
  const [masterMintManifest, setMasterMintManifest]
      = React.useState<any | null>(null);

  React.useEffect(() => {
    const wrap = async () => {
      try {
        if (!program) return;
        setNeedsTemporalSigner(await fetchNeedsTemporalSigner(
          program, distributor, indexStr));
      } catch {
        // TODO: log?
      }
    };
    wrap();
  }, [program, distributor, indexStr, claimType]);

  React.useEffect(() => {
    const wrap = async () => {
      if (!connection) return;
      try {
        const masterMintKey = new PublicKey(masterMint);
        const masterMetadataAccount = await connection.getAccountInfo(
          await getMetadata(masterMintKey));
        if (masterMetadataAccount === null)
          return;

        const masterMetadata = decodeMetadata(masterMetadataAccount.data);
        const masterManifest = await (await fetch(masterMetadata.data.uri)).json();
        setMasterMintManifest(masterManifest);
      } catch (err) {
        console.log(err);
        // TODO: log?
      }
    };
    wrap();
  }, [masterMint, connection]);

  const lambdaAPIEndpoint = `https://${process.env.NEXT_PUBLIC_AWS_GATEWAY_API_ID}.execute-api.us-east-2.amazonaws.com/send-OTP`;

  const skipAWSWorkflow = false;

  const sendOTP = async (e : React.SyntheticEvent) => {
    e.preventDefault();

    if (!wallet || !program) {
      throw new Error(`Wallet not connected`);
    }

    const index = Number(indexStr);
    const amount = Number(amountStr);
    let pin : BN | null = null;

    if (isNaN(amount)) {
      throw new Error(`Could not parse amount ${amountStr}`);
    }
    if (isNaN(index)) {
      throw new Error(`Could not parse index ${indexStr}`);
    }
    if (params.pin !== "NA") {
      try {
        pin = new BN(pinStr);
      } catch (err) {
        throw new Error(`Could not parse pin ${pinStr}: ${err}`);
      }
    }

    // TODO: use cached?
    const [distributorKey, distributorInfo] =
        await fetchDistributor(program, distributor);

    console.log("Distributor", distributorInfo);

    const proof = proofStr === "" ? [] : proofStr.split(",").map(b => {
      const ret = Buffer.from(bs58.decode(b))
      if (ret.length !== 32)
        throw new Error(`Invalid proof hash length`);
      return ret;
    });

    let instructions, pdaSeeds, extraSigners;
    if (claimType === "edition") {
      const edition = Number(editionStr);
      if (isNaN(edition)) {
        throw new Error(`Could not parse edition ${editionStr}`);
      }
      let newMint;
      [instructions, pdaSeeds, newMint] = await buildEditionClaim(
        program, wallet.publicKey, distributorKey, distributorInfo,
        masterMint, edition,
        proof, handle, amount, index, pin
      );
      setNewMintStr(newMint.publicKey.toBase58());
      extraSigners = [newMint];
    } else {
      throw new Error(`Unsupported claim type ${claimType}`);
    }

    // NB: if we're claiming through wallets then pdaSeeds should be empty
    // since the secret is the wallet key (which is also a signer)
    if (pin === null && pdaSeeds.length > 0) {
      throw new Error(`Internal error: PDA generated when distributing to wallet directly`);
    }

    const signersOf = (instrs : Array<TransactionInstruction>) => {
      const signers = new Set<PublicKey>();
      for (const instr of instrs) {
        for (const key of instr.keys)
          if (key.isSigner)
            signers.add(key.pubkey);
      }
      return [...signers];
    };

    const partialSignExtra = (tx : Transaction, expected: Array<PublicKey>) => {
      const matching = extraSigners.filter(kp => expected.find(p => p.equals(kp.publicKey)));
      if (matching.length > 0) {
        tx.partialSign(...matching);
      }
    };

    const recentBlockhash = (await connection.getRecentBlockhash("singleGossip")).blockhash;
    let setupTx : Transaction | null = null;
    if (instructions.setup !== null && instructions.setup.length !== 0) {
      setupTx = new Transaction({
        feePayer: wallet.publicKey,
        recentBlockhash,
      });

      const setupInstrs = instructions.setup;
      const setupSigners = signersOf(setupInstrs);
      console.log(`Expecting the following setup signers: ${setupSigners.map(s => s.toBase58())}`);
      setupTx.add(...setupInstrs);
      setupTx.setSigners(...setupSigners);
      partialSignExtra(setupTx, setupSigners);
    }

    const claimTx = new Transaction({
      feePayer: wallet.publicKey,
      recentBlockhash,
    });

    const claimInstrs = instructions.claim;
    const claimSigners = signersOf(claimInstrs);
    console.log(`Expecting the following claim signers: ${claimSigners.map(s => s.toBase58())}`);
    claimTx.add(...claimInstrs);
    claimTx.setSigners(...claimSigners);
    partialSignExtra(claimTx, claimSigners);

    const txnNeedsTemporalSigner =
        claimTx.signatures.some(s => s.publicKey.equals(GUMDROP_TEMPORAL_SIGNER)) ? claimTx
      : setupTx && setupTx.signatures.some(s => s.publicKey.equals(GUMDROP_TEMPORAL_SIGNER)) ? setupTx
      : /*otherwise*/ null;
    if (txnNeedsTemporalSigner !== null && !skipAWSWorkflow) {
      const otpQuery : { [key: string] : any } = {
        method: "send",
        transaction: bs58.encode(txnNeedsTemporalSigner.serializeMessage()),
        seeds: pdaSeeds,
        comm: commMethod,
      };
      const params = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(otpQuery),
      };

      const response = await fetch(lambdaAPIEndpoint, params);
      console.log(response);

      if (response.status !== 200) {
        throw new Error(`Failed to send AWS OTP`);
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Could not parse AWS OTP response`);
      }

      console.log("AWS OTP response data:", data);

      let succeeded, toCheck;
      switch (commMethod) {
        case "discord": {
          succeeded = !!data.id;
          toCheck = "discord";
          break;
        }
        case 'aws-email': {
          succeeded = !!data.MessageId;
          toCheck = "email";
          break;
        }
        case 'aws-sms': {
          succeeded = !!data.MessageId;
          toCheck = "SMS";
          break;
        }
      }

      if (!succeeded) {
        throw new Error(`Failed to send AWS OTP`);
      }

      notify({
        message: "OTP sent",
        description: `Please check your ${toCheck} (${handle}) for an OTP`,
      });
    }

    return {
      setup: setupTx,
      claim: claimTx,
    };
  };

  const verifyOTP = async (
    e : React.SyntheticEvent,
    transaction : ClaimTransactions | null,
  ) => {
    e.preventDefault();

    if (!transaction) {
      throw new Error(`Transaction not available for OTP verification`);
    }

    if (!wallet|| !program) {
      throw new Error(`Wallet not connected`);
    }

    const claimTx = transaction.claim;
    const setupTx = transaction.setup;
    const txnNeedsTemporalSigner =
        claimTx.signatures.some(s => s.publicKey.equals(GUMDROP_TEMPORAL_SIGNER)) ? claimTx
      : setupTx && setupTx.signatures.some(s => s.publicKey.equals(GUMDROP_TEMPORAL_SIGNER)) ? setupTx
      : /*otherwise*/ null;
    if (txnNeedsTemporalSigner && !skipAWSWorkflow) {
      // TODO: distinguish between OTP failure and transaction-error. We can try
      // again on the former but not the latter
      const OTP = Number(OTPStr);
      if (isNaN(OTP) || OTPStr.length === 0) {
        throw new Error(`Could not parse OTP ${OTPStr}`);
      }

      const params = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        FunctionName: "send-OTP",
        body: JSON.stringify({
          method: "verify",
          otp: OTP,
          handle: handle,  // TODO?
        }),
      };

      const response = await fetch(lambdaAPIEndpoint, params);
      console.log(response);

      if (response.status !== 200) {
        const blob = JSON.stringify(response);
        throw new Error(`Failed to verify AWS OTP. ${blob}`);
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Could not parse AWS OTP verification response`);
      }

      console.log("AWS verify response data:", data);

      let sig;
      try {
        sig = bs58.decode(data);
      } catch {
        throw new Error(`Could not decode transaction signature ${data.body}`);
      }

      txnNeedsTemporalSigner.addSignature(GUMDROP_TEMPORAL_SIGNER, sig);
    }

    let fullySigned;
    try {
      fullySigned = await wallet.signAllTransactions(
        transaction.setup === null
        ? [transaction.claim]
        : [transaction.setup, transaction.claim]
      );
    } catch {
      throw new Error("Failed to sign transaction");
    }

    for (let idx = 0; idx < fullySigned.length; ++idx) {
      const tx = fullySigned[idx];
      const result = await sendSignedTransaction({
        connection,
        signedTransaction: tx,
      });
      console.log(result);
      notify({
        message: `Claim succeeded: ${idx + 1} of ${fullySigned.length}`,
        description: (
          <HyperLink href={explorerLinkFor(result.txid, connection)}>
            View transaction on explorer
          </HyperLink>
        ),
      });
    }

    setTransaction(null);
    try {
      setNeedsTemporalSigner(await fetchNeedsTemporalSigner(
        program, distributor, indexStr));
    } catch {
      // TODO: log?
    }
  };

  const [loading, setLoading] = React.useState(false);
  const loadingProgress = () => (
    <CircularProgress
      size={24}
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: '-12px',
        marginLeft: '-12px',
      }}
    />
  );

  const verifyOTPC = (onClick) => (
    <React.Fragment>
      <label className="action-field">
        <span className="field-title">OTP</span>
        <Input
          id="otp-text-field"
          value={OTPStr}
          onChange={(e) => setOTPStr(e.target.value)}
        />
      </label>
      <Box />

      <Box sx={{ position: "relative" }}>
      <Button
        color="success"
        style={{ width: "100%", borderRadius: "8px" }}
        onClick={(e) => {
          setLoading(true);
          const wrap = async () => {
            try {
              if (!wallet || !program || loading) {
                throw new Error('Wallet not connected');
              }
              if (!OTPStr) {
                throw new Error('No OTP provided');
              }
              await verifyOTP(e, transaction);
              setLoading(false);
              onClick();
            } catch (err) {
              notify({
                message: "Claim failed",
                description: `${err}`,
              });
              // setNewMintStr("");
              setLoading(false);
            }
          };
          wrap();
        }}
      >
        Claim Gumdrop
      </Button>
      {loading && loadingProgress()}
      </Box>
    </React.Fragment>
  );

  const Option = Select.Option;
  const populateClaimC = () => (
    <React.Fragment>
      <p className={"text-title"}>
        Gumdrop Information
      </p>
      <p className={"text-subtitle"}>
        The fields below are derived from your gumdrop URL and specify
        the limited edition print you'll be receiving. If you navigated
        here through a gumdrop link, there should be no need to change
        anything! If you know what you're doing, click 'Edit Claim' at the
        bottom to manually change these fields.
      </p>
      <label className="action-field">
        <span className="field-title">Gumdrop</span>
        <Input
          id="gumdrop-text-field"
          value={distributor}
          onChange={(e) => setDistributor(e.target.value)}
          disabled={!editable}
          style={{ fontFamily: 'Monospace' }}
        />
      </label>
      <label className="action-field">
        <span className="field-title">Claim Type</span>
        <Select
          id="claim-type-field"
          value={claimType}
          onChange={v => setClaimType(v)}
          disabled={!editable}
        >
          <Option value={"transfer"}>Token Transfer</Option>
          <Option value={"candy"}>Candy Machine</Option>
          <Option value={"edition"}>Limited Edition</Option>
        </Select>
      </label>
      <label className="action-field">
        <span className="field-title">Distribution Method</span>
        <Select
          id="comm-method-field"
          value={commMethod}
          onChange={v => setCommMethod(v)}
          disabled={!editable}
        >
          <Option value={"aws-email"}>AWS Email</Option>
          <Option value={"aws-sms"}>AWS SMS</Option>
          <Option value={"discord"}>Discord</Option>
          <Option value={"wallets"}>Wallets</Option>
          <Option value={"manual"}>Manual</Option>
        </Select>
      </label>
      <label className="action-field">
        <span className="field-title">Master Mint</span>
        <Input
          id="master-mint-text-field"
          value={masterMint}
          onChange={(e) => setMasterMint(e.target.value)}
          disabled={!editable}
          style={{ fontFamily: 'Monospace' }}
        />
      </label>
      <label className="action-field">
        <span className="field-title">Edition</span>
        <Input
          id="edition-text-field"
          value={editionStr}
          onChange={(e) => setEditionStr(e.target.value)}
          disabled={!editable}
        />
      </label>
      <label className="action-field">
        <span className="field-title">Handle</span>
        <Input
          id="handle-text-field"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          disabled={!editable}
        />
      </label>
      <label className="action-field">
        <span className="field-title">Index</span>
        <Input
          id="index-text-field"
          value={indexStr}
          onChange={(e) => setIndex(e.target.value)}
          disabled={!editable}
        />
      </label>
      <label className="action-field">
        <span className="field-title">Pin</span>
        <Input
          id="pin-text-field"
          value={pinStr}
          onChange={(e) => setPin(e.target.value)}
          disabled={!editable}
        />
      </label>
      <label className="action-field">
        <span className="field-title">Proof</span>
        <Input.TextArea
          id="proof-text-field"
          value={proofStr}
          onChange={(e) => setProof(e.target.value)}
          disabled={!editable}
          style={{ fontFamily: 'Monospace' }}
          rows={proofStr.length / 80}
        />
      </label>
      <Button
        style={{ width: "100%", borderRadius: "8px" }}
        onClick={() => setEditable(!editable)}
      >
        {!editable ? "Edit Claim" : "Stop Editing"}
      </Button>
    </React.Fragment>
  );

  const nextStepButtonC = (onClick) => {
    return (
      <Box sx={{ position: "relative" }}>
      <Button
        style={{ width: "100%", borderRadius: "8px" }}
        onClick={(e) => {
          setLoading(true);
          const wrap = async () => {
            try {
              if (!wallet || !program || loading) {
                throw new Error('Wallet not connected');
              }
              const needsTemporalSigner = await fetchNeedsTemporalSigner(
                  program, distributor, indexStr);
              const transaction = await sendOTP(e);
              if (!needsTemporalSigner) {
                await verifyOTP(e, transaction);
              } else {
                setTransaction(transaction);
              }
              setLoading(false);
              onClick();
            } catch (err) {
              notify({
                message: "Claim failed",
                description: `${err}`,
              });
              setLoading(false);
            }
          };
          wrap();
        }}
      >
        {asyncNeedsTemporalSigner ? "Next" : "Claim Gumdrop"}
      </Button>
      {loading && loadingProgress()}
      </Box>
    );
  };

  const CongratsC = (onClick) => {
    return (
      <>
        <div className="waiting-title">Congratulations, you claimed a Gumdrop!</div>
        <Stack spacing={1} className="congrats-button-container">
          <Button
            className="metaplex-button"
          >
            <Link to="/">Explore Recipes</Link>
          </Button>
          {newMintStr.length > 0 && <Button
            className="metaplex-button"
          >
            <HyperLink
              href={`https://explorer.solana.com/address/${newMintStr}?cluster=${envFor(connection)}`}
              target="_blank"
              rel="noreferrer"
            >
              View your Gumdrop
            </HyperLink>
          </Button>}
          <Button
            className="metaplex-button"
            onClick={onClick}
          >
            <span>Claim Another</span>
          </Button>
        </Stack>
      </>
    );
  };

  const explorerLinkForAddress = (keyStr : string, shorten: boolean = true) => {
    return (
      <HyperLink
        href={`https://explorer.solana.com/address/${keyStr}?cluster=${envFor(connection)}`}
        target="_blank"
        rel="noreferrer"
        title={keyStr}
        underline="none"
        sx={{ fontFamily: 'Monospace' }}
      >
        {shorten ? shortenAddress(keyStr) : keyStr}
      </HyperLink>
    );
  };

  const masterMintC = () => {
    if (!masterMintManifest) return;
    return (
      <React.Fragment>
        <CachedImageContent
          uri={masterMintManifest.image}
          style={{
            maxWidth: '40ch',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
        <div
          style={{
            marginTop: 0,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
        {explorerLinkForAddress(masterMint)}
        </div>
      </React.Fragment>
    );
  };

  const steps = [
    {
      name: "Populate Claim", 
      inner: (onClick) => (
        <React.Fragment>
          <p className={"text-title"}>
            Recipe Gumdrop
          </p>
          <p className={"text-subtitle"}>
            Find your discord username to access your {masterMintManifest?.name} gumdrop!
          </p>
          <Select
            showSearch
            placeholder="Search to Select"
            optionFilterProp="children"
            filterOption={(input, option) => {
              if (!option || !option.children) return false;
              return option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }}
            filterSort={(optionA, optionB) => {
              if (!optionA || !optionA.children) return 1; // B first
              if (!optionB || !optionB.children) return -1; // A first
              return optionA.children.toLowerCase().localeCompare(optionB.children.toLowerCase());
            }}
            onChange={u => {
              if (!u) return;
              const user = JSON.parse(u as string);
              if (!user.url) return;
              console.log(user);
              setClaimQuery('?' + user.url.split('?')[1]);
            }}
          >
            {users.filter(u => !!u.username).map(u => (
              <Option value={JSON.stringify(u)}>{u.username || ""}</Option>
            ))}
          </Select>
          {masterMintC()}
          {masterMintManifest && (
            <p className={"text-subtitle"}>
              After doing OTP verification, you'll be able to print a limited
              edition of the {masterMintManifest?.name}.
            </p>
          )}
          {nextStepButtonC(onClick)}
          {devModeEnabled && populateClaimC()}
        </React.Fragment>
      ),
    },
  ];
  if (asyncNeedsTemporalSigner) {
    steps.push(
      {
        name: "Verify OTP",
        inner: (onClick) => (
          <React.Fragment>
            {verifyOTPC(onClick)}
            {masterMintC()}
          </React.Fragment>
        ),
      }
    );
  }

  steps.push(
    { name: "Enjoy your Gumdrop", inner: CongratsC }
  );

  // TODO: better interaction between setting `asyncNeedsTemporalSigner` and
  // the stepper... this is pretty jank
  const [activeStep, setActiveStep] = React.useState(0);
  const stepToUse = Math.min(activeStep, steps.length - 1);

  const handleNext = () => {
    // return to start if going past the end (claim succeeded)
    setActiveStep(prev => {
      if (prev === steps.length - 1) {
        return 0;
      } else {
        return prev + 1;
      }
    });
  };
  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const { Step } = Steps;
  const stepper = (
    <React.Fragment>
      <Steps current={stepToUse} progressDot>
        {steps.map(s => {
          return (
            <Step key={s.name} title={s.name} />
          );
        })}
      </Steps>
      <Box />
    </React.Fragment>
  );

  return (
    <Stack
      spacing={2}
      className={"gumdrop"}
      style={{
        maxWidth: "80ch",
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      {steps[stepToUse].inner(handleNext)}
    </Stack>
  );
};

