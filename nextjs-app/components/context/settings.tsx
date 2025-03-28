"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Hex } from "viem";

export interface Xnode {
  domain: string;
  owner: string;
  insecure: boolean;
  deploymentAuth?: string; // For deployments through this portal, store provider + device id for further operations
}

export interface Settings {
  xnodes: Xnode[];
  wallets: {
    [address: string]: Hex;
  };
}
const defaultSettings: Settings = {
  xnodes: [],
  wallets: {},
};
const SettingsContext = createContext<Settings>(defaultSettings);
const SetSettingsContext = createContext<(settings: Settings) => void>(
  () => {}
);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  const updateSettings = (settings: Settings) => {
    setSettings(settings);
    localStorage.setItem("settings", JSON.stringify(settings));
  };

  useEffect(() => {
    const storedSettings = localStorage.getItem("settings");
    if (storedSettings) {
      // storedSettings could be missing certain settings only introduced later
      setSettings({
        ...defaultSettings,
        ...JSON.parse(storedSettings),
      });
    }
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      <SetSettingsContext.Provider value={updateSettings}>
        {children}
      </SetSettingsContext.Provider>
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function useSetSettings() {
  return useContext(SetSettingsContext);
}
