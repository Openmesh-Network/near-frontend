"use client";

import { useSetSettings, useSettings, Xnode } from "../context/settings";
import { useAddress } from "@/hooks/useAddress";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { xnode } from "@openmesh-network/xnode-manager-sdk";
import { getBaseUrl } from "@/lib/xnode";
import { LoginXnode, LoginXnodeParams } from "./login";

export function ImportXnode() {
  const address = useAddress();
  const settings = useSettings();
  const setSettings = useSetSettings();

  const [domain, setDomain] = useState<string>("");
  const [login, setLogin] = useState<LoginXnodeParams | undefined>(undefined);

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button disabled={!address}>Import</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Xnode</DialogTitle>
            <DialogDescription>
              In case you have deployed an Xnode before and wish to manage it
              through this interface. The connected wallet should be the owner
              of the imported Xnode.
            </DialogDescription>
            <div className="flex flex-col gap-1">
              <Label htmlFor="xnode-domain">Xnode Domain</Label>
              <Input
                id="xnode-domain"
                placeholder="xnode.example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                onClick={() => {
                  setDomain("");
                }}
              >
                Cancel
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                onClick={() => {
                  if (!address) {
                    return;
                  }

                  // If domain is ip address, use insecure
                  const insecure = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
                  const messageDomain = insecure
                    ? "manager.xnode.local"
                    : domain;
                  const messageTimestamp = Math.round(Date.now() / 1000);

                  setLogin({
                    message: `Xnode Auth authenticate ${messageDomain} at ${messageTimestamp}`,
                    onSigned(signature) {
                      const importedXnode = {
                        owner: address,
                        secure: !insecure ? domain : undefined,
                        insecure: insecure ? domain : undefined,
                        loginArgs: {
                          user: address,
                          signature,
                          timestamp: messageTimestamp.toString(),
                        },
                      } as Xnode;

                      const baseUrl = getBaseUrl({ xnode: importedXnode });
                      if (!baseUrl) {
                        throw new Error(
                          `Base url for Xnode ${importedXnode} could not be calculated.`
                        );
                      }

                      xnode.auth
                        .login({ baseUrl, ...importedXnode.loginArgs })
                        .then(() => {
                          setSettings({
                            ...settings,
                            xnodes: settings.xnodes.concat([importedXnode]),
                          });
                          setDomain("");
                        });

                      setLogin(undefined);
                    },
                    onCancel() {
                      setLogin(undefined);
                    },
                  });
                }}
              >
                Import
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {login && <LoginXnode {...login} />}
    </>
  );
}
