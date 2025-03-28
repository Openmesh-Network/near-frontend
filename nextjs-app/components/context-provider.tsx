import { ReactNode } from "react";
import Web3Provider from "./web3-provider";
import { SettingsProvider } from "./context/settings";
import { NearProvider } from "./near-provider";
import { Toaster } from "./ui/sonner";

export function ContextProvider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  return (
    <SettingsProvider>
      <Web3Provider cookies={cookies}>
        <NearProvider>
          {children}
          <Toaster />
        </NearProvider>
      </Web3Provider>
    </SettingsProvider>
  );
}
