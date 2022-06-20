import React from 'react';
import { BrowserRouter, Route, Switch, withRouter } from 'react-router-dom';

import { PublicKey } from '@solana/web3.js';

import { Providers } from './providers';
import { AppLayout } from './components/Layout';
import { FireballView } from "./views/fireballView";
import { ExploreView } from "./views/exploreView";
import { SwapView } from './views/SwapView';

const ScrollToTop = ({ history }) => {
  React.useEffect(() => {
    const unlisten = history.listen(() => {
      window.scrollTo(0, 0);
    });
    return () => {
      unlisten();
    }
  }, []);

  return null;
}

const RouterScrollToTop = withRouter(ScrollToTop);

export function Routes() {
  const ingredients = [
    {
      name: 'telescope ape',
      image: 'https://arweave.net/ymOx2DsrdY3n1DnPVVK6KMFGZKPM_jEeRqaEbnvzZu4',
      video: 'https://arweave.net/0vGGf0XcKG4rVc4Gadn3aqTv_wiDJaYjdmR7ZlPivpU',
      glb: 'https://arweave.net/v_Gy-Y6faW8kXescQwUYR3OL8YGlXmbBu3scIx8IKpY',
      metadata: 'https://arweave.net/DMcea0fJpLAHiJy3ox5jS1YLEoJbLb9gq1r4qBBk854'
    },
    {
      name: 'whale',
      image: 'https://arweave.net/psryXBsGPnrElUPN3Z5XHgeuBEWoUxaG3ghPpbO69lM',
      video: 'https://arweave.net/aAjO5GtnS8uG42eaU3h4XHxybIULUg-eQs3IAJw2tu8',
      glb: 'https://arweave.net/DgBp36F40OCAMqKgGBVSsyaqfheFg-AHnj2BW3vLwP8',
      metadata: 'https://arweave.net/pF7lUmndha0L9LRxG4-Xcl5DbabvZeeibNO979NrShM'
    },
    {
      name: 'bull',
      image: 'https://arweave.net/vhclFB2oidkAmR2z999sEROV7VM3HRy9PGUqKIQcZEU',
      video: 'https://arweave.net/R05wYn8H_0F1FA4sc1vn2PlLpFsnrqSusReXGX1zBTg',
      glb: 'https://arweave.net/3g2rh59KBphgTmYcVHeI6HuSto0Nvs1F31-tldi4gB0',
      metadata: 'https://arweave.net/Wdndvlrk5DbeM8XPAeFJzZfynvAvCdCBMHS3e_WoaY0'
    },
    {
      name: 'normal duck',
      image: 'https://arweave.net/RDz_0logP8e6p6ol9xrw3SmLV1I6KmTy0AZrsLKkWrE',
      video: 'https://arweave.net/PSLQ-1X9SNwZZmNOoCEpXhEYywX_RlDp2vrqHB8EtLU',
      glb: 'https://arweave.net/La3ktPm1PsD4sgHVqBL3KSXRT0wRLZKS151stHwZAEo',
      metadata: 'https://arweave.net/WSY67pv8pd6tJp9BU-_zYpNImGSkGCHmF-ff1VqhFo4'
    },
    {
      name: 'duck with doughnut',
      image: 'https://arweave.net/SKCClZwNA07BQDqmuixW-OtNrQKfZ9ol0CVzFbeNDag',
      video: 'https://arweave.net/sSoxDL9iBSjmoMf9-9Sv6ohlTPyEnWvbQTIg6DsHAOM',
      glb: 'https://arweave.net/QsaM2fTM82aCcqLi6_T8vFgk6_tdlVtU3e3uXUiK6cs',
      metadata: 'https://arweave.net/gJMTWAJ2LV_ienxkUJ4JvXECA2u6cu7_gIEWSShhqLk'
    },
    {
      name: 'traincar',
      image: 'https://arweave.net/N78BFS24YXUiDwvNmNHoy1jTRaD6jFXH1rYF7fnJRNk',
      video: 'https://arweave.net/oglvSxkbRWPcUd1t44gunYOY3j42ThZ10j3Vzl4d5qE',
      glb: 'https://arweave.net/7YbA-XpLYA1aWOQVX2xuE5pIw7PBylfU5Gx0Rs4pDdw',
      metadata: 'https://arweave.net/WzjJRrPFmZRzaWqMSI2kedNwLhnvbIPb33yyjYZBmYE'
    },
    {
      name: 'rocket',
      image: 'https://arweave.net/wFN4vNd4L1hBUZUmzSX3PraW59decuPEEz0BzT_3oXA',
      video: 'https://arweave.net/nDAUGj7dbpwQnk3QwkzijjRwzjM6QSQI4xiAoHmyQqY',
      glb: 'https://arweave.net/PBaan2clkF2Omqgo7z9hZWPaYzhIHtqDCCqATEOnhRo',
      metadata: 'https://arweave.net/gC-ybOJbnQ_Rk-xm8dPw-tGGqe1XOIumc8f9Dnlb9tY'
    },
    {
      name: 'umbrella duck',
      image: 'https://arweave.net/qpvDvGSOsQWEW96ktkJHnIx2F_LcwedEqCAjkEWB4f4',
      video: 'https://arweave.net/DKJgCKkQgDiRKQteUp6KL9Gzc5buhWWQ0PrpjGgLlCY',
      glb: 'https://arweave.net/dIg0pfgg1gfPnLUd7jw2nPTB9RAXGm3dpaBsVTcNMQw',
      metadata: 'https://arweave.net/D_F0mbjYzZwW2H-XYxq0ZxRubbPCZRvLmRuwLQKNKBo'
    },
    {
      name: 'hot air balloon',
      image: 'https://arweave.net/6_Ktuj-jbl1_ak9X3R1HjAsvf2Z_1fM-BvQiaiLcrQ0',
      video: 'https://arweave.net/LOGY3hc6Az3mzCMZFMZ5HNDLMHPPxT_H97J3XUIHCWo',
      glb: 'https://arweave.net/aoQXjSXGNNAKohBn0MdvtoPrqVFLmnWV4IcV7wDq6EU',
      metadata: 'https://arweave.net/LuTNk7x2rOpU4jmKS6qkn_eiJ6lABIF1D1zOOMY-wTo'
    },
    {
      name: 'airplane',
      image: 'https://arweave.net/Pb1Su7IcqNjkFsJ34EGTqgjBkYeRQ6HnjYpPGOhb3Iw',
      video: 'https://arweave.net/gj0XZqZe5Dxxjtyj0fqg143fjPsuW168WJOfdfprHSo',
      glb: 'https://arweave.net/GgmzJyuzIPbZ8sYWa-soOcTrhsig1diOBXU-zyP5tcQ',
      metadata: 'https://arweave.net/eZ_Kh52C9RIm3BAIfKqp6l3D0hskshp8CXOdxhtN8-c'
    },
    {
      name: 'house',
      image: 'https://arweave.net/7b1Srv_ogJ3iISregNpCM0sZEbvIfQwzpVijA1Fepfc',
      video: 'https://arweave.net/fhUspVS9D6fZMF9-1was5-PSSTgDJjwGq11wMoEFYCc',
      glb: 'https://arweave.net/k1S_u81y031sEXDQXKjd0xVSw_LlZGrT5a4RD6vfUQE',
      metadata: 'https://arweave.net/2AEHAKZ7hj5KIXXqBxzvd3Y3TAJIy7RBFQl-MkA_Ovk'
    },
    {
      name: 'sailboat',
      image: 'https://arweave.net/nbWR_WTky3H7GgoSCw6Epx9WHNGor-Fnogcbq4twHLY',
      video: 'https://arweave.net/zk-GuOVS5JlwsrvEfZEzfQpGp7_4PhWKASh6JRT0wNE',
      glb: 'https://arweave.net/FoLJsWDpxSyJsvG0LdNaXYHMq5sNcbEY4Yi9u4t3OEE',
      metadata: 'https://arweave.net/gAjOv5TkfmVWNpc9oqb_RXsIrKROFqqOvgyE-RAXS4c'
    },
    {
      name: 'ufo',
      image: 'https://arweave.net/IdCg_A_qH4fzd9TNbIRiogDglO4z9fGHK9vrqMtI1mM',
      video: 'https://arweave.net/bZZVQQ6Oa8XoSLbtPt_i-lHI5BCv0t_GxofERZeI3K8',
      glb: 'https://arweave.net/6oKs-NkzzYa1GLLRzhzT-ub4yjwKPQM9Koac2T9GyPQ',
      metadata: 'https://arweave.net/lqYPBAGAs_Z9B_Hb7gIWwmVivtthTcVqxI2Ha_B_G6w'
    }
  ]

  const reduceIngredients = (v) => {
    return v.reduce((acc, i) => ({ ...acc, [i.name]: i.image }), {});
  };

  const ingredientMatching = (name: string) => {
    const res = ingredients.find(i => i.name === name);
    if (!res) throw new Error(`ingredient ${name} not found`);
    return res;
  };

  const ingredientSubset = (subset : Array<string>) => {
    return reduceIngredients(ingredients
      .filter(i => { return subset.includes(i.name); }));
  };

  const pathForYield = (y) => {
    return '/' + y.name.replaceAll(' ', '');
  };

  const cityYields = [
    {
      image: "https://4udejsogpoo3ekjmiigzgcgzyebntokt6oqavvw5vsv77xpvp5eq.arweave.net/5QZEycZ7nbIpLEINkwjZwQLZuVPzoArW3ayr_931f0k/?ext=gif",
      name: "red moon city",
      mint: new PublicKey("2gFFVAaFQe36FTBevz2cQHivXUfPse53dBSN65e96HND"),
    },
    {
      image: "https://pvibl5h2u52szj5hq5h4pselyzhjsckz53oziusek2insn4f75va.arweave.net/fVAV9PqndSynp4dPx8iLxk6ZCVnu3ZRSRFaQ2TeF_2o/?ext=gif",
      name: "blue moon beach",
      mint: new PublicKey("9vpjkWrc4GSW98HgrTZaknHKtxdrx7Cq6P6is4A7uwE1"),
    },
    {
      image: "https://u2pr74tvgu2uxgvscxk22my5b6o5esatoqgcv5npyfaaef37tv3a.arweave.net/pp8f8nU1NUuashXVrTMdD53SSBN0DCr1r8FAAhd_nXY/?ext=gif",
      name: "once in a solana moon",
      mint: new PublicKey("ENSkFqG4unsRq6bFa17vngQ8rfxsVdcvJJijyHdFi2XQ"),
    },
  ];

  const mightyKnightyDuckYields = [
    {
      image: "https://www.arweave.net/UMsb5j6OWgM-JUEeQqYej82kHFDw7GPGA2pzSUkRFdE?ext=gif",
      glb: "https://arweave.net/0SCrB_5BsAZ1f54XD60-SaVn7sqzi6svI96ABWjzIEc",
      name: "mighty knighty duck",
      mint: new PublicKey("2oXhnNh3pAPLBkQJyVceuZHNWkwpM5azKjGfqeBbAF3R"),
    },
  ];

  const apeCyborgYields = [
    {
      image: "https://arweave.net/w2I8pcZ4bRWpDOxxZOFS2CEzgm9GOf9nhVW0ZFNluJU",
      glb: "https://arweave.net/y3i4FA-tzsOxZEV49XMtlfsN3a9Et5PgABczTQHS23w",
      name: "professor ape cyborg",
      mint: new PublicKey("J8nLE658PUcLGU6qecatWweutttC9yofxF4UTeYutUXj"),
    },
  ];

  const deppelinYields = [
    {
      image: "https://arweave.net/TC6GCCkNepHVlNCekaSBbX-a4FVwV3PVBIXixdod34E",
      glb: "https://arweave.net/oL8-wWOC0DLpQUCFXwmA9Kpmu1fAueKHk6KAdn3w6Qk",
      name: "deppelin",
      mint: new PublicKey("BNJwHxo5yP9W77aVrmAehepr1QLRXkBPyEzZqUUisg8o"),
    },
  ];

  const gwendolinYields = [
    {
      image: "https://arweave.net/ksXwJ1HAj1PD7qwFwEGRS84u3VxaqzsXDLTKgPcL6O8",
      glb: "https://arweave.net/fkKWBlxJHW_lF2mt6Iu5KhRydAC5Hx6ZwJ-OZa2VgZw",
      name: "gwendolin",
      mint: new PublicKey("WfN7PjJxiTfsXyo5vycwhr2bYPHwGBFqh6jp8tvtt7o"),
    },
  ];


  return (
    <>
      <BrowserRouter basename={'/'}>
        <Providers>
        <AppLayout>
          <RouterScrollToTop />
          <Switch>
            <Route path="/collectoooooor" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("HHNbiYDEAJ2PXv5GZXXrn2Ypi1s8CfZK4asgnpg6MSUi")}
                  recipeYields={cityYields}
                  ingredients={reduceIngredients(ingredients)}
                />
              )
            } />
            {cityYields.map((y, idx) => (
              <Route key={idx} path={pathForYield(y)} component={
                () => (
                  <FireballView
                    recipeKey={new PublicKey("HHNbiYDEAJ2PXv5GZXXrn2Ypi1s8CfZK4asgnpg6MSUi")}
                    recipeYields={[y]}
                    ingredients={reduceIngredients(ingredients)}
                  />
                )
              } />
            ))}
            <Route path="/mightyknightyduck" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("HnKE8p6cdcfbn4hZA3wT4YciXvALzmFb9Fc91b74Ka1i")}
                  recipeYields={mightyKnightyDuckYields}
                  ingredients={{
                    ...ingredientSubset(['duck with doughnut', 'normal duck']),
                    "mighty knighty duck recipe": "https://www.arweave.net/5-CbCHZGiLBHwx8GPZx2g8aIvX_5mG_TUpuvoTUo3Lk?ext=png",
                  }}
                />
              )
            } />
            <Route path="/professorapecyborg" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("GUKyCfChES46JJxFv75hKCdhR3qorTkTa5cppU27v9Cp")}
                  recipeYields={apeCyborgYields}
                  ingredients={{
                    ...ingredientSubset(['traincar', 'telescope ape', 'house']),
                  }}
                />
              )
            } />
            <Route path="/deppelin" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("5yLsFHmrUqh1MuC1FMx3jpFudfWJ4vVkiHr7tEgNekjM")}
                  recipeYields={deppelinYields}
                  ingredients={{
                    ...ingredientSubset(['sailboat', 'hot air balloon']),
                  }}
                />
              )
            } />
            <Route path="/gwendolin" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("44h7CvSmWGHfXJTgtEjhxuaxbCXWG9dBUpgXq4Ume7Hs")}
                  recipeYields={gwendolinYields}
                  ingredients={{
                    'gwenda 1': ingredientMatching('umbrella duck').image,
                    'gwenda 2': ingredientMatching('umbrella duck').image,
                    'gwenda 3': ingredientMatching('umbrella duck').image,
                    'gwenda 4': ingredientMatching('umbrella duck').image,
                  }}
                />
              )
            } />
            <Route path="/swap" component={SwapView} />
            <Route path="/" component={
              () => (
                <ExploreView
                  recipeYields={[
                    ...gwendolinYields.map(c => ({ ...c, link: "/gwendolin" })),
                    ...deppelinYields.map(c => ({ ...c, link: "/deppelin" })),
                    ...apeCyborgYields.map(c => ({ ...c, link: "/professorapecyborg" })),
                    ...mightyKnightyDuckYields.map(c => ({ ...c, link: "/mightyknightyduck" })),
                    ...cityYields.map(c => ({ ...c, link: pathForYield(c) })),
                  ]}
                  ingredients={ingredients}
                />
              )
            } />
          </Switch>
        </AppLayout>
        </Providers>
      </BrowserRouter>
    </>
  );
}
