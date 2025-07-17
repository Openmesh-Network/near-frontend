"use client";

import { useState } from "react";
import { toXnodeAddress } from "@/hooks/useAddress";
import { useSignMessage } from "wagmi";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { xnode } from "@openmesh-network/xnode-manager-sdk";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { recoverMessageAddress } from "viem";
import { useUsageMemory } from "@openmesh-network/xnode-manager-sdk-react";
import { useQuery } from "@tanstack/react-query";

export function TroubleshootXnode() {
  const [domain, setDomain] = useState<string>("");
  const { signMessageAsync } = useSignMessage();

  const [session, setSession] = useState<xnode.utils.Session | undefined>(
    undefined
  );

  const { data: oldManager, error: oldManagerError } = useQuery({
    queryKey: ["oldManager", session?.baseUrl ?? ""],
    enabled: !!session,
    queryFn: async () => {
      if (!session) {
        return undefined;
      }

      return await session.axiosInstance
        .get(`${session.baseUrl}/auth/scopes`, { validateStatus: () => true })
        .then((res) => res.status);
    },
  });

  const { data: memoryUsage, error: memoryError } = useUsageMemory({
    session,
    scope: "host",
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex">
        <Label htmlFor="xnode-domain">IP / Domain</Label>
        <Input
          id="xnode-domain"
          value={domain}
          onChange={(e) =>
            setDomain(e.target.value.replace("https://", "").trim())
          }
        />
      </div>
      <Button
        onClick={() => {
          toast("Please sign login message in your wallet.");
          const insecure = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
          const messageDomain = insecure ? "manager.xnode.local" : domain;
          const messageTimestamp = Math.round(Date.now() / 1000);
          const message = `Xnode Auth authenticate ${messageDomain} at ${messageTimestamp}`;
          signMessageAsync({ message })
            .then(async (signature) => {
              const user = await recoverMessageAddress({
                message,
                signature,
              }).then((address) => toXnodeAddress({ address }));

              const session = await xnode.auth.login({
                baseUrl: insecure
                  ? `/api/xnode-forward/${domain}`
                  : `https://${domain}`,
                user,
                signature,
                timestamp: messageTimestamp.toString(),
              });
              setSession(session);
            })
            .catch((e: any) => {
              console.error(e);
              toast(e?.message ?? JSON.stringify(e));
            });
        }}
        disabled={!domain}
      >
        Authenticate
      </Button>
      <div className="flex flex-wrap gap-2">
        <span>Old Manager Test</span>
        {oldManager !== undefined && <span>{oldManager}</span>}
        {oldManagerError && (
          <span className="text-red-600">{oldManagerError.message}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <span>Memory Usage Test</span>
        {memoryUsage && (
          <span>
            {memoryUsage.used}/{memoryUsage.total}
          </span>
        )}
        {memoryError && (
          <span className="text-red-600">{memoryError.message}</span>
        )}
      </div>
    </div>
  );
}
