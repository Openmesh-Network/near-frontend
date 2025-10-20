import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";
import { xnode } from "@openmesh-network/xnode-manager-sdk";
import {
  awaitRequest,
  useConfigContainerGet,
  useConfigContainerRemove,
  useConfigContainers,
  useConfigContainerSet,
  useFileReadDirectory,
  useFileReadFile,
  useFileRemoveDirectory,
  useFileRemoveFile,
  useInfoFlake,
  useOsGet,
  useOsSet,
  useProcessExecute,
} from "@openmesh-network/xnode-manager-sdk-react";

export function usePrepareXnode({
  session,
}: {
  session?: xnode.utils.Session;
}) {
  const { data: os } = useOsGet({ session });

  // Important to keep the newline before and after!
  const wantedOsUserConfig = `
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
`;
  const { data: latestOsConfig } = useQuery({
    queryKey: ["latest-os-config"],
    queryFn: async () => {
      return await axios
        .get(
          "https://raw.githubusercontent.com/Openmesh-Network/xnode-manager/main/os/flake.nix"
        )
        .then((res) => res.data as string)
        .then((data) => {
          const startSplit = data.split("# START USER CONFIG");
          const endSplit = startSplit[1].split("# END USER CONFIG");
          return `${startSplit[0]}# START USER CONFIG${wantedOsUserConfig}# END USER CONFIG${endSplit[1]}`;
        });
    },
  });

  const { data: latestXnodeManager } = useInfoFlake({
    session,
    flake: "github:Openmesh-Network/xnode-manager",
  });

  const osUpdateNeeded = useMemo(
    () =>
      os && latestOsConfig && latestXnodeManager
        ? os.flake !== latestOsConfig ||
          latestXnodeManager.revision !==
            JSON.parse(os.flake_lock).nodes["xnode-manager"].locked.rev
        : undefined,
    [os, latestOsConfig, latestXnodeManager]
  );
  const { mutateAsync: setOS } = useOsSet();
  const osUpdate = useMemo(
    () => async () => {
      if (!session || !latestOsConfig) {
        return;
      }

      return setOS({
        session,
        data: {
          acme_email: null,
          domain: null,
          flake: latestOsConfig,
          update_inputs: [],
          user_passwd: null,
          xnode_owner: null,
        },
      })
        .then((request) =>
          awaitRequest({ request: { session, path: request } })
        )
        .catch(console.error);
    },
    [session, latestOsConfig]
  );

  const { data: containers } = useConfigContainers({ session });

  const containerId = "near-validator";
  const nearContainerMissing = useMemo(() => {
    if (!containers) {
      return undefined;
    }

    return !containers.includes(containerId);
  }, [containers]);
  const { mutateAsync: setContainer } = useConfigContainerSet();
  const createNearContainer = useMemo(
    () =>
      async ({
        poolId,
        poolVersion,
        pinger,
        update,
      }: {
        poolId: string;
        poolVersion: string;
        pinger: boolean;
        update?: boolean;
      }) => {
        if (!session) {
          return;
        }

        return setContainer({
          session,
          path: {
            container: containerId,
          },
          data: {
            settings: {
              flake: `{
  inputs = {
    xnode-manager.url = "github:Openmesh-Network/xnode-manager";
    near-validator.url = "github:Openmesh-Network/near-validator";
    nixpkgs.follows = "near-validator/nixpkgs";
  };

  nixConfig = {
    extra-substituters = [
      "https://openmesh.cachix.org"
    ];
    extra-trusted-public-keys = [
      "openmesh.cachix.org-1:du4NDeMWxcX8T5GddfuD0s/Tosl3+6b+T2+CLKHgXvQ="
    ];
  };

  outputs = inputs: {
    nixosConfigurations.container = inputs.nixpkgs.lib.nixosSystem {
      specialArgs = {
        inherit inputs;
      };
      modules = [
        inputs.xnode-manager.nixosModules.container
        {
          services.xnode-container.xnode-config = {
            host-platform = ./xnode-config/host-platform;
            state-version = ./xnode-config/state-version;
            hostname = ./xnode-config/hostname;
          };
        }
        inputs.near-validator.nixosModules.default
        (
          { pkgs, ... }@args:
          {
            # START USER CONFIG
            services.near-validator.pool.id = "${poolId}";
            services.near-validator.pool.version = "${poolVersion}";
            services.near-validator.pinger.enable = ${
              pinger ? "true" : "false"
            };
            # END USER CONFIG

            services.near-validator.enable = true;

            networking.firewall.allowedTCPPorts = [
              3030
              24567
            ];
          }
        )
      ];
    };
  };
}`,
              network: null,
              nvidia_gpus: null,
            },
            update_inputs: update ? [] : null,
          },
        })
          .then((request) =>
            awaitRequest({ request: { session, path: request } })
          )
          .catch(console.error);
      },
    [session, containerId]
  );

  const { data: validatorKeyFile } = useFileReadFile({
    session,
    path: "/var/lib/near-validator/.near/validator_key.json",
    scope: `container:${containerId}`,
    overrides: {
      enabled: nearContainerMissing === false,
    },
  });
  const validatorPublicKey = useMemo(() => {
    if (!validatorKeyFile || !("UTF8" in validatorKeyFile.content)) {
      return undefined;
    }

    return JSON.parse(validatorKeyFile.content.UTF8.output)
      .public_key as string;
  }, [validatorKeyFile]);

  const { data: nearContainer } = useConfigContainerGet({
    session,
    container: containerId,
    overrides: {
      enabled: nearContainerMissing === false,
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

  const { data: nearCredentialsFolder } = useFileReadDirectory({
    session,
    path: "/var/lib/near-validator-pinger/.near-credentials/mainnet",
    scope: `container:${containerId}`,
    overrides: {
      enabled: nearContainerMissing === false,
    },
  });
  const pingerAccountId = useMemo(() => {
    if (!nearCredentialsFolder) {
      return undefined;
    }

    return nearCredentialsFolder.files.at(0)?.replace(".json", "");
  }, [nearCredentialsFolder]);

  const { mutateAsync: removeFile } = useFileRemoveFile();
  const { mutateAsync: removeDirectory } = useFileRemoveDirectory();
  const updateNearContainerSettings = useMemo(
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
        if (!session || !existingNearContainerSettings) {
          return;
        }

        return (
          `${poolId}.${poolVersion}.near` !==
          `${existingNearContainerSettings.poolId}.${existingNearContainerSettings.poolVersion}.near`
            ? removeFile({
                session,
                path: { scope: `container:${containerId}` },
                data: {
                  path: "/var/lib/near-validator/.near/validator_key.json",
                },
              }).catch(console.error)
            : new Promise((resolve) => setTimeout(resolve, 0))
        ).then(() => createNearContainer({ poolId, poolVersion, pinger }));
      },
    [session, containerId, createNearContainer, existingNearContainerSettings]
  );

  const { mutateAsync: removeContainer } = useConfigContainerRemove();
  const removeNearContainer = useMemo(
    () => async () => {
      if (!session) {
        return;
      }

      return await removeContainer({
        session,
        path: { container: containerId },
      })
        .then((request) =>
          awaitRequest({ request: { session, path: request } })
        )
        .catch(console.error);
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
    if (!nearContainer?.flake_lock || !latestNearValidatorVersion) {
      return undefined;
    }

    const version = JSON.parse(nearContainer.flake_lock).nodes["near-validator"]
      .locked.rev;
    return version !== latestNearValidatorVersion;
  }, [nearContainer, latestNearValidatorVersion]);

  const updateNearContainer = useMemo(
    () => async () => {
      if (!session || !existingNearContainerSettings) {
        return;
      }

      return createNearContainer({
        poolId: existingNearContainerSettings.poolId,
        poolVersion: existingNearContainerSettings.poolVersion,
        pinger: existingNearContainerSettings.pinger,
        update: true,
      });
    },
    [session, containerId, createNearContainer, existingNearContainerSettings]
  );

  const { mutateAsync: execute } = useProcessExecute();
  const restartNearContainer = useMemo(
    () => async () => {
      if (!session) {
        return;
      }

      return execute({
        session,
        path: {
          scope: `container:${containerId}`,
          process: "near-validator.service",
        },
        data: "Restart",
      })
        .then((request) =>
          awaitRequest({ request: { session, path: request } })
        )
        .catch(console.error);
    },
    [session, containerId]
  );

  const resetNearData = useMemo(
    () => async () => {
      if (!session) {
        return;
      }

      removeDirectory({
        session,
        path: { scope: `container:${containerId}` },
        data: {
          path: "/var/lib/near-validator/.near/data",
          make_empty: true,
        },
      })
        .catch(console.error)
        .then(() => restartNearContainer());
    },
    [session, containerId]
  );

  const missingDependencies = [
    osUpdateNeeded,
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
    containerId: nearContainerMissing ? undefined : containerId,
    nearContainerMissing,
    createNearContainer,
    existingNearContainerSettings,
    updateNearContainerSettings,
    removeNearContainer,
    nearContainerUpdateNeeded,
    updateNearContainer,
    restartNearContainer,
    resetNearData,
    ready,
    validatorPublicKey,
    pingerAccountId,
  };
}
