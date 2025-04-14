"use client";

import { AdditionalStorage, getSummary } from "@/lib/hardware";
import { HardwareProduct } from "@/lib/hardware";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@uidotdev/usehooks";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { ComboBox } from "../ui/combobox";
import { Separator } from "../ui/separator";
import { MapPin, TriangleAlert } from "lucide-react";
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

export default function HardwareDeployer({
  hardware,
  onDeployed,
  onCancel,
}: {
  hardware: HardwareProduct;
  onDeployed: (machine: {
    ipAddress: string;
    deploymentAuth: string;
    owner: string;
  }) => void;
  onCancel: () => void;
}) {
  const [paymentPeriod, setPaymentPeriod] = useState<string>("monthly");
  const [extraStorage, setExtraStorage] = useState<number>(0);

  const defaultExtraStorage: AdditionalStorage[] = [
    { price: { monthly: 0 }, size: 0 },
  ];
  const { data: availableExtraStorage } = useQuery({
    initialData: defaultExtraStorage,
    queryKey: ["extraStorage", hardware.providerName],
    queryFn: async () => {
      return defaultExtraStorage.concat(
        await fetch(`/api/${hardware.providerName.toLowerCase()}/storage`)
          .then((res) => res.json())
          .then((data) => data as AdditionalStorage[])
          .catch(() => [])
      );
    },
  });

  useEffect(() => {
    if (!hardware.price[paymentPeriod]) {
      // Unsupported payment period, reset to default
      setPaymentPeriod("monthly");
    }
  }, [paymentPeriod, hardware]);

  const summary = useMemo(() => {
    return getSummary({ hardware });
  }, [hardware]);

  const [step, setStep] = useState<"summary" | "auth">("summary");

  const address = useAddress();
  const { provisioning, provisionHardware } = useProvision();

  const [apiKey, setApiKey] = useState<string>("");
  const debouncedApiKey = useDebounce(apiKey, 500);
  const { data: validApiKey } = useQuery({
    queryKey: ["apiKey", debouncedApiKey, hardware.providerName],
    queryFn: async () => {
      if (!debouncedApiKey) {
        return undefined;
      }

      try {
        if (hardware.providerName === "Hivelocity") {
          await axios.get("/api/hivelocity/rewrite", {
            params: {
              path: "v2/profile/",
              method: "GET",
            },
            headers: {
              "X-API-KEY": debouncedApiKey,
            },
          });
        } else if (hardware.providerName === "Vultr") {
          await axios.get("/api/vultr/rewrite", {
            params: {
              path: "v2/users",
              method: "GET",
            },
            headers: {
              Authorization: `Bearer ${debouncedApiKey}`,
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
      {step === "summary" && (
        <div className="flex flex-col gap-1">
          {hardware.ram.capacity <= 1 && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Warning: Low Spec Machine</AlertTitle>
              <AlertDescription>
                Processes might take longer than expected due to the low specs
                of this machine. Please upgrade to a larger machine for a better
                experience.
              </AlertDescription>
            </Alert>
          )}
          <div>
            <div className="flex gap-3 place-items-center">
              <span>{hardware.providerName}</span>
              <span className="text-2xl font-bold">{hardware.productName}</span>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {hardware.location}
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-muted-foreground">{summary}</span>
              {false && availableExtraStorage.length > 1 && (
                <div className="flex gap-3">
                  <Label>Add Storage</Label>
                  <Select
                    value={extraStorage.toString()}
                    onValueChange={(e) => setExtraStorage(parseInt(e))}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableExtraStorage.map((storage, i) => (
                        <SelectItem key={i} value={storage.size.toString()}>
                          {storage.size} GB (+${storage.price.monthly}/mo)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Separator className="my-4" />
            <div className="flex gap-4 place-items-center">
              <span className="text-sm font-medium flex place-items-center gap-1">
                Estimated{" "}
                <ComboBox
                  items={Object.keys(hardware.price).map((p) => {
                    return { label: p, value: p };
                  })}
                  value={paymentPeriod}
                  onChange={(p) => setPaymentPeriod(p ?? "monthly")}
                />{" "}
                price
              </span>
              <span className="mt-1 text-4xl font-bold text-primary">
                ${hardware.price[paymentPeriod]}
                <span className="text-xl">
                  /
                  {
                    paymentPeriod.substring(
                      0,
                      paymentPeriod.length - 2
                    ) /* remove ly */
                  }
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
      {step === "auth" && (
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-bold">
            Link {hardware.providerName} Account
          </span>
          <span className="text-muted-foreground">
            To setup your server, you first need to connect to the provider
            through an API key. This allows Xnode Studio to rent the chosen
            machine in your account. Pressing the rent button will place an
            order in your provider account. Please be aware that every time you
            press this button a new machine will be ordered.
          </span>
          <span className="mt-2">
            {`${hardware.productName} | $${hardware.price[paymentPeriod]}/${
              paymentPeriod.substring(
                0,
                paymentPeriod.length - 2
              ) /* remove ly */
            }`}
          </span>
          <div className="mt-2 flex flex-col rounded border p-4">
            <span className="text-lg font-semibold">
              {hardware.providerName}
            </span>
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
                  hardware.providerName === "Hivelocity"
                    ? "https://developers.hivelocity.net/docs/api-keys"
                    : hardware.providerName === "Vultr"
                    ? "https://docs.vultr.com/create-a-limited-subuser-profile-with-api-access-at-vultr"
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
      )}
      <div className="flex gap-3 place-content-end">
        <Button
          size="lg"
          className="h-10 min-w-40"
          onClick={() => {
            if (step === "summary") {
              onCancel();
            }
            if (step === "auth") {
              setStep("summary");
            }
          }}
          disabled={provisioning}
        >
          Back
        </Button>
        <Button
          size="lg"
          className="h-10 min-w-40"
          onClick={() => {
            if (step === "summary") {
              setStep("auth");
            }
            if (step === "auth") {
              if (!address) {
                toast("Error", {
                  description: "Wallet not connected.",
                  style: { backgroundColor: "red" },
                });
                return;
              }

              provisionHardware({
                hardware,
                paymentPeriod,
                debouncedApiKey,
                extraStorage,
                owner: address,
              }).then((res) => {
                if (res.type === "success") {
                  onDeployed({
                    ipAddress: res.ipAddress,
                    deploymentAuth: res.deploymentAuth,
                    owner: address,
                  });
                  setStep("summary");
                } else {
                  toast("Error", {
                    description: res.errorMessage,
                    style: { backgroundColor: "red" },
                  });
                }
              });
            }
          }}
          disabled={(step === "auth" && !validApiKey) || provisioning}
        >
          {step === "summary" ? "Next" : step === "auth" ? "Rent Server" : ""}
        </Button>
      </div>
    </div>
  );
}
