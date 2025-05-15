"use client";

import "@near-wallet-selector/modal-ui/styles.css";

import { setupCoin98Wallet } from "@near-wallet-selector/coin98-wallet";
import type { AccountState, WalletSelector } from "@near-wallet-selector/core";
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupMathWallet } from "@near-wallet-selector/math-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMeteorWalletApp } from "@near-wallet-selector/meteor-wallet-app";
import { setupNarwallets } from "@near-wallet-selector/narwallets";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupNearFi } from "@near-wallet-selector/nearfi";
import { setupNightly } from "@near-wallet-selector/nightly";
import { setupSender } from "@near-wallet-selector/sender";
import { setupBitgetWallet } from "@near-wallet-selector/bitget-wallet";
import { setupWalletConnect } from "@near-wallet-selector/wallet-connect";
import { setupWelldoneWallet } from "@near-wallet-selector/welldone-wallet";
import { setupNearSnap } from "@near-wallet-selector/near-snap";
import { setupNeth } from "@near-wallet-selector/neth";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupLedger } from "@near-wallet-selector/ledger";
import { setupXDEFI } from "@near-wallet-selector/xdefi";
import { setupRamperWallet } from "@near-wallet-selector/ramper-wallet";
import { setupNearMobileWallet } from "@near-wallet-selector/near-mobile-wallet";
import { setupMintbaseWallet } from "@near-wallet-selector/mintbase-wallet";
import { setupBitteWallet } from "@near-wallet-selector/bitte-wallet";
import { setupOKXWallet } from "@near-wallet-selector/okx-wallet";
import { setupEthereumWallets } from "@near-wallet-selector/ethereum-wallets";

import type { ReactNode } from "react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";
import { distinctUntilChanged, map } from "rxjs";
import { metadata, projectId } from "./web3-provider";

declare global {
  interface Window {
    selector: WalletSelector;
    modal: WalletSelectorModal;
  }
}

interface WalletSelectorContextValue {
  selector: WalletSelector;
  modal: WalletSelectorModal;
  accounts: Array<AccountState>;
  accountId: string | null;
  loading: boolean;
}

const WalletSelectorContext =
  React.createContext<WalletSelectorContextValue | null>(null);

const CONTRACT_ID = "";

export const NearProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accounts, setAccounts] = useState<Array<AccountState>>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const init = useCallback(async () => {
    const _selector = await setupWalletSelector({
      network: "mainnet",
      modules: [
        setupMyNearWallet(),
        setupLedger(),
        setupSender(),
        setupBitgetWallet(),
        setupMathWallet(),
        setupNightly(),
        setupMeteorWallet(),
        setupMeteorWalletApp({ contractId: CONTRACT_ID }),
        // setupNearSnap(),
        setupOKXWallet(),
        setupNarwallets(),
        setupWelldoneWallet(),
        setupHereWallet(),
        setupCoin98Wallet(),
        // setupNearFi(),
        setupRamperWallet(),
        // setupNeth({
        //   gas: "300000000000000",
        //   bundle: false,
        // }),
        setupXDEFI(),
        setupWalletConnect({
          projectId: projectId,
          metadata: metadata,
        }),
        setupNearMobileWallet(),
        // setupMintbaseWallet({ contractId: CONTRACT_ID }),
        // setupBitteWallet({ contractId: CONTRACT_ID }),
        // setupEthereumWallets({ wagmiConfig, web3Modal }),
      ],
    });
    const _modal = setupModal(_selector, {
      contractId: CONTRACT_ID,
    });
    const state = _selector.store.getState();
    setAccounts(state.accounts);

    // this is added for debugging purpose only
    // for more information (https://github.com/near/wallet-selector/pull/764#issuecomment-1498073367)
    window.selector = _selector;
    window.modal = _modal;

    setSelector(_selector);
    setModal(_modal);
    setLoading(false);
  }, []);

  useEffect(() => {
    init().catch((err) => {
      console.error(err);
      alert("Failed to Initialize wallet selector");
    });
  }, [init]);

  useEffect(() => {
    if (!selector) {
      return;
    }

    const subscription = selector.store.observable
      .pipe(
        map((state) => state.accounts),
        distinctUntilChanged()
      )
      .subscribe((nextAccounts) => {
        console.log("Accounts Update", nextAccounts);

        setAccounts(nextAccounts);
      });

    const onHideSubscription = modal!.on("onHide", ({ hideReason }) => {
      console.log(`The reason for hiding the modal ${hideReason}`);
    });

    return () => {
      subscription.unsubscribe();
      onHideSubscription.remove();
    };
  }, [selector, modal]);

  const walletSelectorContextValue = useMemo<WalletSelectorContextValue>(
    () => ({
      selector: selector!,
      modal: modal!,
      accounts,
      accountId: accounts.find((account) => account.active)?.accountId || null,
      loading,
    }),
    [selector, modal, accounts, loading]
  );

  return (
    <WalletSelectorContext.Provider value={walletSelectorContextValue}>
      {children}
    </WalletSelectorContext.Provider>
  );
};

export function useNear() {
  const context = useContext(WalletSelectorContext);

  if (!context) {
    throw new Error(
      "useWalletSelector must be used within a WalletSelectorContextProvider"
    );
  }

  return context;
}
