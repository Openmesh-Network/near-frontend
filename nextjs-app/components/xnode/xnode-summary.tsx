"use client";

import { useSetSettings, useSettings, Xnode } from "../context/settings";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  AlertTriangle,
  CheckCircle,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Bar } from "../bar";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  useAuthLogin,
  useUsageCpu,
  useUsageDisk,
  useUsageMemory,
} from "@openmesh-network/xnode-manager-sdk-react";
import { usePrepareXnode } from "@/hooks/useXnode";
import { getBaseUrl } from "@/lib/xnode";
import { Button } from "../ui/button";

export function XnodeSummary({ xnode }: { xnode: Xnode }) {
  const { data: session } = useAuthLogin({
    baseUrl: getBaseUrl({ xnode }),
    ...xnode.loginArgs,
  });

  const settings = useSettings();
  const setSettings = useSetSettings();

  const { data: cpu } = useUsageCpu({
    session,
    scope: "host",
    overrides: { refetchInterval: 10_000 },
  });
  const { data: memory } = useUsageMemory({
    session,
    scope: "host",
    overrides: { refetchInterval: 10_000 },
  });
  const { data: disk } = useUsageDisk({
    session,
    scope: "host",
    overrides: { refetchInterval: 10_000 },
  });
  const { ready } = usePrepareXnode({ session });

  const [connectingDots, setConnectingDots] = useState(1);
  useEffect(() => {
    setTimeout(() => {
      setConnectingDots(Math.max((connectingDots + 1) % 4, 0));
    }, 500);
  }, [connectingDots, setConnectingDots]);

  return (
    <Card className="gap-0 bg-[#0c2246d6] text-white">
      <CardHeader>
        <CardTitle className="text-xl">
          <div className="flex place-items-center">
            <span className="break-all">{xnode.secure ?? xnode.insecure}</span>
            <div className="grow" />
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                setSettings({
                  ...settings,
                  xnodes: settings.xnodes.filter((x) => x !== xnode),
                });
              }}
            >
              <Trash2 className="text-red-600" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {!session && (
            <>
              <div className="flex gap-2">
                <svg
                  className="text-gray-300 animate-spin"
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                >
                  <path
                    d="M32 3C35.8083 3 39.5794 3.75011 43.0978 5.20749C46.6163 6.66488 49.8132 8.80101 52.5061 11.4939C55.199 14.1868 57.3351 17.3837 58.7925 20.9022C60.2499 24.4206 61 28.1917 61 32C61 35.8083 60.2499 39.5794 58.7925 43.0978C57.3351 46.6163 55.199 49.8132 52.5061 52.5061C49.8132 55.199 46.6163 57.3351 43.0978 58.7925C39.5794 60.2499 35.8083 61 32 61C28.1917 61 24.4206 60.2499 20.9022 58.7925C17.3837 57.3351 14.1868 55.199 11.4939 52.5061C8.801 49.8132 6.66487 46.6163 5.20749 43.0978C3.7501 39.5794 3 35.8083 3 32C3 28.1917 3.75011 24.4206 5.2075 20.9022C6.66489 17.3837 8.80101 14.1868 11.4939 11.4939C14.1868 8.80099 17.3838 6.66487 20.9022 5.20749C24.4206 3.7501 28.1917 3 32 3L32 3Z"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></path>
                  <path
                    d="M32 3C36.5778 3 41.0906 4.08374 45.1692 6.16256C49.2477 8.24138 52.7762 11.2562 55.466 14.9605C58.1558 18.6647 59.9304 22.9531 60.6448 27.4748C61.3591 31.9965 60.9928 36.6232 59.5759 40.9762"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-900"
                  ></path>
                </svg>
                <span>Connecting{".".repeat(connectingDots)}</span>
              </div>
              <Alert>
                <AlertTriangle />
                <AlertTitle>This can take a while</AlertTitle>
                <AlertDescription>
                  If you just deployed this machine, provisioning can take a
                  long time (depending on your provider). Installation of
                  XnodeOS on a new machine takes ~10 minutes on average.
                </AlertDescription>
              </Alert>
            </>
          )}
          {cpu && (
            <div className="flex flex-col gap-1">
              <span>CPU Usage</span>
              <div className="flex flex-wrap gap-1">
                {cpu.map((c, i) => (
                  <TooltipProvider key={i}>
                    <Tooltip>
                      <TooltipTrigger>
                        <div
                          className="size-8 aspect-square transition"
                          style={{
                            backgroundColor: `rgba(${Math.round(
                              (255 * Math.min(50, c.used)) / 50
                            )},${
                              255 -
                              Math.round((255 * Math.max(0, c.used - 50)) / 50)
                            },0,1)`,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <span className="text-sm">
                          CPU {c.name.replace("cpu", "")}: {c.used.toFixed(2)}%
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          )}
          {memory && (
            <div>
              <span>Memory Usage</span>
              <Bar
                used={memory.used}
                total={memory.total}
                label="GB"
                divider={1024 * 1024 * 1024}
              />
            </div>
          )}
          {disk && (
            <div className="flex flex-col gap-1">
              <span>Disk Usage</span>
              {disk.map((d, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-sm">
                    Disk {d.mount_point.replace("/mnt/disk", "")}
                  </span>
                  <Bar
                    used={d.used}
                    total={d.total}
                    label="GB"
                    divider={1024 * 1024 * 1024}
                  />
                </div>
              ))}
            </div>
          )}
          {ready !== undefined &&
            (ready ? (
              <div className="flex items-center gap-1">
                <CheckCircle className="text-green-600" />
                <span className="text-green-600">Fully Operational.</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <TriangleAlert className="text-red-600" />
                <span className="text-red-600">Attention Required.</span>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
