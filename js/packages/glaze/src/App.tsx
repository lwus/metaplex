import React from "react";
import {
  BrowserRouter,
  // Link,
  Route,
  Switch,
} from "react-router-dom";

import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import {
  Box,
  Button,
  CircularProgress,
  ImageList,
  ImageListItem,
  Link as HyperLink,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
} from "@mui/material";

import * as anchor from '@project-serum/anchor';
import {
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import {
  AccountLayout,
} from '@solana/spl-token';
import {
  useWallet,
} from '@solana/wallet-adapter-react';
import {
  decodeMetadata,
  getMetadata,
  shortenAddress,
  notify,
  useLocalStorageState,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@oyster/common';
import BN from 'bn.js';

import "./App.css";
import {
  useColorMode,
  useConnection,
  Connection,
} from "./contexts";
import { Header } from "./components/Header/Header";
import {
  GLAZE_MINT,
  GLAZE_PREFIX,
  GLAZE_PROGRAM_ID,
} from './utils/ids';
import {
  envFor,
  explorerLinkFor,
} from './utils/transactions';

export const getGlazeMeta = async (
  base: PublicKey,
  index: Buffer = Buffer.from([]),
) => {
  return await PublicKey.findProgramAddress(
    [
      GLAZE_PREFIX,
      base.toBuffer(),
      index,
    ],
    GLAZE_PROGRAM_ID
  );
}

export const getGlazeMint = async (
  base: PublicKey,
  index: Buffer = Buffer.from([]),
) => {
  return await PublicKey.findProgramAddress(
    [
      GLAZE_PREFIX,
      base.toBuffer(),
      GLAZE_MINT,
      index,
    ],
    GLAZE_PROGRAM_ID
  );
}

type MintAndImage = {
  mint: PublicKey,
  name: string,
  image: string,
};

type LayerMeta = MintAndImage & {
  layerKey: PublicKey,
  index: number,
  current: number,
};

export const HoverButton = (
  props : {
    handleClick : (e : React.SyntheticEvent) => void,
    hoverDisplay : React.ReactNode,
    children : React.ReactNode,
    padding : number,
    disabled : boolean,
  },
) => {
  const [hovering, setHovering] = React.useState(false);

  const colorModeCtx = useColorMode();
  const shade = colorModeCtx.mode === 'dark' ? "rgba(255,255,255,.2)" : "rgba(0, 0, 0,.2)";

  return (
    <Button
      onMouseOver={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={props.handleClick}
      disabled={props.disabled}
      variant="contained"
      style={{
        padding: props.padding,
        textTransform: "none",
        color: "white",
        backgroundColor: shade,
      }}
    >
      <Box sx={{ position: "relative" }}>
        {props.children}
        {hovering && (
          <React.Fragment>
            <Box
              sx={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                backgroundColor: "rgba(0, 0, 0, .75)",
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                margin: 'auto',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              {props.hoverDisplay}
            </Box>
          </React.Fragment>
        )}
      </Box>
    </Button>
  );
};

const fetchLatestLayer = async (
  program : anchor.Program,
  baseKey : PublicKey,
  layerIndex : number,
) => {
  const layerIndexBuffer = Buffer.from(new BN(layerIndex).toArray("le", 8));
  const [layerKey, ] = await getGlazeMeta(baseKey, layerIndexBuffer);
  const [layerMintKey, ] = await getGlazeMint(baseKey, layerIndexBuffer);

  const layer = await program.account.layer.fetch(layerKey);

  console.log(layer);

  const layerMetadataKey = new PublicKey(await getMetadata(layerMintKey.toBase58()));
  const layerMetadataAccount = await program.provider.connection.getAccountInfo(layerMetadataKey);
  if (layerMetadataAccount === null) {
    throw new Error(`Could not find metadata for layer ${layerIndex}`);
  }

  const layerMetadataDecoded = decodeMetadata(layerMetadataAccount.data);

  const schema = await (await fetch(layerMetadataDecoded.data.uri)).json();

  return {
    mint: layerMintKey,
    name: layerMetadataDecoded.data.name,
    image: schema.image,
    layerKey,
    index: layerIndex,
    current: new BN((layer as any).current).toNumber(),
  };
}

const fetchLatestImage = async (
  program : anchor.Program,
  r : LayerMeta,
) => {
  const imageIndexBuffer = Buffer.from(new BN(r.current).toArray('le', 8));
  const [imageMintKey, ] = await getGlazeMint(r.layerKey, imageIndexBuffer);
  const imageMetadataKey = new PublicKey(await getMetadata(imageMintKey.toBase58()));
  const imageMetadataAccount = await program.provider.connection.getAccountInfo(imageMetadataKey);
  if (imageMetadataAccount === null) {
    throw new Error(`Could not find metadata for image ${r.current}`);
  }

  const imageMetadataDecoded = decodeMetadata(imageMetadataAccount.data);

  const schema = await (await fetch(imageMetadataDecoded.data.uri)).json();

  return {
    mint: imageMintKey,
    name: imageMetadataDecoded.data.name,
    image: schema.image,
  };
}

const About = () => {
  const connection = useConnection();
  const wallet = useWallet();

  const anchorWallet = React.useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const [program, setProgram] = React.useState<anchor.Program | null>(null);

  React.useEffect(() => {
    if (!anchorWallet) {
      return;
    }

    const wrap = async () => {
      try {
        const provider = new anchor.Provider(connection, anchorWallet, {
          preflightCommitment: 'recent',
        });
        const idl = await anchor.Program.fetchIdl(GLAZE_PROGRAM_ID, provider);

        const program = new anchor.Program(idl, GLAZE_PROGRAM_ID, provider);
        setProgram(program);
      } catch (err) {
        console.error('Failed to fetch IDL', err);
      }
    };
    wrap();
  }, [anchorWallet]);

  const [base, setBase] = useLocalStorageState(
    "base",
    "",
  );
  const [relevantMints, setRelevantMints] = React.useState<Array<LayerMeta>>([]);
  const [layer, setLayer] = React.useState<LayerMeta | null>(null);
  const [activeImage, setActiveImage] = React.useState<MintAndImage | null>(null);
  const [newLayerValue, setNewLayerValue] = React.useState<string>("");

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


  const search = async (baseKey: PublicKey) => {
    if (!anchorWallet || !program) {
      throw new Error(`Wallet or program is not connected`);
    }

    const [masterKey, ] = await PublicKey.findProgramAddress(
      [
        GLAZE_PREFIX,
        baseKey.toBuffer(),
      ],
      GLAZE_PROGRAM_ID
    );
    let master;
    try {
      master = await program.account.master.fetch(masterKey);
    } catch (err) {
      throw new Error(`Failed to find master ${masterKey.toBase58()}`);
    }

    const schema = await (await fetch(master.schema)).json();

    console.log(schema);

    const mints = {}
    for (let layerIndex = 0; layerIndex < schema.layers.length; ++layerIndex) {
      const meta = await fetchLatestLayer(program, baseKey, layerIndex);
      mints[meta.mint.toBase58()] = meta;
    }

    console.log(mints);

    const owned = await connection.getTokenAccountsByOwner(
        anchorWallet.publicKey,
        { programId: TOKEN_PROGRAM_ID },
      );

    const decoded = owned.value.map(v => AccountLayout.decode(v.account.data));
    const relevant = decoded
      .map(a => {
        const hasToken = new BN(a.amount, 'le').toNumber() > 0;
        if (!hasToken) return null;
        const ret = mints[new PublicKey(a.mint).toBase58()];
        if (!ret) return null;
        return ret;
      })
      .filter((a) : a is LayerMeta => a !== null);

    setRelevantMints(relevant);
  };

  const update = async (layer: LayerMeta, valueStr: string) => {
    if (!anchorWallet || !program) {
      throw new Error(`Wallet or program is not connected`);
    }

    const value = Number(valueStr);
    if (isNaN(value)) {
      throw new Error(`Could not parse value ${valueStr}`);
    }

    const baseKey = new PublicKey(base);

    const layerIndexBuffer = Buffer.from(new BN(layer.index).toArray("le", 8));
    const [layerKey, layerBump] = await getGlazeMeta(baseKey, layerIndexBuffer);

    {
      // check that the new image exists...
      const imageIndexBuffer = Buffer.from(new BN(value).toArray("le", 8));
      const [imageMintKey, ] = await getGlazeMint(layerKey, imageIndexBuffer);

      const imageMetadataKey = new PublicKey(await getMetadata(imageMintKey.toBase58()));
      const imageMetadataAccount = await connection.getAccountInfo(imageMetadataKey);

      if (imageMetadataAccount === null) {
        throw new Error(`Layer ${layer.index} does not have an image at index ${value}`);
      }
    }

    const [mintKey, mintBump] = await getGlazeMint(baseKey, layerIndexBuffer);

    const [walletTokenKey, ] = await PublicKey.findProgramAddress(
      [
        anchorWallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintKey.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    );

    const instr = await program.instruction.updateLayerValue(
      layerBump,
      mintBump,
      new BN(layer.index),
      new BN(value),
      {
        accounts: {
          base: baseKey,
          layer: layerKey,
          mint: mintKey,
          payer: anchorWallet.publicKey,
          payerTa: walletTokenKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [],
      },
    );

    const updateResult = await Connection.sendTransactionWithRetry(
      connection,
      wallet,
      [instr],
      [],
    );

    console.log(updateResult);
    if (typeof updateResult === "string") {
      throw new Error(updateResult);
    } else {
      notify({
        message: "Layer Update succeeded",
        description: (
          <HyperLink href={explorerLinkFor(updateResult.txid, connection)}>
            View transaction on explorer
          </HyperLink>
        ),
      });
    }

    const newMints = [...relevantMints]
    const meta = await fetchLatestLayer(program, baseKey, layer.index);
    for (let mint of newMints) {
      if (mint.layerKey === meta.layerKey) {
        mint = meta;
        break;
      }
    }
    console.log(newMints);
    setRelevantMints(newMints);
    setActiveImage(await fetchLatestImage(program, meta));
    setLayer(meta);
    setNewLayerValue(String(meta.current));
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

  const relevantImagesC = (onClick) => {
    return (
      <ImageList cols={2}>
        {relevantMints.map((r, idx) => {
          return (
            <HoverButton
              key={idx}
              padding={0}
              disabled={false}
              handleClick={() => {
                if (!program) return; // TODO
                setLoading(true);
                const wrap = async () => {
                  try {
                    setActiveImage(await fetchLatestImage(program, r));
                    setLayer(r);
                    setNewLayerValue(String(r.current));
                    setLoading(false);
                    onClick();
                  } catch (err) {
                    notify({
                      message: 'Layer selection failed',
                      description: `${err}`,
                    });
                    setLoading(false);
                  }
                };
                wrap();
              }}
              hoverDisplay={(
                <React.Fragment>
                  <div style={{ fontSize: "1.5rem" }}>{r.name}</div>
                  <div>{explorerLinkForAddress(r.mint)}</div>
                </React.Fragment>
              )}
            >
              <ImageListItem
                style={{
                  minHeight: '30ch',
                  minWidth: '30ch',
                }}
              >
                <img
                  src={r.image}
                />
              </ImageListItem>
            </HoverButton>
          );
        })}
      </ImageList>
    );
  };

  const baseFieldC = (disabled : boolean) => {
    return (
      <TextField
        id="base-field"
        label={`Base`}
        value={base}
        disabled={disabled}
        inputProps={{
          sx: { fontFamily: 'Monospace' }
        }}
        onChange={e => setBase(e.target.value)}
      />
    );
  };

  const chooseBaseC = (onClick) => {
    return (
      <React.Fragment>
        {baseFieldC(false)}

        <Box sx={{ position: "relative" }}>
        <Button
          disabled={!anchorWallet || loading}
          variant="contained"
          style={{ width: "100%" }}
          onClick={() => {
            setLoading(true);
            const wrap = async () => {
              try {
                await search(new PublicKey(base));
                setLoading(false);
              } catch (err) {
               notify({
                  message: 'Search failed',
                  description: `${err}`,
                });
                setLoading(false);
              }
            };
            wrap();
          }}
        >
          Fetch
        </Button>
        {loading && loadingProgress()}
        </Box>

        {relevantImagesC(onClick)}
      </React.Fragment>
    );
  };

  const chooseLeverC = () => {
    return (
      <React.Fragment>
        {baseFieldC(true)}
        {layer && (
          <React.Fragment>
            <TextField
              id="layer-field"
              label={`Layer`}
              value={layer.mint.toBase58()}
              disabled={true}
              inputProps={{
                sx: { fontFamily: 'Monospace' }
              }}
            />
            <TextField
              id="layer-current-field"
              label={`Current Layer Value`}
              value={newLayerValue}
              disabled={false}
              inputProps={{
                sx: { fontFamily: 'Monospace' }
              }}
              onChange={e => setNewLayerValue(e.target.value)}
            />
          </React.Fragment>
        )}
        {activeImage && (
          <HoverButton
            padding={0}
            disabled={false}
            handleClick={() => {}}
            hoverDisplay={(
              <React.Fragment>
                <div style={{ fontSize: "1.5rem" }}>{activeImage.name}</div>
                <div>{explorerLinkForAddress(activeImage.mint)}</div>
              </React.Fragment>
            )}
          >
            <ImageListItem
              style={{
                minHeight: '30ch',
                minWidth: '30ch',
              }}
            >
              <img
                src={activeImage.image}
              />
            </ImageListItem>
          </HoverButton>
        )}

        <Box sx={{ position: "relative" }}>
        <Button
          disabled={!anchorWallet || loading || !layer || Number(newLayerValue) === layer.current}
          variant="contained"
          style={{ width: "100%" }}
          onClick={() => {
            if (!layer) return;
            setLoading(true);
            const wrap = async () => {
              try {
                await update(layer, newLayerValue);
                setLoading(false);
              } catch (err) {
               notify({
                  message: 'Chane Layer failed',
                  description: `${err}`,
                });
                setLoading(false);
              }
            };
            wrap();
          }}
        >
          Update Layer
        </Button>
        {loading && loadingProgress()}
        </Box>
      </React.Fragment>
    );
  };

  const steps = [
    { name: "Choose Base"  , inner: chooseBaseC } ,
    { name: "Choose Lever" , inner: chooseLeverC } ,
  ];

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

  const stepper = (
    <React.Fragment>
      <Stepper activeStep={stepToUse}>
        {steps.map(s => {
          return (
            <Step key={s.name}>
              <StepLabel>{s.name}</StepLabel>
            </Step>
          );
        })}
      </Stepper>
      <Box />
    </React.Fragment>
  );

  return (
    <Stack spacing={2}>
      {stepper}
      {steps[stepToUse].inner(handleNext)}
      {stepToUse > 0 && (
        <Button
          color="info"
          onClick={handleBack}
        >
          Back
        </Button>
      )}
    </Stack>
  );
};

const getWindowDimensions = () => {
  const { innerWidth: width, innerHeight: height } = window;
  return {
    width,
    height,
  };
};

// eslint-disable-next-line
const useWindowDimensions = () => {
  const [windowDimensions, setWindowDimensions] = React.useState(
    getWindowDimensions()
  );

  React.useEffect(() => {
    const handleResize = () => {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowDimensions;
};

function App() {
  const colorModeCtx = useColorMode();

  React.useEffect(() => {}, [colorModeCtx.mode]);

  const theme = React.useMemo(
    () => {
      let mode;
      if (colorModeCtx.mode === "dark" || !colorModeCtx.mode) {
        mode = "dark";
      } else {
        mode = "light";
      }

      return createTheme({
        palette: {
          mode,
        },
      })
    },
    [colorModeCtx.mode]
  );

  const { width } = useWindowDimensions();

  return (
    <div className="App" style={{ backgroundColor: "transparent" }}>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <CssBaseline />
          <Header narrow={width < 670}/>
          <Box
            maxWidth="60ch"
            width="calc(100% - 60px)"
            style={{
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <Box height="40px" />
            <Switch>
              <Route exact path="/glaze/" component={About} />
            </Switch>
            <Box height="80px" />
          </Box>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
