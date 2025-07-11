"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useAccount, useSignMessage } from "wagmi";
import { SignMessageReturnType } from "viem";

export interface LoginXnodeParams {
  message: string;
  onSigned: (signature: SignMessageReturnType) => void;
  onCancel: () => void;
}

export function LoginXnode({ message, onSigned, onCancel }: LoginXnodeParams) {
  const { signMessageAsync } = useSignMessage();

  const { connector } = useAccount();
  const [signing, setSigning] = useState<boolean>(false); // disable pop up during social login signing to prevent focus steal

  return (
    <Dialog open={!signing || connector?.type !== "AUTH"}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wallet Signature Required</DialogTitle>
          <DialogDescription>
            To authenticate with your Xnode, you will need to sign a message
            proving ownership of your account. It does not cost any gas to sign
            this message. The message will be saved in your browser to interact
            with this Xnode until you delete it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => {
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setSigning(true);
              signMessageAsync({ message })
                .then(onSigned)
                .finally(() => setSigning(false));
            }}
          >
            Sign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
