"use client";

import { useMemo } from "react";
import { useSetSettings, useSettings } from "../context/settings";
import { toXnodeAddress, useAddress } from "@/hooks/useAddress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useDisconnect, useSignMessage } from "wagmi";
import { recoverMessageAddress } from "viem";

export function LoginXnode() {
  const address = useAddress();
  const settings = useSettings();
  const setSettings = useSetSettings();

  const hasSignature = useMemo(() => {
    if (!address) {
      return true;
    } else return !!settings.wallets[address];
  }, [address, settings]);

  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  return (
    <Dialog open={!hasSignature}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wallet Signature Required</DialogTitle>
          <DialogDescription>
            To authenticate with your Xnodes, you will need to sign a message
            proving ownership of your account. It does not cost any gas to sign
            this message. The message will be saved in your browser to interact
            with all of your Xnodes until you delete it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => disconnectAsync().catch(console.error)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const message = "Create Xnode Manager session";
              signMessageAsync({ message })
                .then(async (sig) => {
                  const signer = await recoverMessageAddress({
                    message,
                    signature: sig,
                  });
                  setSettings({
                    ...settings,
                    wallets: {
                      ...settings.wallets,
                      [toXnodeAddress({ address: signer })]: sig,
                    },
                  });
                })
                .catch(console.error);
            }}
          >
            Sign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
