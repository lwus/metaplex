import React from "react";
import { Link } from "react-router-dom";

import { Button } from 'antd';
import {
  Box,
  Chip,
  Link as HyperLink,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Stack,
  Switch,
} from "@mui/material";
import { alpha, styled } from '@mui/material/styles';

import {
  Connection as RPCConnection,
  PublicKey,
} from "@solana/web3.js";

import {
  useConnectionConfig,
  shortenAddress,
} from '@oyster/common';

import {
  useLoading,
} from '../components/Loader';
import {
  CachedImageContent,
} from '../components/ArtContent';
import {
  Recipe,
  getEditionsRemaining,
  remainingText,
} from './fireballView';
import useWindowDimensions from '../utils/layout';
import {
  envFor,
} from '../utils/transactions';

export type RecipeLink = {
  image: string,
  name: string,
  mint?: PublicKey,
  link?: string,
  glb?: string,
};

const PurpleSwitch = styled(Switch)(({ theme }) => ({
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: "#b480eb",
    '&:hover': {
      backgroundColor: alpha("#b480eb", theme.palette.action.hoverOpacity),
    },
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: "#b480eb",
  },
}));

export const ExploreView = (
  props: {
    recipeYields: Array<RecipeLink>,
    ingredients: Array<any>,
  },
) => {
  const { endpoint } = useConnectionConfig();
  const connection = React.useMemo(
    () => new RPCConnection(endpoint.url, 'recent'),
    [endpoint]
  );

  const { loading, setLoading } = useLoading();

  const [checked3d, setChecked3d] = React.useState(false);
  const [recipeChecked3d, setRecipechecked3d] = React.useState(false);
  const [editionsRemaining, setEditionsRemaining] = React.useState([]);

  React.useEffect(() => {
    if (!connection) return;
    setLoading(true);
    const wrap = async () => {
      try {
        setEditionsRemaining(await getEditionsRemaining( // TODO: dedup work?
          connection, props.recipeYields.map(c => c.mint).filter((c) : c is PublicKey => !!c)));
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    wrap();
  }, [props]); // TODO: constrain?

  const explorerLinkForAddress = (key : PublicKey, shorten: boolean = true) => {
    return (
      <HyperLink
        href={`https://explorer.solana.com/address/${key.toBase58()}?cluster=${envFor(connection)}`}
        target="_blank"
        rel="noreferrer"
        title={key.toBase58()}
        underline="none"
        sx={{
          fontFamily: 'Monospace',
        }}
      >
        {shorten ? shortenAddress(key.toBase58()) : key.toBase58()}
      </HyperLink>
    );
  };

  // TODO: more robust
  const maxWidth = 960;
  const outerPadding = 96 * 2;
  const columnsGap = 40;
  const maxColumns = 3;
  const columnWidth = (maxWidth - columnsGap * (maxColumns - 1)) / maxColumns;

  const tilePadding = 0;

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
  const imageWidth = (function () {
    if (width > 576) {
      let layoutWidth = Math.min(width - outerPadding, maxWidth);
      return (layoutWidth - (cols - 1) * columnsGap) / cols;
    } else {
      // 1 column
      return width - 12 * 2;
    }
  })();

  const GalleryTour = () => {
    return <>
      <video
        autoPlay loop muted
        style={{
          height: "600px",
          marginLeft: -outerPadding / 2,
          width: (width >= maxWidth + outerPadding ? maxWidth + outerPadding : width),
          overflowX: "hidden",
          objectFit: "cover",
        }}
      >
        <source src="/cyber_gallery.mp4" type="video/mp4" />
      </video>
      <Box />
      <Box />
    </>
  };

  return (
    <Stack
      spacing={1}
      style={{
        ...(width >= maxWidth + outerPadding ? { width: maxWidth } : {}),
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <p className={"text-title"}>
        The Recipes
      </p>
      <p className={"text-subtitle"}>
        Recipes let you mix and match your current NFTs to craft new, rarer items. View in 3D!
        <PurpleSwitch
          checked={recipeChecked3d}
          onChange={e => setRecipechecked3d(e.target.checked)}
        />
      </p>
      <Box style={{ height: '20px' }} />
      <ImageList cols={cols} gap={columnsGap}>
        {props.recipeYields.map((r, idx) => {
          const yieldImage = (style) => {
            if (recipeChecked3d && r.glb) {
              // @ts-ignore
              return (<model-viewer
                alt={r.name}
                src={r.glb}
                ar
                ar-modes="webxr scene-viewer quick-look"
                className={"fullAspectRatio"}
                camera-controls
                enable-pan
                style={{
                  width: imageWidth,
                  height: imageWidth,
                }}
              />);
            }
            return (<CachedImageContent
              uri={r.image}
              preview={!!r.link}
              className={"fullAspectRatio"}
              style={{
                ...style,
              }}
            />);
          };
          const remaining = r.mint ? editionsRemaining[r.mint.toBase58()] : null;
          return (
            <div
              key={idx}
              style={{
                minWidth: columnWidth,
              }}
            >
              <ImageListItem>
                {r.link
                  ? (
                    yieldImage({})
                  )
                  : (
                    <div>
                      {yieldImage({ filter: 'grayscale(100%)' })}
                    </div>
                  )
                }
                <ImageListItemBar
                  title={r.name}
                  subtitle={(
                    <div
                      style={{
                        paddingBottom: '10px',
                      }}
                    >
                      {r.mint
                        ? explorerLinkForAddress(r.mint)
                        : (
                          <p
                            style={{
                              fontSize: '12px',
                              fontFamily: 'Monospace',
                              color: '#b480eb',
                            }}
                          >
                            Coming Soon
                          </p>
                        )
                      }
                    </div>
                  )}
                  position="below"
                />
                <div>
                {!!remaining && (
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      marginTop: "-10px",
                      marginBottom: "10px",
                      color: "gray",
                      lineHeight: "normal",
                    }}
                  >
                    {remainingText({remaining}) /*expects a dict*/}
                  </p>
                )}
                </div>
                <span>
                <Button
                  style={{
                    borderRadius: "30px",
                    height: "35px",
                  }}
                >
                  {r.link && <Link
                    to={r.link}
                    style={{
                      color: 'inherit',
                      display: 'block',
                    }}
                  >
                    View Recipe
                  </Link>}
                </Button>
                </span>
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>
      <p className={"text-title"}>
        The OGs
      </p>
      <p className={"text-subtitle"}>
        View in 3D!
        <PurpleSwitch
          checked={checked3d}
          onChange={e => setChecked3d(e.target.checked)}
        />
      </p>
      <ImageList cols={cols} gap={columnsGap}>
        {props.ingredients.map(r => {
          return (
            <div
              key={r.name}
              style={{
                minWidth: columnWidth,
              }}
            >
              <ImageListItem
                style={{
                }}
              >
                {checked3d ?
                  // @ts-ignore
                  (<model-viewer
                    alt={r.name}
                    src={r.glb}
                    ar
                    ar-modes="webxr scene-viewer quick-look"
                    className={"fullAspectRatio"}
                    camera-controls
                    enable-pan
                    style={{
                      width: imageWidth,
                      height: imageWidth,
                    }}
                  />
                ) : (
                  <CachedImageContent
                    uri={r.image}
                    preview={false}
                    className={"fullAspectRatio"}
                  />
                )}
                <ImageListItemBar
                  title={r.name}
                  position="below"
                />
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>

      {width >= 768 && <>
        <Box style={{ height: '20px' }} />
        <p className={"text-title"}>
          The Metaverse
        </p>
        <p className={"text-subtitle"}>
          <a
            href="https://www.cyber.xyz/thecollectoooooor"
            target="_blank"
          >
            From pplpleasr and cyber.xyz
          </a>
        </p>
        <Box style={{ height: '10px' }} />
        <GalleryTour />
      </>}
    </Stack>
  );
}

