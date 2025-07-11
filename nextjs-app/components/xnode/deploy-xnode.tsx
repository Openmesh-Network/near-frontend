"use client";

import { useAddress } from "@/hooks/useAddress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import HardwareSelector from "../deployment/hardware-selector";
import { Separator } from "../ui/separator";
import { HardwareProduct } from "@/lib/hardware";
import { useState } from "react";
import HardwareDeployer from "../deployment/hardware-deployer";
import { useSetSettings, useSettings, Xnode } from "../context/settings";
import { LoginXnode, LoginXnodeParams } from "./login";
import { getBaseUrl } from "@/lib/xnode";
import { xnode } from "@openmesh-network/xnode-manager-sdk";

export function DeployXnode() {
  const address = useAddress();
  const [open, setOpen] = useState<boolean>(false);
  const [step, setStep] = useState<
    { type: "select" } | { type: "deploy"; hardware: HardwareProduct }
  >({ type: "select" });

  const settings = useSettings();
  const setSettings = useSetSettings();
  const [login, setLogin] = useState<LoginXnodeParams | undefined>(undefined);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button disabled={!address}>Deploy</Button>
        </DialogTrigger>
        {step.type === "select" && (
          <DialogContent className="sm:max-w-7xl">
            <DialogHeader>
              <DialogTitle>Select Hardware Product</DialogTitle>
              <DialogDescription>
                Aggregation of hardware available for rental from several cloud
                providers.
              </DialogDescription>
            </DialogHeader>
            <Separator />
            <HardwareSelector
              onSelect={(hardware) => setStep({ type: "deploy", hardware })}
            />
          </DialogContent>
        )}
        {step.type === "deploy" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deploy Hardware Product</DialogTitle>
              <DialogDescription>
                Aggregation of hardware available for rental from several cloud
                providers.
              </DialogDescription>
            </DialogHeader>
            <Separator />
            <HardwareDeployer
              hardware={step.hardware}
              onDeployed={(machine) => {
                const messageDomain = "manager.xnode.local";
                const messageTimestamp = Math.round(Date.now() / 1000);

                setLogin({
                  message: `Xnode Auth authenticate ${messageDomain} at ${messageTimestamp}`,
                  onSigned(signature) {
                    const importedXnode = {
                      insecure: machine.ipAddress,
                      owner: machine.owner,
                      deploymentAuth: machine.deploymentAuth,
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
                      });

                    setLogin(undefined);
                  },
                  onCancel() {
                    setLogin(undefined);
                  },
                });
                setStep({ type: "select" });
                setOpen(false);
              }}
              onCancel={() => setStep({ type: "select" })}
            />
          </DialogContent>
        )}
      </Dialog>
      {login && <LoginXnode {...login} />}
    </>
  );
}
