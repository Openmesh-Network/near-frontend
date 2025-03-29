"use client";

import { useSetSettings, useSettings } from "../context/settings";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { AlertTriangle, CheckCircle, TriangleAlert } from "lucide-react";
import {
  useCpu,
  useDisk,
  useLogs,
  useMemory,
  usePrepareXnode,
  useSession,
} from "@/hooks/useXnode";
import { useEffect, useMemo, useRef, useState } from "react";
import { UsageChart, UsageHistory } from "../charts/usage-chart";
import { Section } from "../text";
import { Button } from "../ui/button";
import { Bar } from "../bar";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { useNear } from "../near-provider";
import { useQuery } from "@tanstack/react-query";
import { connect, keyStores } from "near-api-js";
import { AccountView, CodeResult } from "near-api-js/lib/providers/provider";
import { ScrollArea } from "../ui/scroll-area";
import { formatUnits, parseUnits } from "viem";
import { Ansi } from "../ansi";
import axios from "axios";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { useRouter } from "next/navigation";

export function XnodeDetailed({ domain }: { domain?: string }) {
  const settings = useSettings();
  const setSettings = useSetSettings();
  const xnode = useMemo(
    () => settings.xnodes.find((x) => x.domain === domain),
    [settings.xnodes]
  );

  const [busy, setBusy] = useState<boolean>(false);

  const [xnodeDomain, setXnodeDomain] = useState<string>("");
  const [acmeEmail, setAcmeEmail] = useState<string>("");
  const { push } = useRouter();

  const { data: session } = useSession({ xnode });
  const { data: cpu } = useCpu({ session });
  const { data: memory } = useMemory({ session });
  const { data: disk } = useDisk({ session });
  const {
    osUpdateNeeded,
    osUpdate,
    enableHttps,
    osPatchNeeded,
    osPatch,
    xnodeManagerUpdateNeeded,
    xnodeManagerUpdate,
    containerId,
    nearContainerMissing,
    createNearContainer,
    existingNearContainerSettings,
    updateNearContainerSettings,
    nearContainerUpdateNeeded,
    updateNearContainer,
    validatorPublicKey,
    pingerAccountId,
  } = usePrepareXnode({ session });
  const { data: validatorLogs } = useLogs({
    session,
    containerId,
    process: "near-validator.service",
  });
  const logsScrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollLogToBottom = useMemo(() => {
    return () => {
      const scrollArea = logsScrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    };
  }, [logsScrollAreaRef]);

  useEffect(() => {
    scrollLogToBottom();
  }, [validatorLogs, scrollLogToBottom]);

  const [cpuHistory, setCpuHistory] = useState<UsageHistory[]>([]);
  useEffect(() => {
    if (!cpu) {
      return;
    }

    const avgUsage = cpu.reduce((prev, cur) => prev + cur.used, 0) / cpu.length;
    setCpuHistory([
      ...cpuHistory.slice(-99),
      { date: Date.now(), usage: avgUsage },
    ]);
  }, [cpu]);

  const [memoryHistory, setMemoryHistory] = useState<UsageHistory[]>([]);
  useEffect(() => {
    if (!memory) {
      return;
    }

    const usage = (100 * memory.used) / memory.total;
    setMemoryHistory([
      ...memoryHistory.slice(-99),
      { date: Date.now(), usage },
    ]);
  }, [memory]);

  const [poolId, setPoolId] = useState("");
  const [poolVersion, setPoolVersion] = useState("pool");
  const [pinger, setPinger] = useState(false);

  const [rewardFee, setRewardFee] = useState(5);

  useEffect(() => {
    if (!existingNearContainerSettings) {
      return;
    }

    if (existingNearContainerSettings.poolId) {
      setPoolId(existingNearContainerSettings.poolId);
    }
    if (existingNearContainerSettings.poolVersion) {
      setPoolVersion(existingNearContainerSettings.poolVersion);
    }
    if (existingNearContainerSettings.pinger) {
      setPinger(existingNearContainerSettings.pinger);
    }
  }, [existingNearContainerSettings]);

  const { data: near } = useQuery({
    queryKey: ["near"],
    queryFn: async () => {
      const connectionConfig = {
        networkId: "mainnet",
        keyStore: new keyStores.BrowserLocalStorageKeyStore(),
        nodeUrl: "https://rpc.mainnet.near.org",
      };
      return await connect(connectionConfig);
    },
  });

  const { accountId, modal, selector, loading } = useNear();
  const fullPoolId = `${poolId}.${poolVersion}.near`;
  const { data: poolDeployed } = useQuery({
    queryKey: ["poolDeployed", near ?? "", fullPoolId],
    enabled: !!near && !fullPoolId.startsWith("."),
    queryFn: async () => {
      if (!near) {
        return undefined;
      }

      try {
        await near.connection.provider.query({
          request_type: "view_account",
          finality: "final",
          account_id: fullPoolId,
        });
        return true;
      } catch {
        return false;
      }
    },
  });
  const { data: connectedAccountBalance } = useQuery({
    queryKey: ["connectedAccountBalance", near ?? "", accountId ?? ""],
    enabled: !!near && !!accountId,
    queryFn: async () => {
      if (!near || !accountId) {
        return undefined;
      }

      try {
        const account = await near.connection.provider.query<AccountView>({
          request_type: "view_account",
          finality: "final",
          account_id: accountId,
        });
        return parseFloat(formatUnits(BigInt(account.amount), 24));
      } catch {
        return 0;
      }
    },
    refetchInterval: 10 * 1000, // 10s
  });
  const requiredAccountBalance = useMemo(() => {
    let poolCost = 0;
    const gasFee = 0.5;

    if (poolVersion === "pool") {
      poolCost = 4;
    }
    if (poolVersion === "poolv1") {
      poolCost = 30;
    }

    return { poolCost, gasFee };
  }, [poolVersion]);
  const { data: deployedPoolSettings, refetch: refetchDeployedPoolSettings } =
    useQuery({
      queryKey: [
        "deployedPoolSettings",
        near ?? "",
        poolDeployed ?? false,
        fullPoolId,
      ],
      enabled: !!near && poolDeployed,
      queryFn: async () => {
        if (!near) {
          return undefined;
        }

        const responses = await Promise.all(
          ["get_owner_id", "get_staking_key", "get_reward_fee_fraction"].map(
            (method_name) =>
              near.connection.provider.query<CodeResult>({
                request_type: "call_function",
                finality: "final",
                account_id: fullPoolId,
                method_name,
                args_base64: "",
              })
          )
        );
        return {
          owner_id: String.fromCharCode(...responses[0].result).replaceAll(
            '"',
            ""
          ),
          stake_public_key: String.fromCharCode(
            ...responses[1].result
          ).replaceAll('"', ""),
          reward_fee_fraction: JSON.parse(
            String.fromCharCode(...responses[2].result)
          ),
        };
      },
    });
  const { data: totalPoolStake, refetch: refetchTotalPoolStake } = useQuery({
    queryKey: ["totalPoolStake", near ?? "", poolDeployed ?? false, fullPoolId],
    enabled: !!near && poolDeployed,
    queryFn: async () => {
      if (!near) {
        return undefined;
      }

      const response = await near.connection.provider.query<CodeResult>({
        request_type: "call_function",
        finality: "final",
        account_id: fullPoolId,
        method_name: "get_total_staked_balance",
        args_base64: "",
      });
      return parseFloat(
        formatUnits(
          BigInt(String.fromCharCode(...response.result).replaceAll('"', "")),
          24
        )
      );
    },
  });

  const { data: pingerAccountBalance } = useQuery({
    queryKey: [
      "pingerAccountBalance",
      near ?? "",
      existingNearContainerSettings?.pinger ?? false,
      pingerAccountId ?? "",
    ],
    enabled:
      !!near && existingNearContainerSettings?.pinger && !!pingerAccountId,
    queryFn: async () => {
      if (
        !near ||
        existingNearContainerSettings?.pinger !== true ||
        !pingerAccountId
      ) {
        return undefined;
      }

      try {
        const account = await near.connection.provider.query<AccountView>({
          request_type: "view_account",
          finality: "final",
          account_id: pingerAccountId,
        });
        return parseFloat(formatUnits(BigInt(account.amount), 24));
      } catch {
        return 0;
      }
    },
  });
  const [pingerTopUp, setPingerTopUp] = useState<string>("0");

  const { data: validatorStats } = useQuery({
    queryKey: ["validatorStats", near ?? ""],
    enabled: !!near,
    queryFn: async () => {
      if (!near) {
        return undefined;
      }

      const stats = await axios
        .post(
          "https://rpc.mainnet.near.org/",
          {
            jsonrpc: "2.0",
            method: "validators",
            id: "dontcare",
            params: [null],
          },
          {
            responseType: "json",
          }
        )
        .then((res) => res.data)
        .then(
          (data) =>
            data.result as {
              current_validators: {
                account_id: string;
                num_expected_blocks: number;
                num_expected_chunks: number;
                num_expected_endorsements: number;
                num_produced_blocks: number;
                num_produced_chunks: number;
                num_produced_endorsements: number;
              }[];
            }
        );
      return stats;
    },
  });
  const myValidatorStats = useMemo(() => {
    if (!validatorStats) {
      return undefined;
    }

    return validatorStats.current_validators.find(
      (v) => v.account_id === fullPoolId
    );
  }, [fullPoolId, validatorStats]);
  const [stakeTopUp, setStakeTopUp] = useState<string>("0");

  return (
    <div className="mt-2 flex flex-col gap-5">
      {xnode?.insecure && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>WARNING: Using unencrypted communication!</AlertTitle>
          <AlertDescription>
            <span>
              You should enable HTTPS before accessing any confidential
              information on your Xnode (such as validator private keys). Setup
              an A record pointing to this Xnode IP address ({domain}), it can
              be under any (sub)domain. Only press the update button once the
              record has been set and has propagated, otherwise you might become
              locked out of your Xnode. Email is required and cannot be from a
              blacklisted domain (e.g. @example.com).
            </span>
            <div className="pt-1 flex gap-2 flex-wrap">
              <div className="flex gap-2">
                <Label htmlFor="xnode-domain">Domain</Label>
                <Input
                  id="xnode-domain"
                  className="min-w-40"
                  value={xnodeDomain}
                  onChange={(e) => setXnodeDomain(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Label htmlFor="xnode-domain">ACME Email</Label>
                <Input
                  id="acme-email"
                  className="min-w-40"
                  value={acmeEmail}
                  onChange={(e) => setAcmeEmail(e.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  setBusy(true);
                  enableHttps({
                    domain: xnodeDomain,
                    acme_email: acmeEmail,
                  })
                    .then(() => {
                      setSettings({
                        ...settings,
                        xnodes: settings.xnodes.map((x) => {
                          if (x === xnode) {
                            return {
                              ...xnode,
                              domain: xnodeDomain,
                              insecure: false,
                            };
                          }

                          return x;
                        }),
                      });
                      push(`/xnode/${xnodeDomain}`);
                    })
                    .finally(() => setBusy(false));
                }}
                disabled={busy}
              >
                Update
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <Section title={`Monitor Xnode ${domain}`}>
        <div className="grid grid-cols-3 gap-2 max-lg:grid-cols-2 max-md:grid-cols-1">
          {cpuHistory.length > 0 && (
            <UsageChart title="CPU Usage" label="CPU%" data={cpuHistory} />
          )}
          {memoryHistory.length > 0 && (
            <UsageChart
              title="Memory Usage"
              label="MEM%"
              data={memoryHistory}
            />
          )}
          {disk && (
            <Card>
              <CardHeader>
                <CardTitle>Disk Usage</CardTitle>
              </CardHeader>
              <CardContent>
                {disk.map((d, i) => (
                  <div key={i} className="flex flex-col">
                    <span className="text-sm">
                      Disk {d.name.replace("/mnt/disk", "")}
                    </span>
                    <Bar
                      used={d.used}
                      total={d.total}
                      label="GB"
                      divider={1024 * 1024 * 1024}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </Section>
      <Section title="Configure Pool">
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <Label htmlFor="poolId">Pool ID</Label>
            <Input
              id="poolId"
              className="max-w-40"
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            <Label htmlFor="poolVersion">Pool Version</Label>
            <Select
              value={poolVersion}
              onValueChange={(e) => setPoolVersion(e)}
            >
              <SelectTrigger id="poolVersion" className="max-w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pool">Upgradeable (.pool.near)</SelectItem>
                <SelectItem value="poolv1">V1 (.poolv1.near)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1">
            <Label htmlFor="pinger">Pinger</Label>
            <Checkbox
              id="pinger"
              checked={pinger}
              onCheckedChange={(e) => {
                if (e !== "indeterminate") {
                  setPinger(e);
                }
              }}
            />
          </div>
          <div className="flex gap-1">
            <Label htmlFor="rewardFee">Reward Fee</Label>
            <Input
              id="rewardFee"
              className="max-w-18"
              type="number"
              step={1}
              min={0}
              max={100}
              value={rewardFee.toString()}
              onChange={(e) => setRewardFee(parseInt(e.target.value))}
            />
          </div>
        </div>
      </Section>
      <Section title="Manage Xnode">
        <div className="flex flex-col gap-3">
          {osUpdateNeeded !== undefined &&
            (osUpdateNeeded ? (
              <div className="flex items-center gap-1">
                <TriangleAlert className="text-red-600" />
                <span className="text-red-600">OS not up to date.</span>
                <Button
                  onClick={() => {
                    setBusy(true);
                    osUpdate().then(() => setBusy(false));
                  }}
                  disabled={busy}
                >
                  Update
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <CheckCircle className="text-green-600" />
                <span className="text-green-600">OS up to date.</span>
              </div>
            ))}
          {osPatchNeeded !== undefined &&
            (osPatchNeeded ? (
              <div className="flex items-center gap-1">
                <TriangleAlert className="text-red-600" />
                <span className="text-red-600">OS patch not applied.</span>
                <Button
                  onClick={() => {
                    setBusy(true);
                    osPatch().finally(() => setBusy(false));
                  }}
                  disabled={busy}
                >
                  Patch
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <CheckCircle className="text-green-600" />
                <span className="text-green-600">OS patched.</span>
              </div>
            ))}
          {nearContainerMissing !== undefined &&
            (nearContainerMissing ? (
              <div className="flex items-center gap-1">
                <TriangleAlert className="text-red-600" />
                <span className="text-red-600">NEAR app not deployed.</span>
                <Button
                  onClick={() => {
                    setBusy(true);
                    createNearContainer({
                      poolId,
                      poolVersion,
                      pinger,
                    }).finally(() => setBusy(false));
                  }}
                  disabled={busy}
                >
                  Deploy
                </Button>
              </div>
            ) : existingNearContainerSettings?.poolId !== poolId ||
              existingNearContainerSettings?.poolVersion != poolVersion ||
              existingNearContainerSettings?.pinger != pinger ? (
              <div className="flex items-center gap-1">
                <TriangleAlert className="text-red-600" />
                <span className="text-red-600">
                  NEAR app settings have changed.
                </span>
                <Button
                  onClick={() => {
                    setBusy(true);
                    updateNearContainerSettings({
                      poolId,
                      poolVersion,
                      pinger,
                    }).finally(() => setBusy(false));
                  }}
                  disabled={busy}
                >
                  Update
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <CheckCircle className="text-green-600" />
                <span className="text-green-600">NEAR app deployed.</span>
              </div>
            ))}
          {xnodeManagerUpdateNeeded !== undefined &&
            (xnodeManagerUpdateNeeded ? (
              <div className="flex items-center gap-1">
                <TriangleAlert className="text-red-600" />
                <span className="text-red-600">
                  Xnode Manager not up to date.
                </span>
                <Button
                  onClick={() => {
                    setBusy(true);
                    xnodeManagerUpdate().finally(() => setBusy(false));
                  }}
                  disabled={busy}
                >
                  Update
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <CheckCircle className="text-green-600" />
                <span className="text-green-600">
                  Xnode Manager up to date.
                </span>
              </div>
            ))}
          {nearContainerUpdateNeeded !== undefined &&
            (nearContainerUpdateNeeded ? (
              <div className="flex items-center gap-1">
                <TriangleAlert className="text-red-600" />
                <span className="text-red-600">NEAR app not up to date.</span>
                <Button
                  onClick={() => {
                    setBusy(true);
                    updateNearContainer().finally(() => setBusy(false));
                  }}
                  disabled={busy}
                >
                  Update
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <CheckCircle className="text-green-600" />
                <span className="text-green-600">NEAR app up to date.</span>
              </div>
            ))}
        </div>
      </Section>
      {!loading && (
        <Section title="Manage Pool">
          <div className="flex flex-col gap-1">
            <div className="text-sm">
              {accountId ? (
                <div className="overflow-x-auto">
                  <Button
                    className="px-2 py-0.5 h-auto"
                    onClick={() =>
                      selector
                        .wallet()
                        .then((w) => w.signOut())
                        .catch(console.error)
                    }
                  >
                    Disconnect <span className="break-words">{accountId}</span>
                    {connectedAccountBalance
                      ? ` (${connectedAccountBalance.toFixed(3)} NEAR)`
                      : ""}
                  </Button>
                </div>
              ) : (
                <div>
                  <Button
                    className="px-2 py-0.5 h-auto"
                    onClick={() => modal.show()}
                  >
                    Connect NEAR wallet
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {poolDeployed !== undefined &&
                validatorPublicKey !== undefined &&
                (!poolDeployed ? (
                  connectedAccountBalance !== undefined &&
                  connectedAccountBalance <
                    requiredAccountBalance.poolCost +
                      requiredAccountBalance.gasFee ? (
                    <div className="flex items-center gap-1">
                      <TriangleAlert className="text-red-600" />
                      <span className="text-red-600">
                        Pool not deployed. Connected account does not have{" "}
                        {requiredAccountBalance.poolCost} NEAR (+ {"<"}
                        {requiredAccountBalance.gasFee} in gas fees) required to
                        deploy one.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <TriangleAlert className="text-red-600" />
                      <span className="text-red-600">Pool not deployed.</span>
                      <Button
                        onClick={() => {
                          setBusy(true);
                          selector
                            .wallet()
                            .then((w) =>
                              w.signAndSendTransaction({
                                receiverId: `${poolVersion}.near`,
                                actions: [
                                  {
                                    type: "FunctionCall",
                                    params: {
                                      methodName: "create_staking_pool",
                                      args: {
                                        staking_pool_id: poolId,
                                        owner_id: accountId,
                                        stake_public_key: validatorPublicKey,
                                        reward_fee_fraction: {
                                          numerator: rewardFee,
                                          denominator: 100,
                                        },
                                        code_hash:
                                          poolVersion === "pool"
                                            ? "AjD4YJaXgpiRdiArqnzyDi7Bkr1gJms9Z2w7Ev5esTKB"
                                            : undefined,
                                      },
                                      deposit: parseUnits(
                                        requiredAccountBalance.poolCost.toString(),
                                        24
                                      ).toString(),
                                      gas: "300000000000000",
                                    },
                                  },
                                ],
                              })
                            )
                            .catch(console.error)
                            .finally(() => setBusy(false));
                        }}
                        disabled={busy}
                      >
                        Deploy
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-1">
                    <CheckCircle className="text-green-600" />
                    <span className="text-green-600">Pool deployed.</span>
                  </div>
                ))}
              {poolDeployed !== undefined &&
                poolDeployed &&
                deployedPoolSettings &&
                (deployedPoolSettings.owner_id === accountId ? (
                  <>
                    {validatorPublicKey &&
                      deployedPoolSettings.stake_public_key !==
                        validatorPublicKey && (
                        <div className="flex items-center gap-1">
                          <TriangleAlert className="text-red-600" />
                          <span className="text-red-600">
                            Pool validator public key mismatch.
                          </span>
                          <Button
                            onClick={() => {
                              setBusy(true);
                              selector
                                .wallet()
                                .then((w) =>
                                  w.signAndSendTransaction({
                                    receiverId: fullPoolId,
                                    actions: [
                                      {
                                        type: "FunctionCall",
                                        params: {
                                          methodName: "update_staking_key",
                                          args: {
                                            stake_public_key:
                                              validatorPublicKey,
                                          },
                                          deposit: "0",
                                          gas: "300000000000000",
                                        },
                                      },
                                    ],
                                  })
                                )
                                .catch(console.error)
                                .then(() => refetchDeployedPoolSettings())
                                .finally(() => setBusy(false));
                            }}
                            disabled={busy}
                          >
                            Update
                          </Button>
                        </div>
                      )}
                    {(deployedPoolSettings.reward_fee_fraction.numerator !==
                      rewardFee ||
                      deployedPoolSettings.reward_fee_fraction.denominator !==
                        100) && (
                      <div className="flex items-center gap-1">
                        <TriangleAlert className="text-red-600" />
                        <span className="text-red-600">
                          Pool reward fee changed.
                        </span>
                        <Button
                          onClick={() => {
                            setBusy(true);
                            selector
                              .wallet()
                              .then((w) =>
                                w.signAndSendTransaction({
                                  receiverId: fullPoolId,
                                  actions: [
                                    {
                                      type: "FunctionCall",
                                      params: {
                                        methodName:
                                          "update_reward_fee_fraction",
                                        args: {
                                          reward_fee_fraction: {
                                            numerator: rewardFee,
                                            denominator: 100,
                                          },
                                        },
                                        deposit: "0",
                                        gas: "300000000000000",
                                      },
                                    },
                                  ],
                                })
                              )
                              .catch(console.error)
                              .then(() => refetchDeployedPoolSettings())
                              .finally(() => setBusy(false));
                          }}
                          disabled={busy}
                        >
                          Update
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {accountId ? (
                      <div className="flex items-center gap-1">
                        <TriangleAlert className="text-red-600" />
                        <span className="text-red-600">
                          Connected wallet is not the owner of this pool.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <TriangleAlert className="text-red-600" />
                        <span className="text-red-600">
                          No wallet connected.
                        </span>
                      </div>
                    )}
                  </>
                ))}
              {totalPoolStake !== undefined && (
                <span>Total Stake: {totalPoolStake.toFixed(1)} NEAR</span>
              )}
              {!loading && poolDeployed && (
                <div className="flex gap-1 items-center">
                  <Label className="text-base" htmlFor="stake-topup">
                    Add Stake:{" "}
                  </Label>
                  <Input
                    id="stake-topup"
                    className="max-w-20"
                    type="number"
                    value={stakeTopUp}
                    onChange={(e) => setStakeTopUp(e.target.value)}
                  />
                  <Button
                    onClick={() => {
                      setBusy(true);
                      selector
                        .wallet()
                        .then((w) =>
                          w.signAndSendTransaction({
                            receiverId: fullPoolId,
                            actions: [
                              {
                                type: "FunctionCall",
                                params: {
                                  methodName: "deposit_and_stake",
                                  args: {},
                                  deposit: parseUnits(
                                    stakeTopUp,
                                    24
                                  ).toString(),
                                  gas: "300000000000000",
                                },
                              },
                            ],
                          })
                        )
                        .catch(console.error)
                        .then(() => refetchTotalPoolStake())
                        .finally(() => setBusy(false));
                    }}
                    disabled={busy}
                  >
                    Stake
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}
      {existingNearContainerSettings?.pinger && pingerAccountId && (
        <Section title="Pinger">
          <div className="flex flex-col gap-1">
            <span>
              Pinger Account ID:{" "}
              <span className="break-words">{pingerAccountId}</span>
            </span>
            {pingerAccountBalance !== undefined && (
              <span>
                Pinger Balance: {pingerAccountBalance.toFixed(3)} NEAR
              </span>
            )}
            {!loading && (
              <div className="flex gap-1 items-center">
                <Label className="text-base" htmlFor="pinger-topup">
                  Top Up:{" "}
                </Label>
                <Input
                  id="pinger-topup"
                  className="max-w-20"
                  type="number"
                  value={pingerTopUp}
                  onChange={(e) => setPingerTopUp(e.target.value)}
                />
                <Button
                  onClick={() => {
                    setBusy(true);
                    selector
                      .wallet()
                      .then((w) =>
                        w.signAndSendTransaction({
                          receiverId: pingerAccountId,
                          actions: [
                            {
                              type: "Transfer",
                              params: {
                                deposit: parseUnits(pingerTopUp, 24).toString(),
                              },
                            },
                          ],
                        })
                      )
                      .catch(console.error)
                      .finally(() => setBusy(false));
                  }}
                  disabled={busy}
                >
                  Deposit
                </Button>
              </div>
            )}
            {/* Last ping ? */}
          </div>
        </Section>
      )}
      {myValidatorStats && (
        <Section title="Validator Performance">
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardHeader className="flex gap-2 items-center">
                <CardTitle>
                  {myValidatorStats.num_produced_blocks} /{" "}
                  {myValidatorStats.num_expected_blocks}
                </CardTitle>{" "}
                blocks produced
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="flex gap-2 items-center">
                <CardTitle>
                  {myValidatorStats.num_produced_chunks} /{" "}
                  {myValidatorStats.num_expected_chunks}
                </CardTitle>{" "}
                chunks produced
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="flex gap-2 items-center">
                <CardTitle>
                  {myValidatorStats.num_produced_endorsements} /{" "}
                  {myValidatorStats.num_expected_endorsements}
                </CardTitle>{" "}
                endorsements produced
              </CardHeader>
            </Card>
          </div>
        </Section>
      )}
      {validatorLogs && (
        <Section title="Logs">
          <div ref={logsScrollAreaRef}>
            <ScrollArea className="h-[500px]">
              <div className="rounded border bg-black px-3 py-2 font-mono text-muted flex flex-col">
                {validatorLogs.map((log, i) =>
                  log.message.type === "string" ? (
                    <span key={i}>{log.message.string}</span>
                  ) : (
                    <Ansi key={i}>
                      {Buffer.from(log.message.bytes).toString("utf-8")}
                    </Ansi>
                  )
                )}
              </div>
            </ScrollArea>
          </div>
        </Section>
      )}
    </div>
  );
}
