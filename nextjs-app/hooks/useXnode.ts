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
  useOsGet,
  useOsSet,
} from "@openmesh-network/xnode-manager-sdk-react";

export function usePrepareXnode({
  session,
}: {
  session?: xnode.utils.Session;
}) {
  const { data: os } = useOsGet({ session });

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
  const { mutateAsync: setOS } = useOsSet();
  const osUpdate = useMemo(
    () => async () => {
      if (!session || !osConfig || !latestOsConfig) {
        return;
      }

      return setOS({
        session,
        data: {
          acme_email: null,
          domain: null,
          flake:
            latestOsConfig.beforeUserConfig +
            "# START USER CONFIG" +
            osConfig.userConfig +
            "# END USER CONFIG" +
            latestOsConfig.afterUserConfig,
          update_inputs: null,
          user_passwd: null,
          xnode_owner: null,
        },
      })
        .then((request) =>
          awaitRequest({ request: { session, path: request } })
        )
        .catch(console.error);
    },
    [session, osConfig, latestOsConfig]
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
          data: {
            acme_email,
            domain,
            flake: null,
            update_inputs: null,
            user_passwd: null,
            xnode_owner: null,
          },
        })
          .then((request) =>
            awaitRequest({ request: { session, path: request } })
          )
          .catch(console.error);
      },
    [session]
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
        data: {
          acme_email: null,
          domain: null,
          flake:
            osConfig.beforeUserConfig +
            "# START USER CONFIG" +
            wantedOsUserConfig +
            "# END USER CONFIG" +
            osConfig.afterUserConfig,
          update_inputs: null,
          user_passwd: null,
          xnode_owner: null,
        },
      })
        .then((request) =>
          awaitRequest({ request: { session, path: request } })
        )
        .catch(console.error);
    },
    [session, osConfig, wantedOsUserConfig]
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
        data: {
          acme_email: null,
          domain: null,
          flake: null,
          update_inputs: ["xnode-manager"],
          user_passwd: null,
          xnode_owner: null,
        },
      })
        .then((request) =>
          awaitRequest({ request: { session, path: request } })
        )
        .catch(console.error);
    },
    [session]
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
              network: null,
            },
            update_inputs: update ? ["near-validator"] : null,
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
                path: { scope: `container:${containerId}` },
                data: {
                  path: "/var/lib/near-validator/.near/data",
                  make_empty: true,
                },
              }).catch(console.error)
            : new Promise((resolve) => setTimeout(resolve, 0))
        )
          .then(() =>
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
          )
          .then(() => createNearContainer({ poolId, poolVersion, pinger }));
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
      }).catch(console.error);
    },
    [session, containerId, createNearContainer, existingNearContainerSettings]
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
