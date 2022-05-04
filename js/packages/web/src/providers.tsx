import {
  ConnectionProvider,
  StoreProvider,
  WalletProvider,
  MetaProvider,
} from '@oyster/common';
import React, { FC } from 'react';
import { ConfettiProvider } from './components/Confetti';
import { LoaderProvider } from './components/Loader';
import { CoingeckoProvider } from './contexts/coingecko';
import { AnchorContextProvider } from './contexts/anchorContext';
import { DevModeContextProvider } from './contexts/devModeContext';

export const Providers: FC = ({ children }) => {
  return (
    <ConnectionProvider>
      <WalletProvider>
            <CoingeckoProvider>
              <LoaderProvider>
                <AnchorContextProvider>
                  <DevModeContextProvider>
                    {children}
                  </DevModeContextProvider>
                </AnchorContextProvider>
              </LoaderProvider>
            </CoingeckoProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
