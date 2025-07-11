"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useState } from "react";
import HardwareReset from "../deployment/hardware-reset";

export function ResetXnode() {
  const [resetOpen, setResetOpen] = useState<boolean>(false);

  return (
    <Dialog open={resetOpen} onOpenChange={(o) => setResetOpen(o)}>
      <DialogTrigger asChild>
        <Button>Reset</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Xnode</DialogTitle>
        </DialogHeader>
        <HardwareReset onReset={() => setResetOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
