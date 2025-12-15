"use client";

import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@uidotdev/usehooks";
import axios from "axios";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import Link from "next/link";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useProvision } from "@/hooks/useProvision";
import { toast } from "sonner";
import { useAddress } from "@/hooks/useAddress";
import { Xnode } from "../context/settings";

export default function HardwareReset({
  xnode,
  onReset,
}: {
  xnode?: Xnode;
  onReset: () => void;
}) {
  const address = useAddress();
  const { provisioning, resetHardware } = useProvision();
  const [provider, setProvider] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [owner, setOwner] = useState<string>("");

  useEffect(() => {
    if (address) {
      setOwner(address);
    }
  }, [address, setOwner]);

  useEffect(() => {
    if (!xnode) {
      return;
    }

    const deploymentAuth = xnode.deploymentAuth;
    if (deploymentAuth) {
      const split = deploymentAuth.split("::");
      const provider = split[0];

      const split2 = split[1].split("/");
      const type = split2[0];
      const deviceId = split2[1];

      setProvider(provider);
      setType(type);
      setDeviceId(deviceId);
    }
  }, [xnode, setProvider, setType, setDeviceId]);

  const [apiKey, setApiKey] = useState<string>("");
  const debouncedApiKey = useDebounce(apiKey, 500);
  const { data: validApiKey } = useQuery({
    queryKey: ["apiKey", debouncedApiKey, provider],
    queryFn: async () => {
      if (!debouncedApiKey) {
        return undefined;
      }

      try {
        if (provider === "Hivelocity") {
          await axios.get("/api/hivelocity/rewrite", {
            params: {
              path: "v2/profile/",
              method: "GET",
            },
            headers: {
              "X-API-KEY": debouncedApiKey,
            },
          });
        }
        return true;
      } catch (err) {
        return false;
      }
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-3">
        <Alert>
          <TriangleAlert />
          <AlertTitle>Warning: Destructive Action</AlertTitle>
          <AlertDescription>
            This will delete all apps and data stored on this Xnode. This action
            cannot be reversed.
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2">
          <div>
            <Label htmlFor="provider">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="provider" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Hivelocity"].map((p, i) => (
                  <SelectItem key={i} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {provider === "Hivelocity" ? (
                  <>
                    <SelectItem value="compute">VPS</SelectItem>
                    <SelectItem value="bare-metal-devices">
                      Bare Metal
                    </SelectItem>
                  </>
                ) : (
                  <></>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="deviceId">Device ID</Label>
            <Input
              id="deviceId"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="owner">Owner</Label>
            <Input
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>
          <div className="mt-2 space-y-0.5">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              name="apiKey"
              value={apiKey}
              className={
                validApiKey === false
                  ? "border-red-600"
                  : validApiKey === true
                  ? "border-green-500"
                  : ""
              }
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
            />
          </div>
          {validApiKey === false && (
            <span className="text-sm text-red-700">Invalid API key</span>
          )}
          <span className="mt-1 text-sm text-muted-foreground">
            Don&apos;t have an API key yet?{" "}
            <Link
              href={
                provider === "Hivelocity"
                  ? "https://developers.hivelocity.net/docs/api-keys"
                  : provider === "Vultr"
                  ? "https://docs.vultr.com/create-a-limited-subuser-profile-with-api-access-at-vultr"
                  : provider === "Hetzner"
                  ? "https://docs.hetzner.com/cloud/api/getting-started/generating-api-token/"
                  : provider === "CherryServers"
                  ? "https://portal.cherryservers.com/settings/api-keys"
                  : "#"
              }
              target="_blank"
              className="underline underline-offset-2"
            >
              Get one here.
            </Link>
          </span>
        </div>
      </div>
      <div className="flex gap-3 place-content-end">
        <Button
          size="lg"
          className="h-10 min-w-40"
          onClick={() => {
            resetHardware({
              deploymentAuth: `${provider}::${type}/${deviceId}`,
              debouncedApiKey,
              owner,
            }).then((res) => {
              if (res.type === "success") {
                onReset();
              } else {
                toast("Error", {
                  description: res.errorMessage,
                  style: { backgroundColor: "red" },
                });
              }
            });
          }}
          disabled={
            !provider ||
            !type ||
            !deviceId ||
            !owner ||
            !validApiKey ||
            provisioning
          }
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
