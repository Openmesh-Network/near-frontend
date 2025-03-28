"use client";

import { useAddress } from "@/hooks/useAddress";
import { getSummary } from "@/lib/hardware";
import { HardwareProduct } from "@/lib/hardware";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@uidotdev/usehooks";
import axios, { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ComboBox } from "../ui/combobox";
import { Separator } from "../ui/separator";
import { MapPin, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import Link from "next/link";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

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
  const address = useAddress();
  const [paymentPeriod, setPaymentPeriod] = useState<string>("monthly");

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

  async function provisionHardware() {
    if (!address) {
      toast("Wallet not connected");
      return;
    }

    const existingInstance = ""; // Specify and existing instance to redeploy (instead of provision a new server)

    try {
      const cloudInit = `#cloud-config\nruncmd:\n - export XNODE_OWNER="${address}" && curl https://raw.githubusercontent.com/Openmesh-Network/xnode-manager/main/os/install.sh | bash 2>&1 | tee /tmp/xnodeos.log`;

      let ipAddress = "";
      let deploymentAuth = "";
      if (hardware.providerName === "Hivelocity") {
        const productInfo = hardware.id.split("_");
        const productId = Number(productInfo[0]);
        const dataCenter = productInfo[1];
        const machine = await axios
          .get("/api/hivelocity/rewrite", {
            params: {
              path: `v2/${
                hardware.type === "VPS" ? "compute" : "bare-metal-devices"
              }/${existingInstance}`,
              method: existingInstance ? "PUT" : "POST",
              body: JSON.stringify({
                osName: `Ubuntu 24.04${
                  hardware.type === "VPS" ? " (VPS)" : ""
                }`,
                hostname: "xnode.openmesh.network",
                script: cloudInit,
                period: existingInstance
                  ? undefined
                  : paymentPeriod === "yearly"
                  ? "annually"
                  : paymentPeriod,
                locationName: existingInstance ? undefined : dataCenter,
                productId: existingInstance ? undefined : productId,
                forceReload: existingInstance ? true : undefined,
              }),
            },
            headers: {
              "X-API-KEY": debouncedApiKey,
            },
          })
          .then((res) => res.data as { deviceId: number; primaryIp: string });
        ipAddress = machine.primaryIp;
        deploymentAuth = `${
          hardware.type === "VPS" ? "compute" : "bare-metal-devices"
        }/${machine.deviceId}`;

        while (!ipAddress) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const updatedMachine = await axios
            .get("/api/hivelocity/rewrite", {
              params: {
                path: `v2/${deploymentAuth}`,
                method: "GET",
              },
              headers: {
                "X-API-KEY": debouncedApiKey,
              },
            })
            .then((res) => res.data as { primaryIp: string });
          ipAddress = updatedMachine.primaryIp;
        }
      } else if (hardware.providerName === "Vultr") {
        const productInfo = hardware.id.split("_");
        const planId = productInfo[0];
        const regionId = productInfo[1];
        const machine = await axios
          .get("/api/vultr/rewrite", {
            params: {
              path: `v2/${
                hardware.type === "VPS" ? "instances" : "bare-metals"
              }${existingInstance ? `/${existingInstance}` : ""}`, // Vultr API does not like trailing slashes
              method: existingInstance ? "PATCH" : "POST",
              body: JSON.stringify({
                region: existingInstance ? undefined : regionId,
                plan: existingInstance ? undefined : planId,
                os_id: 2284, // {"id":2284,"name":"Ubuntu 24.04 LTS x64","arch":"x64","family":"ubuntu"}
                user_data: Buffer.from(cloudInit).toString("base64"),
                hostname: "xnode.openmesh.network",
                label: "Xnode",
              }),
            },
            headers: {
              Authorization: `Bearer ${debouncedApiKey}`,
            },
          })
          .then(
            (res) =>
              (hardware.type === "VPS"
                ? res.data.instance
                : res.data.bare_metal) as { id: number; main_ip: string }
          );
        ipAddress = machine.main_ip;
        deploymentAuth = `${
          hardware.type === "VPS" ? "instances" : "bare-metals"
        }/${machine.id}`;

        while (ipAddress === "0.0.0.0") {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const updatedMachine = await axios
            .get("/api/vultr/rewrite", {
              params: {
                path: `v2/${deploymentAuth}`,
                method: "GET",
              },
              headers: {
                Authorization: `Bearer ${debouncedApiKey}`,
              },
            })
            .then(
              (res) =>
                (hardware.type === "VPS"
                  ? res.data.instance
                  : res.data.bare_metal) as { id: number; main_ip: string }
            );
          ipAddress = updatedMachine.main_ip;
        }
      }

      onDeployed({
        ipAddress,
        deploymentAuth: `${hardware.providerName}::${deploymentAuth}`,
        owner: address,
      });
      setStep("summary");
    } catch (err: any) {
      let errorMessage: string = "An unknown error has occurred.";
      if (err instanceof AxiosError) {
        if (err.response?.data?.error) {
          if (typeof err.response.data.error.message === "string") {
            errorMessage = err.response.data.error.message;
          } else if (typeof err.response.data.error.description === "string") {
            errorMessage = err.response.data.error.description;
          } else if (typeof err.response.data.error.error === "string") {
            errorMessage = err.response.data.error.error;
          } else if (
            err.response.data.error.at &&
            typeof err.response.data.error.at(0) === "string"
          ) {
            errorMessage = err.response.data.error.at(0);
          }
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      toast("Error", {
        description: errorMessage,
        style: { backgroundColor: "red" },
      });
    }
  }

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
            <div className="mt-2">
              <span className="text-muted-foreground">{summary}</span>
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
              provisionHardware();
            }
          }}
          disabled={step === "auth" && !validApiKey}
        >
          {step === "summary" ? "Next" : step === "auth" ? "Rent Server" : ""}
        </Button>
      </div>
    </div>
  );
}
