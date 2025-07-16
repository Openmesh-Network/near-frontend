"use client";

import { useMemo, useState } from "react";
import { useSetSettings, useSettings, Xnode } from "../context/settings";
import { toXnodeAddress, useAddress } from "@/hooks/useAddress";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { LoginXnode, LoginXnodeParams } from "./login";
import axios from "axios";
import { parseSignature, recoverMessageAddress, toBytes } from "viem";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Hourglass } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useSignMessage } from "wagmi";
import { toast } from "sonner";

export function MigrateXnodes() {
  const address = useAddress();
  const settings = useSettings();
  const setSettings = useSetSettings();

  const myXnodes = useMemo(() => {
    if (!address) {
      return [];
    } else
      return settings.xnodes.filter(
        (xnode) => xnode.owner === address && !xnode.loginArgs
      );
  }, [address, settings.xnodes]);

  const [login, setLogin] = useState<LoginXnodeParams | undefined>(undefined);
  const [busy, setBusy] = useState<boolean>(false);

  const [domain, setDomain] = useState<string>("");
  const { signMessageAsync } = useSignMessage();

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="@container">
          {myXnodes.length > 0 ? (
            <div className="grid gap-3 grid-cols-4 @max-lg:grid-cols-1 @max-3xl:grid-cols-2 @max-6xl:grid-cols-3">
              {myXnodes
                .map(
                  (xnode) =>
                    xnode as any as {
                      domain: string;
                      owner: string;
                      insecure: boolean;
                      deploymentAuth?: string;
                    }
                )
                .map((xnode, i) => (
                  <Card key={i} className="bg-[#0c2246d6] text-white">
                    <CardHeader>
                      <CardTitle className="text-xl">{xnode.domain}</CardTitle>
                    </CardHeader>
                    <CardFooter>
                      <Button
                        onClick={() => {
                          const messageDomain = xnode.insecure
                            ? "manager.xnode.local"
                            : xnode.domain;
                          const messageTimestamp = Math.round(
                            Date.now() / 1000
                          );

                          setLogin({
                            message: `Xnode Auth authenticate ${messageDomain} at ${messageTimestamp}`,
                            onSigned(signature) {
                              const migrate = async () => {
                                setLogin(undefined);
                                setBusy(true);

                                const axiosInstance = axios.create({
                                  // httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Allow self-signed certificates (for "recovery mode", no secrets should be shared from the client)
                                  withCredentials: true, // Store cookies
                                });
                                const prefix = xnode.insecure
                                  ? "xnode-forward-insecure"
                                  : "xnode-forward";
                                const baseUrl = `/${prefix}/${xnode.domain}`;

                                const legacySignature = parseSignature(
                                  (settings as any).wallets[xnode.owner]
                                );
                                await axiosInstance.post(
                                  `${baseUrl}/auth/login`,
                                  {
                                    login_method: {
                                      WalletSignature: {
                                        v: legacySignature.yParity,
                                        r: [...toBytes(legacySignature.r)],
                                        s: [...toBytes(legacySignature.s)],
                                      },
                                    },
                                  }
                                );

                                await axiosInstance.post(`${baseUrl}/os/set`, {
                                  flake: `{
  description = "XnodeOS Configuration";

  inputs = {
    disko.url = "github:nix-community/disko/latest";
    nixos-facter-modules.url = "github:nix-community/nixos-facter-modules";
    lanzaboote.url = "github:nix-community/lanzaboote";

    xnode-manager.url = "github:Openmesh-Network/xnode-manager";
    nixpkgs.follows = "xnode-manager/nixpkgs";

    xnode-auth.url = "github:Openmesh-Network/xnode-auth";
  };

  nixConfig = {
    extra-substituters = [
      "https://openmesh.cachix.org"
      "https://nix-community.cachix.org"
    ];
    extra-trusted-public-keys = [
      "openmesh.cachix.org-1:du4NDeMWxcX8T5GddfuD0s/Tosl3+6b+T2+CLKHgXvQ="
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs =
    { nixpkgs, ... }@inputs:
    {
      nixosConfigurations.xnode = nixpkgs.lib.nixosSystem {
        specialArgs = { inherit inputs; };
        modules = [
          (
            let
              encrypted = if (builtins.pathExists ./encrypted) then builtins.readFile ./encrypted else "";
            in
            if (encrypted == "1") then
              (
                { lib, config, ... }:
                {
                  # Full disk encryption + Secure Boot
                  imports = [
                    inputs.lanzaboote.nixosModules.lanzaboote
                  ];

                  # Use Secure Boot
                  boot.lanzaboote = {
                    enable = true;
                    enrollKeys = true;
                    pkiBundle = "/var/lib/sbctl";
                    configurationLimit = 1;
                  };

                  # Decrypt all LUKS devices unattended with Clevis (TPM2)
                  boot.initrd.availableKernelModules = [
                    "tpm_crb"
                    "tpm_tis"
                    "virtio-pci"
                  ];
                  boot.initrd.clevis.enable = true;
                  boot.initrd.clevis.devices = lib.mapAttrs (name: luksDevice: {
                    secretFile = ./clevis.jwe;
                  }) config.boot.initrd.luks.devices;
                }
              )
            else
              {
                # Normal boot (no encryption or Secure Boot)
                boot.loader.grub = {
                  enable = true;
                  efiSupport = true;
                  efiInstallAsRemovable = true;
                  device = "nodev";
                  configurationLimit = 1;
                };
              }
          )
          (
            { pkgs, ... }:
            {
              boot.loader.timeout = 0; # Speed up boot by skipping selection
              zramSwap.enable = true; # Compress memory

              environment.systemPackages = [
                pkgs.mergerfs
              ];

              # First disk is mounted as root file system, include it as data disk
              fileSystems."/mnt/disk0" = {
                device = "/mnt/disk0";
                options = [ "bind" ];
              };

              # Combine all data disks to store container data
              fileSystems."/data" = {
                fsType = "fuse.mergerfs";
                device = "/mnt/disk*";
                depends = [ "/mnt" ];
                options = [
                  # https://trapexit.github.io/mergerfs/quickstart/#configuration
                  "cache.files=auto-full"
                  "category.create=mfs"
                  "func.getattr=newest"
                  "dropcacheonclose=true"
                ];
              };

              fileSystems."/var/lib/nixos-containers" = {
                device = "/data/var/lib/nixos-containers";
                options = [ "bind" ];
              };

              nix = {
                settings = {
                  experimental-features = [
                    "nix-command"
                    "flakes"
                  ];
                  flake-registry = "";
                  accept-flake-config = true;
                };
                optimise.automatic = true;
                channel.enable = false;

                gc = {
                  automatic = true;
                  dates = "01:00";
                  randomizedDelaySec = "5h";
                  options = "--delete-old";
                };
              };

              users.mutableUsers = false;
              users.allowNoPasswordLogin = true;

              networking = {
                hostName = "xnode";
                useDHCP = false;
                useNetworkd = true;
                wireless.iwd = {
                  enable = true;
                };
                firewall = {
                  extraCommands = ''
                    iptables -A INPUT -i vz-+ -p udp -m udp --dport 67 -j ACCEPT
                  '';
                  extraStopCommands = ''
                    iptables -D INPUT -i vz-+ -p udp -m udp --dport 67 -j ACCEPT || true
                  '';
                };
              };

              systemd.network = {
                enable = true;
                wait-online = {
                  timeout = 10;
                  anyInterface = true;
                };
                networks = {
                  "wired" = {
                    matchConfig.Name = "en*";
                    networkConfig = {
                      DHCP = "yes";
                    };
                    dhcpV4Config.RouteMetric = 100;
                    dhcpV6Config.WithoutRA = "solicit";
                  };
                  "wireless" = {
                    matchConfig.Name = "wl*";
                    networkConfig = {
                      DHCP = "yes";
                    };
                    dhcpV4Config.RouteMetric = 200;
                    dhcpV6Config.WithoutRA = "solicit";
                  };
                  "80-container-vz" = {
                    matchConfig = {
                      Kind = "bridge";
                      Name = "vz-*";
                    };
                    networkConfig = {
                      Address = "192.168.0.0/16";
                      LinkLocalAddressing = "yes";
                      DHCPServer = "no";
                      IPMasquerade = "both";
                      LLDP = "yes";
                      EmitLLDP = "customer-bridge";
                      IPv6AcceptRA = "no";
                      IPv6SendRA = "yes";
                    };
                  };
                };
              };

              services.resolved.enable = false;
              services.dnsmasq = {
                enable = true;
                settings = {
                  server = [
                    "1.1.1.1"
                    "8.8.8.8"
                  ];
                  domain-needed = true;
                  bogus-priv = true;
                  no-resolv = true;
                  cache-size = 1000;
                  dhcp-range = [
                    "192.168.0.0,192.168.255.255,255.255.0.0,24h"
                  ];
                  expand-hosts = true;
                  local = "/container/";
                  domain = "container";
                };
              };
            }
          )
          (
            { config, ... }:
            let
              nixosVersion = config.system.nixos.release;
              pinnedVersion =
                if (builtins.pathExists ./state-version) then builtins.readFile ./state-version else "";
            in
            {
              system.stateVersion = if pinnedVersion != "" then pinnedVersion else nixosVersion;

              systemd.services.pin-state-version =
                let
                  nixosConfigDir = "/etc/nixos";
                in
                {
                  wantedBy = [ "multi-user.target" ];
                  description = "Pin state version to first booted NixOS version.";
                  serviceConfig = {
                    Type = "oneshot";
                  };
                  script = ''
                    if [ ! -f \${nixosConfigDir}/state-version ]; then
                      echo -n \${nixosVersion} > \${nixosConfigDir}/state-version
                    fi
                  '';
                };
            }
          )
          inputs.disko.nixosModules.default
          ./disko-config.nix
          inputs.nixos-facter-modules.nixosModules.facter
          { config.facter.reportPath = ./facter.json; }
          inputs.xnode-manager.nixosModules.default
          inputs.xnode-manager.nixosModules.reverse-proxy
          inputs.xnode-auth.nixosModules.default
          (
            let
              xnode-owner = if (builtins.pathExists ./xnode-owner) then builtins.readFile ./xnode-owner else "";
              domain = if (builtins.pathExists ./domain) then builtins.readFile ./domain else "";
              acme-email = if (builtins.pathExists ./acme-email) then builtins.readFile ./acme-email else "";
            in
            { config, lib, ... }:
            {
              services.xnode-manager = {
                enable = true;
              };

              security.acme = {
                acceptTerms = true;
                defaults.email = if (acme-email != "") then acme-email else "xnode@openmesh.network";
              };

              systemd.services."acme-manager.xnode.local".script = lib.mkForce ''echo "selfsigned only"'';
              services.xnode-reverse-proxy = {
                enable = true;
                rules = builtins.listToAttrs (
                  builtins.map (domain: {
                    name = domain;
                    value = [
                      { forward = "http://127.0.0.1:\${builtins.toString config.services.xnode-manager.port}"; }
                    ];
                  }) ([ "manager.xnode.local" ] ++ (lib.optionals (domain != "") [ domain ]))
                );
              };

              services.xnode-auth = {
                enable = true;
                domains = lib.mkIf (xnode-owner != "") (
                  builtins.listToAttrs (
                    builtins.map (domain: {
                      name = domain;
                      value = {
                        accessList."\${xnode-owner}" = { };
                      };
                    }) ([ "manager.xnode.local" ] ++ (lib.optionals (domain != "") [ domain ]))
                  )
                );
              };
            }
          )
          (
            let
              user-passwd = if (builtins.pathExists ./user-passwd) then builtins.readFile ./user-passwd else "";
            in
            { config, lib, ... }:
            lib.mkIf (user-passwd != "") {
              # No user-passwd disables password authentication entirely
              users.users.xnode = {
                initialPassword = user-passwd;
                isNormalUser = true;
                extraGroups = [
                  "wheel"
                ];
              };

              services.getty = {
                greetingLine = ''<<< Welcome to Openmesh XnodeOS \${config.system.nixos.label} (\m) - \l >>>'';
              };
            }
          )
          (
            # START USER CONFIG
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
# END USER CONFIG
          )
        ];
      };
    };
}`,
                                  update_inputs: [],
                                  as_child: true,
                                });

                                const migratedXnode = {
                                  owner: address,
                                  secure: !xnode.insecure
                                    ? xnode.domain
                                    : undefined,
                                  insecure: xnode.insecure
                                    ? xnode.domain
                                    : undefined,
                                  loginArgs: {
                                    user: address,
                                    signature,
                                    timestamp: messageTimestamp.toString(),
                                  },
                                } as Xnode;

                                setSettings({
                                  ...settings,
                                  xnodes: settings.xnodes.map((x) =>
                                    (x as any) === xnode ? migratedXnode : x
                                  ),
                                });
                              };

                              migrate()
                                .catch(console.error)
                                .finally(() => setBusy(false));
                            },
                            onCancel() {
                              setLogin(undefined);
                            },
                          });
                        }}
                      >
                        Migrate
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
            </div>
          ) : (
            <Alert>
              <AlertTitle>No Xnodes requiring migration found.</AlertTitle>
              <AlertDescription>
                Your Xnodes are saved in your browser cache and linked to the
                currently connected wallet. In case you are accessing from a
                different browser or device, please import your Xnodes.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="flex flex-col gap-1 md:max-w-96">
          <span>Import Node</span>
          <div className="flex">
            <Label htmlFor="xnode-domain">IP / Domain</Label>
            <Input
              id="xnode-domain"
              className="bg-white"
              value={domain}
              onChange={(e) =>
                setDomain(e.target.value.replace("https://", ""))
              }
            />
          </div>
          <Button
            onClick={() => {
              toast("Please sign login message in your wallet.");
              const message = "Create Xnode Manager session";
              signMessageAsync({
                message,
              }).then(async (sig) => {
                const signer = await recoverMessageAddress({
                  message,
                  signature: sig,
                });
                const insecure = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
                setSettings({
                  ...settings,
                  xnodes: [
                    ...settings.xnodes,
                    {
                      domain,
                      insecure,
                      owner: address,
                    },
                  ],
                  wallets: {
                    ...(settings as any).wallets,
                    [toXnodeAddress({ address: signer })]: sig,
                  },
                } as any);
                setDomain("");
              });
            }}
            disabled={!address}
          >
            Import
          </Button>
        </div>
      </div>
      {login && <LoginXnode {...login} />}
      <AlertDialog open={busy}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Performing action...</AlertDialogTitle>
            <AlertDialogDescription className="flex gap-1 place-items-center">
              <Hourglass />
              <span>Please wait. Do not refresh the page.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
