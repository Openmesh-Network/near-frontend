"use client";

import type {
  NearConnector,
  SignAndSendTransactionsParams,
  SignedMessage,
  SignMessageParams,
} from "@hot-labs/near-connect";
import type { providers } from "near-api-js";
import {
  type FC,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { metadata, projectId } from "./web3-provider";

interface NearWalletContextValue {
  connector: NearConnector | null;
  accountId: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: SignMessageParams) => Promise<{
    signatureData: SignedMessage;
    signedData: SignMessageParams;
  }>;
  signAndSendTransactions: (
    params: SignAndSendTransactionsParams
  ) => Promise<providers.FinalExecutionOutcome[]>;
}

const NearWalletContext = createContext<NearWalletContextValue | null>(null);

export const NearWalletProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  const init = useCallback(async () => {
    if (connector) {
      return connector;
    }

    const { NearConnector } = await import(
      "@hot-labs/near-connect/build/NearConnector"
    );

    let newConnector: NearConnector | null = null;

    try {
      newConnector = new NearConnector({
        network: "mainnet",
        walletConnect: {
          projectId,
          metadata,
        },
      });
    } catch (err) {
      console.error(err);
      return;
    }

    newConnector.on("wallet:signOut", () => setAccountId(null));
    newConnector.on("wallet:signIn", (t) => {
      setAccountId(t.accounts?.[0]?.accountId ?? null);
    });

    setConnector(newConnector);

    try {
      const wallet = await newConnector.wallet();
      const account = await wallet
        .getAccounts()
        .then((accounts) => accounts.at(0));
      if (account) {
        setAccountId(account.accountId);
      }
    } catch {} // No existing wallet connection found

    return newConnector;
  }, [connector]);

  const connect = useCallback(async () => {
    const newConnector = connector ?? (await init());
    if (newConnector) {
      await newConnector.connect();
    }
  }, [connector, init]);

  const disconnect = useCallback(async () => {
    if (!connector) return;
    await connector.disconnect();
  }, [connector]);

  const signMessage = useCallback(
    async (message: SignMessageParams) => {
      if (!connector) {
        throw new Error("Connector not initialized");
      }
      const wallet = await connector.wallet();
      const signatureData = await wallet.signMessage(message);
      return { signatureData, signedData: message };
    },
    [connector]
  );

  const signAndSendTransactions = useCallback(
    async (params: SignAndSendTransactionsParams) => {
      if (!connector) {
        throw new Error("Connector not initialized");
      }
      const wallet = await connector.wallet();
      return wallet.signAndSendTransactions({
        transactions: params.transactions,
      });
    },
    [connector]
  );

  const value = useMemo<NearWalletContextValue>(() => {
    return {
      connector,
      accountId,
      connect,
      disconnect,
      signMessage,
      signAndSendTransactions,
    };
  }, [
    connector,
    accountId,
    connect,
    disconnect,
    signMessage,
    signAndSendTransactions,
  ]);

  return (
    <NearWalletContext.Provider value={value}>
      {children}
    </NearWalletContext.Provider>
  );
};

export function useNearWallet() {
  const ctx = useContext(NearWalletContext);
  if (!ctx) {
    throw new Error("useNearWallet must be used within a NearWalletProvider");
  }
  return ctx;
}
