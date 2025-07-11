"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { xnode } from "@openmesh-network/xnode-manager-sdk";

export interface Xnode {
  owner: string;
  loginArgs: Omit<xnode.auth.login_input, "baseUrl">;
  secure?: string;
  insecure?: string;
  deploymentAuth?: string; // For deployments through this frontend, store provider + device id for further operations
}

export interface Settings {
  xnodes: Xnode[];
}
const defaultSettings: Settings = {
  xnodes: [],
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
