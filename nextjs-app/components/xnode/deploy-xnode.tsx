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

export function DeployXnode() {
  const address = useAddress();
  const [open, setOpen] = useState<boolean>(false);
  const [step, setStep] = useState<
    { type: "select" } | { type: "deploy"; hardware: HardwareProduct }
  >({ type: "select" });

  return (
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
            specs={{ ram: 4_000, storage: 50_000 }}
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
              setStep({ type: "select" });
              setOpen(false);
            }}
            onCancel={() => setStep({ type: "select" })}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
