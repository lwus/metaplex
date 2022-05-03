import React from "react";
import useWindowDimensions from '../utils/layout';
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

import {
  CachedImageContent,
} from '../components/ArtContent';

const entanglements = [
  {
    name: "red moon city",
    url: "https://arweave.net/eCHU4AYiHhcI1tI1-jnwHDopH2t-86UHpjAcnZs9jlw",
    image: "https://www.arweave.net/5QZEycZ7nbIpLEINkwjZwQLZuVPzoArW3ayr_931f0k",
    pairs: [
      {
        edition: 1,
        mintA: "9WGUcsZsdegD1YZwp7ACiGf226ZxWTXRskxvM6soWazq",
        mintB: "6SiZLr5vRdAMWmJRLC63DYs27gHq2gDMQNp3jSV43yrU",
      },
      {
        edition: 2,
        mintA: "6qqnX651YSsjPPCjDf4PaKVk69waSfMEVuB5USxppeWk",
        mintB: "9QCLF2M17HdCLKu7whcV688SkC3g8YhxJiEXxAkPSCaT",
      },
      {
        edition: 3,
        mintA: "HV9DrFAaWBoNqi3bW1Kbu3pkYQ9YBVXEUrvc9WBBVoXd",
        mintB: "6EUY2rL4kQnw1BShhnaAfV62HRgmgcoVh2CEDUKDPiR5",
      },
      {
        edition: 4,
        mintA: "AD97f7kJjsBzRx5xL6aTXmWQD7kYejEW14Z3jcxLczDE",
        mintB: "AMenJXE9h4XjwBsnkUuvcBSxqxmujjxGQCCdixXSJNrN",
      },
      {
        edition: 5,
        mintA: "BentUWDMka73geHD2qTwokfXoxorb8K8VrtKuZkKE9No",
        mintB: "HB6ReN7r1tiQ6MXDkkkpTiu5yPahexremSqVSdT2VTYh",
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
        mintA: "3t8S6FUqtDriWX18K7eGqeUnvjKXR6utqg7GqLfcwKXc",
        mintB: "AurY6syPcbGxWvsgMQiEcMfjY22YHdDqwLwtGU7hzfWS",
      },
      {
        edition: 2,
        mintA: "3C6beAkftjvYexRua9heov6qh2t8L3UC81JN85KmPdRx",
        mintB: "9MCSb2C8mh4BVeWf69f411qNCXyQTrDJDmLUk2QFLqVZ",
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
        mintA: "B7T1QJFH1ZczVEB4Y9z6XKQU7vnQWvRGpoEjgg3piMLC",
        mintB: "92onn8pS3LBLSP6hEMPFCRqESEFLojkFkPmHiKM3KvPN",
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
        mintA: "6aa1kP42MzdguucsJbEgcA6u32UfyHdcXqgB7ofgDzPT",
        mintB: "6DA1aU7tfWw5wnuP6YuscXD3fvLYzagNW9PbpwiS28z6",
      },
      {
        edition: 13,
        mintA: "3CUvSTgizJfacfzxy6Z1MUkNy2oSH57absXM9meUyLhT",
        mintB: "47vHB9YqdYc8TEhb3rra6JNPxrtDLWsbgSQYZz35R4wJ",
      },
      {
        edition: 12,
        mintA: "7EnejDExTUUh9YA3DMVgsjr5uM4UEaCVqYbfP7S2vpkQ",
        mintB: "9fuzps9tqAGw1nE5mwznvHsC3k5mFsRM1EteS5JqqRwE",
      },
      {
        edition: 11,
        mintA: "6Y61AW16iiMmCQt9MtXA2dKhat8fsBwJRSm9ZYFEcd9i",
        mintB: "BjtmUTXLQ4yKx8oCJHPmXVAfDcFh5X6h1wufGzKU36pH",
      },
      {
        edition: 10,
        mintA: "2A89DmpzVqKXuV1qwDiNbRDtQuJtp6DXbCNyPKhBcxLk",
        mintB: "6JcX5b1PcuXiQgGz82GGrXUXiZ24fGfU8q8cbjfp7urm",
      },
      {
        edition: 9,
        mintA: "5AfYwLWDe1jswXZb8VT5QDyLkBJaoEj9hv6ScTy3pfzz",
        mintB: "Cc1oqFLV1A9Q2z2haiDwAfJSRvsuN92GGZuQWa4n7cGC",
      },
      {
        edition: 8,
        mintA: "5ijGf7XVxxSeKHePsNJ8LMwdSD2EosBLQxi9yjcQCVbz",
        mintB: "DNfi28rPLBVpWE9zkSTGdbNeYEqAvKzxKhkFHHCU7C75",
      },
      {
        edition: 7,
        mintA: "FLwCoEiaeqZ5XRZB7KFjLEAY6HnMQuYx2egNceCc1RDJ",
        mintB: "2MrnT1gjphTLxJNjZT7QXT44fZjjTNUTDrgU4E5cDaRa",
      },
      {
        edition: 6,
        mintA: "5zE6F7pFpGyEziyGWrX3nJdSpsEqP5pyaxvNDDbfZhD5",
        mintB: "J9JBiYKAB1ZHJB71yVfvvDzrnvw5mk62TxvfR5PNfzbp",
      },
      {
        edition: 5,
        mintA: "GqGXTPLHN3M5mNUsBv156eAvsX4kjQcHhDV3nqUpwG3T",
        mintB: "2bcokg3NZ3YMFra748zAY7E56GTcdv2RRAioweqFCkNV",
      },
      {
        edition: 4,
        mintA: "6PEskoXZtGKZRgqEL9RunQC1P4tipeoB2QsCpYyS5dUM",
        mintB: "3YbAdn8QTgijY5yCHxcjEwaBtPtgL5kFY6LhUCKEwrGg",
      },
      {
        edition: 3,
        mintA: "S6C5s4AHaFxiGvj5L1JNptoG95fCFSCzLLpGGhRqdGh",
        mintB: "32mQ9778oRXmDxLPVfgNqQunUL67G5AYrGp3sRtEV9Y6",
      },
      {
        edition: 2,
        mintA: "EavxtZYmTCLed7ShCPLLVbg4YBFtcqN5WGwyUEJtshd4",
        mintB: "ymTbjqvNUo9xFRGD89eKhUM6sHRxPihCTyP3G2vGtDA",
      },
      {
        edition: 1,
        mintA: "3qjo19UiFaWZEdZCixH2ADebpHTABQp16JfXiRdpBGUu",
        mintB: "6RFoyNMoxax22gPJr8rR7d3rQ8sU2bo4s8FCYd43Vroa",
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
        mintA: "4zoKQanNtzJsCmWnH36aSw91ZHLXrLa5Xfe8xXHwTZnR",
        mintB: "52WYhZ6sKTdzk9dDqkFKBQp5WBUmpmDo3k49pkLt5gxZ",
      },
      {
        edition: 2,
        mintA: "4SnpnbuwBbh29Ts13JhhpGjkvgmWi2Xriknm8mpMTdCy",
        mintB: "7SzLVw9fs2ztEEJ5S7K9D4EPMmpr1URHgWzjAyyfciw5",
      },
      {
        edition: 1,
        mintA: "GzAbFfG6T3k4AtK5jRtDJZ6Ju6iDo6sTbsAAjYh8VsVm",
        mintB: "HGinUtX9ERUpkmfATbpTQPi2kBmazH7nUyXmMATkWHWg",
      },
    ]
  },
];

export const SwapView = () => {

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
                />
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>
    </Stack>
  );
}
