import { useSettings, Xnode } from "@/components/context/settings";
import {
  changeConfig,
  cpuUsage,
  diskUsage,
  getContainerConfig,
  getContainers,
  getDirectory,
  getFile,
  getLogs,
  getOS,
  getProcesses,
  login,
  memoryUsage,
  removeDirectory as removeDirectory,
  removeFile,
  Session,
  setOS,
} from "@/lib/xnode";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";

const usageRefetchInterval = 1000; // 1 sec
const processesRefetchInterval = 60_000; // 60 sec
const logsRefetchInterval = 1000; // 1 sec

export function useSession({ xnode }: { xnode?: Xnode }) {
  const { wallets } = useSettings();
  return useQuery({
    queryKey: ["session", xnode?.domain ?? "", xnode?.insecure ?? false],
    enabled: !!xnode,
    queryFn: async () => {
      if (!xnode) {
        return undefined;
      }

      const session = await login({
        domain: xnode.domain,
        insecure: xnode.insecure,
        sig: wallets[xnode.owner],
      });
      return session;
    },
  });
}

export function useCpu({ session }: { session?: Session }) {
  return useQuery({
    queryKey: ["cpu", session?.baseUrl ?? ""],
    enabled: !!session,
    queryFn: async () => {
      if (!session) {
        return undefined;
      }

      return await cpuUsage({ session });
    },
    refetchInterval: usageRefetchInterval,
  });
}

export function useMemory({ session }: { session?: Session }) {
  return useQuery({
    queryKey: ["memory", session?.baseUrl ?? ""],
    enabled: !!session,
    queryFn: async () => {
      if (!session) {
        return undefined;
      }

      return await memoryUsage({ session });
    },
    refetchInterval: usageRefetchInterval,
  });
}

export function useDisk({ session }: { session?: Session }) {
  return useQuery({
    queryKey: ["disk", session?.baseUrl ?? ""],
    enabled: !!session,
    queryFn: async () => {
      if (!session) {
        return undefined;
      }

      return await diskUsage({ session });
    },
    refetchInterval: usageRefetchInterval,
  });
}

export function useProcesses({
  session,
  containerId,
}: {
  session?: Session;
  containerId?: string;
}) {
  return useQuery({
    queryKey: ["processes", containerId, process, session?.baseUrl ?? ""],
    enabled: !!session && !!containerId && !!process,
    queryFn: async () => {
      if (!session || !containerId || !process) {
        return undefined;
      }

      return await getProcesses({ session, containerId });
    },
    refetchInterval: processesRefetchInterval,
  });
}

export function useLogs({
  session,
  containerId,
  process,
}: {
  session?: Session;
  containerId?: string;
  process?: string;
}) {
  return useQuery({
    queryKey: ["logs", containerId, process, session?.baseUrl ?? ""],
    enabled: !!session && !!containerId && !!process,
    queryFn: async () => {
      if (!session || !containerId || !process) {
        return undefined;
      }

      return await getLogs({ session, containerId, process });
    },
    refetchInterval: logsRefetchInterval,
  });
}

export function usePrepareXnode({ session }: { session?: Session }) {
  const { data: os, refetch: osRefetch } = useQuery({
    queryKey: ["os", session?.baseUrl ?? ""],
    enabled: !!session,
    queryFn: async () => {
      if (!session) {
        return undefined;
      }

      return await getOS({ session });
    },
  });

  const { data: latestOsConfig } = useQuery({
    queryKey: ["latest-os-config"],
    queryFn: async () => {
      return await axios
        .get(
          "https://raw.githubusercontent.com/Openmesh-Network/xnode-manager/main/os/flake.nix"
        )
        .then((res) => res.data)
        .then((data) => {
          const startSplit = data.split("# START USER CONFIG");
          const endSplit = startSplit[1].split("# END USER CONFIG");
          return {
            beforeUserConfig: startSplit[0],
            afterUserConfig: endSplit[1],
          };
        });
    },
  });
  const osConfig = useMemo(() => {
    if (!os) {
      return undefined;
    }

    const startSplit = os.flake.split("# START USER CONFIG");
    const endSplit = startSplit[1].split("# END USER CONFIG");
    return {
      beforeUserConfig: startSplit[0],
      userConfig: endSplit[0],
      afterUserConfig: endSplit[1],
    };
  }, [os]);

  const osUpdateNeeded = useMemo(
    () =>
      osConfig && latestOsConfig
        ? osConfig.beforeUserConfig !== latestOsConfig.beforeUserConfig ||
          osConfig.afterUserConfig !== latestOsConfig.afterUserConfig
        : undefined,
    [osConfig, latestOsConfig]
  );
  const osUpdate = useMemo(
    () => async () => {
      if (!session || !osConfig || !latestOsConfig) {
        return;
      }

      return setOS({
        session,
        os: {
          flake:
            latestOsConfig.beforeUserConfig +
            "# START USER CONFIG" +
            osConfig.userConfig +
            "# END USER CONFIG" +
            latestOsConfig.afterUserConfig,
          as_child: false,
        },
      })
        .catch(console.error)
        .then(() => osRefetch());
    },
    [session, osConfig, latestOsConfig, osRefetch]
  );

  const enableHttps = useMemo(
    () =>
      async ({
        domain,
        acme_email,
      }: {
        domain: string;
        acme_email: string;
      }) => {
        if (!session) {
          return;
        }

        return setOS({
          session,
          os: {
            domain,
            acme_email,
            as_child: false,
          },
        }).catch(console.error);
      },
    [session, osRefetch]
  );

  // Important to keep the newline before and after!
  const wantedOsUserConfig = `
{
  boot.kernel.sysctl = {
    "net.core.rmem_max" = 8388608;
    "net.core.wmem_max" = 8388608;
    "net.ipv4.tcp_rmem" = "4096 87380 8388608";
    "net.ipv4.tcp_wmem" = "4096 16384 8388608";
    "net.ipv4.tcp_slow_start_after_idle" = 0;
  };

  networking.firewall.allowedTCPPorts = [
    3030
    24567
  ];
}
`;

  const osPatchNeeded = useMemo(
    () => (osConfig ? osConfig.userConfig !== wantedOsUserConfig : undefined),
    [osConfig, wantedOsUserConfig]
  );
  const osPatch = useMemo(
    () => async () => {
      if (!session || !osConfig) {
        return;
      }

      return setOS({
        session,
        os: {
          flake:
            osConfig.beforeUserConfig +
            "# START USER CONFIG" +
            wantedOsUserConfig +
            "# END USER CONFIG" +
            osConfig.afterUserConfig,
          as_child: false,
        },
      })
        .catch(console.error)
        .then(() => osRefetch());
    },
    [session, osConfig, wantedOsUserConfig, osRefetch]
  );

  const { data: latestXnodeManagerVersion } = useQuery({
    queryKey: ["latest-xnode-manager"],
    queryFn: async () => {
      return await axios
        .get(
          "/github-forward/repos/Openmesh-Network/xnode-manager/commits/main"
        )
        .then((res) => res.data)
        .then((data) => data.sha);
    },
  });
  const xnodeManagerUpdateNeeded = useMemo(() => {
    if (!os || !latestXnodeManagerVersion) {
      return undefined;
    }

    const version = JSON.parse(os.flake_lock).nodes["xnode-manager"].locked.rev;
    return version !== latestXnodeManagerVersion;
  }, [os, latestXnodeManagerVersion]);

  const xnodeManagerUpdate = useMemo(
    () => async () => {
      if (!session) {
        return;
      }

      return setOS({
        session,
        os: {
          update_inputs: ["xnode-manager"],
          as_child: true,
        },
      })
        .catch(console.error)
        .then(() => new Promise((resolve) => setTimeout(resolve, 30_000))) // As child will not await the new config, guess 30 seconds
        .then(() => osRefetch());
    },
    [session, osRefetch]
  );

  const { data: containers, refetch: containersRefetch } = useQuery({
    queryKey: ["containers", session?.baseUrl ?? ""],
    enabled: !!session,
    queryFn: async () => {
      if (!session) {
        return undefined;
      }

      return await getContainers({ session });
    },
  });

  const containerId = "near-validator";
  const nearContainerMissing = useMemo(() => {
    if (!containers) {
      return undefined;
    }

    return !containers.includes(containerId);
  }, [containers]);
  const createNearContainer = useMemo(
    () =>
      async ({
        poolId,
        poolVersion,
        pinger,
      }: {
        poolId: string;
        poolVersion: string;
        pinger: boolean;
      }) => {
        if (!session) {
          return;
        }

        return changeConfig({
          session,
          changes: [
            {
              Set: {
                container: containerId,
                settings: {
                  flake: `{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    near-validator.url = "github:Openmesh-Network/near-validator";
  };

  nixConfig = {
    extra-substituters = [
      "https://openmesh.cachix.org"
    ];
    extra-trusted-public-keys = [
      "openmesh.cachix.org-1:du4NDeMWxcX8T5GddfuD0s/Tosl3+6b+T2+CLKHgXvQ="
    ];
  };

  outputs =
    {
      self,
      nixpkgs,
      near-validator,
      ...
    }:
    let
      system = "x86_64-linux";
    in
    {
      nixosConfigurations.container = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = {
          inherit near-validator;
        };
        modules = [
          (
            { near-validator, lib, ... }:
            {
              imports = [
                near-validator.nixosModules.default
              ];

              boot.isContainer = true;

              systemd.services.near-validator.serviceConfig = {
                  DynamicUser = lib.mkForce false;
                  User = "root";
                  Group = "root";
              };

              systemd.services.near-validator-pinger.serviceConfig = {
                DynamicUser = lib.mkForce false;
                User = "root";
                Group = "root";
              };

              services.near-validator = {
                enable = true;
                pool = {
                  id = "${poolId}";
                  version = "${poolVersion}";
                };
                pinger.enable = ${pinger ? "true" : "false"};
              };

              networking = {
                firewall.allowedTCPPorts = [
                  3030
                  24567
                ];

                useHostResolvConf = nixpkgs.lib.mkForce false;
              };

              services.resolved.enable = true;

              system.stateVersion = "25.05";
            }
          )
        ];
      };
    };
}`,
                },
              },
            },
          ],
        })
          .catch(console.error)
          .then(() => containersRefetch());
      },
    [session, containerId, containersRefetch]
  );

  const { data: validatorPublicKey, refetch: refetchValidatorPublicKey } =
    useQuery({
      queryKey: [
        "validatorPublicKey",
        containerId,
        session?.baseUrl ?? "",
        nearContainerMissing ?? true,
      ],
      enabled: !!session && nearContainerMissing === false,
      queryFn: async () => {
        if (!session || nearContainerMissing !== false) {
          return undefined;
        }

        return await getFile({
          session,
          location: {
            containerId,
            path: "/var/lib/near-validator/.near/validator_key.json",
          },
        })
          .then(
            (file) =>
              JSON.parse(file.content) as {
                account_id: string;
                public_key: string;
                secret_key: string;
              }
          )
          .then((key) => key.public_key);
      },
    });

  const { data: nearContainer, refetch: nearContainerRefetch } = useQuery({
    queryKey: [
      "container",
      containerId,
      session?.baseUrl ?? "",
      nearContainerMissing ?? true,
    ],
    enabled: !!session && nearContainerMissing === false,
    queryFn: async () => {
      if (!session || nearContainerMissing !== false) {
        return undefined;
      }

      return await getContainerConfig({ session, containerId });
    },
  });

  const existingNearContainerSettings = useMemo(() => {
    if (!nearContainer) {
      return undefined;
    }

    const poolId = nearContainer.flake.split('id = "')[1].split('";')[0];
    const poolVersion = nearContainer.flake
      .split('version = "')[1]
      .split('";')[0];
    const pinger =
      nearContainer.flake.split("pinger.enable = ")[1].split(";")[0] === "true";
    return { poolId, poolVersion, pinger };
  }, [nearContainer]);

  const { data: pingerAccountId } = useQuery({
    queryKey: [
      "pingerAccountId",
      containerId,
      session?.baseUrl ?? "",
      nearContainerMissing ?? true,
      existingNearContainerSettings?.pinger ?? false,
    ],
    enabled:
      !!session &&
      nearContainerMissing === false &&
      existingNearContainerSettings?.pinger === true,
    queryFn: async () => {
      if (
        !session ||
        nearContainerMissing !== false ||
        existingNearContainerSettings?.pinger !== true
      ) {
        return undefined;
      }

      return await getDirectory({
        session,
        location: {
          containerId,
          path: "/var/lib/near-validator-pinger/.near-credentials/mainnet",
        },
      }).then((dir) => dir.files.at(0)?.replace(".json", ""));
    },
  });

  const updateNearContainerSettings = useMemo(
    () =>
      async ({
        poolId,
        poolVersion,
        pinger,
        reset,
      }: {
        poolId: string;
        poolVersion: string;
        pinger: boolean;
        reset: boolean;
      }) => {
        if (!session || !existingNearContainerSettings) {
          return;
        }

        return (
          reset
            ? removeDirectory({
                session,
                location: {
                  containerId,
                  path: "/var/lib/near-validator/.near/data",
                },
                make_empty: true,
              }).catch(console.error)
            : new Promise((resolve) => setTimeout(resolve, 0))
        )
          .then(() =>
            `${poolId}.${poolVersion}.near` !==
            `${existingNearContainerSettings.poolId}.${existingNearContainerSettings.poolVersion}.near`
              ? removeFile({
                  session,
                  location: {
                    containerId,
                    path: "/var/lib/near-validator/.near/validator_key.json",
                  },
                }).catch(console.error)
              : new Promise((resolve) => setTimeout(resolve, 0))
          )
          .then(() =>
            createNearContainer({ poolId, poolVersion, pinger })
              ?.catch(console.error)
              .then(() =>
                Promise.all([
                  nearContainerRefetch(),
                  refetchValidatorPublicKey(),
                ])
              )
          );
      },
    [session, containerId, createNearContainer, existingNearContainerSettings]
  );

  const removeNearContainer = useMemo(
    () => async () => {
      if (!session) {
        return;
      }

      return await changeConfig({
        session,
        changes: [
          {
            Remove: {
              container: containerId,
              backup: false,
            },
          },
        ],
      }).catch(console.error);
    },
    [session, containerId]
  );

  const { data: latestNearValidatorVersion } = useQuery({
    queryKey: ["latest-near-validator"],
    queryFn: async () => {
      return await axios
        .get(
          "/github-forward/repos/Openmesh-Network/near-validator/commits/main"
        )
        .then((res) => res.data)
        .then((data) => data.sha);
    },
  });
  const nearContainerUpdateNeeded = useMemo(() => {
    if (!nearContainer || !latestNearValidatorVersion) {
      return undefined;
    }

    const version = JSON.parse(nearContainer.flake_lock).nodes["near-validator"]
      .locked.rev;
    return version !== latestNearValidatorVersion;
  }, [nearContainer, latestNearValidatorVersion]);

  const updateNearContainer = useMemo(
    () => async () => {
      if (!session) {
        return;
      }

      return changeConfig({
        session,
        changes: [
          {
            Set: {
              container: containerId,
              update_inputs: ["near-validator"],
            },
          },
        ],
      })
        .catch(console.error)
        .then(() => nearContainerRefetch());
    },
    [session, containerId, nearContainerRefetch]
  );

  const missingDependencies = [
    osUpdateNeeded,
    osPatchNeeded,
    xnodeManagerUpdateNeeded,
    nearContainerMissing,
    nearContainerUpdateNeeded,
  ];
  const ready = missingDependencies.some((b) => b === true)
    ? false
    : missingDependencies.some((b) => b === undefined)
    ? undefined
    : true;

  return {
    os,
    osUpdateNeeded,
    osUpdate,
    enableHttps,
    osPatchNeeded,
    osPatch,
    xnodeManagerUpdateNeeded,
    xnodeManagerUpdate,
    containerId: nearContainerMissing ? undefined : containerId,
    nearContainerMissing,
    createNearContainer,
    existingNearContainerSettings,
    updateNearContainerSettings,
    removeNearContainer,
    nearContainerUpdateNeeded,
    updateNearContainer,
    ready,
    validatorPublicKey,
    pingerAccountId,
  };
}
