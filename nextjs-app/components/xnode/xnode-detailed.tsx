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
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { UsageChart, UsageHistory } from "../charts/usage-chart";
import { Section, Title } from "../text";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import HardwareReset from "../deployment/hardware-reset";
import Image from "next/image";
import NearLogo from "@/public/images/near/near.svg";

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
    removeNearContainer,
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

  const [resetOpen, setResetOpen] = useState<boolean>(false);

  return (
    <>
      <div className="flex flex-col gap-5">
        {xnode?.insecure && (
          <Alert className="bg-[#0c2246d6] text-white">
            <AlertTriangle />
            <AlertTitle>WARNING: Using unencrypted communication!</AlertTitle>
            <AlertDescription className="text-muted">
              <span>
                You should enable HTTPS before accessing any confidential
                information on your Xnode (such as validator private keys).
                Setup an A record pointing to this Xnode IP address ({domain}),
                it can be under any (sub)domain. Only press the update button
                once the record has been set and has propagated, otherwise you
                might become locked out of your Xnode. Email is required and
                cannot be from a blacklisted domain (e.g. @example.com).
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
        <Section title="Monitor NEAR Node">
          <div className="grid grid-cols-3 gap-2 max-lg:grid-cols-2 max-md:grid-cols-1">
            {cpuHistory.length > 0 && (
              <UsageChart title="CPU Usage" label="CPU" data={cpuHistory} />
            )}
            {memoryHistory.length > 0 && (
              <UsageChart
                title="Memory Usage"
                label="Memory"
                data={memoryHistory}
              />
            )}
            {disk && (
              <Card className="bg-[#0c2246d6] text-white">
                <CardHeader>
                  <CardTitle>Disk Usage</CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            )}
          </div>
        </Section>
        <div className="flex flex-wrap max-md:flex-col gap-2">
          <SectionCard title="Configure Pool">
            <RowDiv>
              <Label htmlFor="poolId">Pool ID</Label>
              <Input
                id="poolId"
                className="max-w-40"
                value={poolId}
                onChange={(e) => setPoolId(e.target.value.toLowerCase())}
              />
            </RowDiv>
            <RowDiv>
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
            </RowDiv>
            <RowDiv>
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
            </RowDiv>
            <RowDiv>
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
            </RowDiv>
          </SectionCard>
          <SectionCard title="Manage NEAR Node">
            {osUpdateNeeded !== undefined &&
              (osUpdateNeeded ? (
                <RowDiv>
                  <Status type="warning" text="OS not up to date." />
                  <Button
                    onClick={() => {
                      setBusy(true);
                      osUpdate().then(() => setBusy(false));
                    }}
                    disabled={busy}
                  >
                    Update
                  </Button>
                </RowDiv>
              ) : (
                <RowDiv>
                  <Status type="success" text="OS up to date." />
                </RowDiv>
              ))}
            {osPatchNeeded !== undefined &&
              (osPatchNeeded ? (
                <RowDiv>
                  <Status type="warning" text="OS patch not applied." />
                  <Button
                    onClick={() => {
                      setBusy(true);
                      osPatch().finally(() => setBusy(false));
                    }}
                    disabled={busy}
                  >
                    Patch
                  </Button>
                </RowDiv>
              ) : (
                <RowDiv>
                  <Status type="success" text="OS patched." />
                </RowDiv>
              ))}
            {nearContainerMissing !== undefined &&
              (nearContainerMissing ? (
                <RowDiv>
                  <Status type="warning" text="NEAR app not deployed." />
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
                </RowDiv>
              ) : existingNearContainerSettings?.poolId !== poolId ||
                existingNearContainerSettings?.poolVersion != poolVersion ||
                existingNearContainerSettings?.pinger != pinger ? (
                <RowDiv>
                  <Status
                    type="warning"
                    text="NEAR app settings have changed."
                  />
                  <Button
                    onClick={() => {
                      setBusy(true);
                      updateNearContainerSettings({
                        poolId,
                        poolVersion,
                        pinger,
                        reset: false,
                      }).finally(() => setBusy(false));
                    }}
                    disabled={!validatorLogs || busy}
                  >
                    Update
                  </Button>
                </RowDiv>
              ) : (
                <RowDiv>
                  <Status type="success" text="NEAR app deployed." />
                </RowDiv>
              ))}
            {xnodeManagerUpdateNeeded !== undefined &&
              (xnodeManagerUpdateNeeded ? (
                <RowDiv>
                  <Status type="warning" text="Xnode Manager not up to date." />
                  <Button
                    onClick={() => {
                      setBusy(true);
                      xnodeManagerUpdate().finally(() => setBusy(false));
                    }}
                    disabled={busy}
                  >
                    Update
                  </Button>
                </RowDiv>
              ) : (
                <RowDiv>
                  <Status type="success" text="Xnode Manager up to date." />
                </RowDiv>
              ))}
            {nearContainerUpdateNeeded !== undefined &&
              (nearContainerUpdateNeeded ? (
                <RowDiv>
                  <Status type="warning" text="NEAR app not up to date." />
                  <Button
                    onClick={() => {
                      setBusy(true);
                      updateNearContainer().finally(() => setBusy(false));
                    }}
                    disabled={!validatorLogs || busy}
                  >
                    Update
                  </Button>
                </RowDiv>
              ) : (
                <RowDiv>
                  <Status type="success" text="NEAR app up to date." />
                </RowDiv>
              ))}
          </SectionCard>
          {!loading && (
            <SectionCard title="Manage Pool">
              <div className="flex flex-col gap-3">
                {poolDeployed !== undefined &&
                  validatorPublicKey !== undefined &&
                  (!poolDeployed ? (
                    connectedAccountBalance !== undefined &&
                    connectedAccountBalance <
                      requiredAccountBalance.poolCost +
                        requiredAccountBalance.gasFee ? (
                      <RowDiv>
                        <Status
                          type="warning"
                          text={`Pool not deployed. Connected account does not have ${requiredAccountBalance.poolCost} NEAR (+ <${requiredAccountBalance.gasFee} in gas fees) required to deploy one.`}
                        />
                        <TriangleAlert className="text-red-600" />
                        <span className="text-red-600"></span>
                      </RowDiv>
                    ) : (
                      <RowDiv>
                        <Status type="warning" text="Pool not deployed." />
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
                      </RowDiv>
                    )
                  ) : (
                    <RowDiv>
                      <Status type="success" text="Pool deployed." />
                    </RowDiv>
                  ))}
                {poolDeployed !== undefined &&
                  poolDeployed &&
                  deployedPoolSettings &&
                  (deployedPoolSettings.owner_id === accountId ? (
                    <>
                      {validatorPublicKey &&
                        deployedPoolSettings.stake_public_key !==
                          validatorPublicKey && (
                          <RowDiv>
                            <Status
                              type="warning"
                              text="Pool validator public key mismatch."
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
                          </RowDiv>
                        )}
                      {(deployedPoolSettings.reward_fee_fraction.numerator !==
                        rewardFee ||
                        deployedPoolSettings.reward_fee_fraction.denominator !==
                          100) && (
                        <RowDiv>
                          <Status
                            type="warning"
                            text="Pool reward fee changed."
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
                        </RowDiv>
                      )}
                    </>
                  ) : (
                    <>
                      {accountId ? (
                        <RowDiv>
                          <Status
                            type="warning"
                            text="Connected wallet is not the owner of this pool."
                          />
                        </RowDiv>
                      ) : (
                        <RowDiv>
                          <Status type="warning" text="No wallet connected." />
                        </RowDiv>
                      )}
                    </>
                  ))}
                {totalPoolStake !== undefined && (
                  <RowDiv>
                    <span>Total Stake:</span>
                    <span>{totalPoolStake.toFixed(1)} NEAR</span>
                  </RowDiv>
                )}
                {!loading && poolDeployed && (
                  <RowDiv>
                    <Label className="text-base" htmlFor="stake-topup">
                      Add Stake:
                    </Label>
                    <div className="flex gap-1">
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
                  </RowDiv>
                )}
              </div>
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
                      Disconnect{" "}
                      <span className="break-words">{accountId}</span>
                      {connectedAccountBalance && (
                        <div className="flex">
                          <span>(</span>
                          <Image
                            alt="NEAR logo"
                            src={NearLogo}
                            width={20}
                            height={20}
                          />
                          <span>{connectedAccountBalance.toFixed(3)} )</span>
                        </div>
                      )}
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
            </SectionCard>
          )}
          {existingNearContainerSettings?.pinger && pingerAccountId && (
            <SectionCard title="Pinger">
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
                <RowDiv>
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
                                  deposit: parseUnits(
                                    pingerTopUp,
                                    24
                                  ).toString(),
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
                </RowDiv>
              )}
              {/* Last ping ? */}
            </SectionCard>
          )}
          <SectionCard title="Actions">
            <Button className="max-w-48" onClick={() => setResetOpen(true)}>
              Reset NEAR Node
            </Button>
            <Button
              className="max-w-48"
              onClick={() => {
                setBusy(true);
                updateNearContainerSettings({
                  poolId,
                  poolVersion,
                  pinger,
                  reset: true,
                }).finally(() => setBusy(false));
              }}
              disabled={!validatorLogs || busy}
            >
              Delete NEAR chain data
            </Button>
            <Button
              className="max-w-48"
              onClick={() => {
                setBusy(true);
                removeNearContainer().finally(() => setBusy(false));
              }}
              disabled={!validatorLogs || busy}
            >
              Uninstall NEAR app
            </Button>
          </SectionCard>
        </div>
        {myValidatorStats && (
          <Section title="Validator Performance">
            <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
              <Card className="bg-[#0c2246d6] text-white">
                <CardHeader className="flex gap-2 items-center">
                  <CardTitle>
                    {myValidatorStats.num_produced_blocks} /{" "}
                    {myValidatorStats.num_expected_blocks}
                  </CardTitle>{" "}
                  blocks produced
                </CardHeader>
              </Card>
              <Card className="bg-[#0c2246d6] text-white">
                <CardHeader className="flex gap-2 items-center">
                  <CardTitle>
                    {myValidatorStats.num_produced_chunks} /{" "}
                    {myValidatorStats.num_expected_chunks}
                  </CardTitle>{" "}
                  chunks produced
                </CardHeader>
              </Card>
              <Card className="bg-[#0c2246d6] text-white">
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
      <Dialog open={resetOpen} onOpenChange={(o) => setResetOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Xnode</DialogTitle>
          </DialogHeader>
          {xnode && (
            <HardwareReset xnode={xnode} onReset={() => setResetOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Status({ type, text }: { type: "warning" | "success"; text: string }) {
  return (
    <div className="flex gap-1">
      {type === "warning" ? (
        <>
          <TriangleAlert className="shrink-0 text-red-600" />
          <span className="text-red-600">{text}</span>
        </>
      ) : (
        <>
          <CheckCircle className="shrink-0 text-green-600" />
          <span className="text-green-600">{text}</span>
        </>
      )}
    </div>
  );
}

function RowDiv({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 place-content-between items-center max-w-96">
      {children}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 bg-[#0c2246d6] text-white">
      <CardHeader>
        <CardTitle>
          <Title title={title} />
        </CardTitle>
      </CardHeader>
      <CardContent className="h-full flex flex-col gap-2 place-content-between">
        <div /> {/* Force equal gap at the top */}
        {children}
      </CardContent>
    </Card>
  );
}
