import { HardwareProduct } from "@/lib/hardware";
import { useState } from "react";
import axios, { AxiosError } from "axios";

function getCloudInit({ owner }: { owner: string }) {
  return `#cloud-config\nruncmd:\n - export XNODE_OWNER="${owner}" && curl https://raw.githubusercontent.com/Openmesh-Network/xnode-manager/main/os/install.sh | bash 2>&1 | tee /tmp/xnodeos.log`;
}

function getErrorMessage(err: any) {
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

  return errorMessage;
}

export function useProvision() {
  const [provisioning, setProvisioning] = useState<boolean>(false);

  async function provisionHardware({
    hardware,
    paymentPeriod,
    debouncedApiKey,
    extraStorage,
    owner,
  }: {
    hardware: HardwareProduct;
    paymentPeriod: string;
    debouncedApiKey: string;
    extraStorage: number;
    owner: string;
  }): Promise<
    | { type: "error"; errorMessage: string }
    | { type: "success"; ipAddress: string; deploymentAuth: string }
  > {
    setProvisioning(true);
    try {
      const cloudInit = getCloudInit({ owner });

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
              }/`,
              method: "POST",
              body: JSON.stringify({
                osName: `Ubuntu 24.04${
                  hardware.type === "VPS" ? " (VPS)" : ""
                }`,
                hostname: "xnode.openmesh.network",
                script: cloudInit,
                period: paymentPeriod === "yearly" ? "annually" : paymentPeriod,
                locationName: dataCenter,
                productId: productId,
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

        while (!ipAddress || ipAddress === "0.0.0.0") {
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

        if (extraStorage > 0) {
          await axios.get("/api/hivelocity/rewrite", {
            params: {
              path: "v2/vps/volume",
              method: "POST",
              body: JSON.stringify({
                deviceId: machine.deviceId,
                size: extraStorage,
              }),
            },
            headers: {
              "X-API-KEY": debouncedApiKey,
            },
          });
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
              }`,
              method: "POST",
              body: JSON.stringify({
                region: regionId,
                plan: planId,
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

        while (!ipAddress || ipAddress === "0.0.0.0") {
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
      } else if (hardware.providerName === "Hetzner") {
        const productInfo = hardware.id.split("_");
        const productName = productInfo[0];
        const locationName = productInfo[1];
        const machine = await axios
          .get("/api/hetzner/rewrite", {
            params: {
              path: "v1/servers/",
              method: "POST",
              body: JSON.stringify({
                name: "xnode.openmesh.network",
                location: locationName,
                server_type: productName,
                image: "ubuntu-24.04",
                user_data: cloudInit,
                public_net: {
                  enable_ipv4: true,
                  enable_ipv6: true,
                },
              }),
            },
            headers: {
              Authorization: `Bearer ${debouncedApiKey}`,
            },
          })
          .then(
            (res) =>
              res.data.server as {
                id: number;
                public_net?: { ipv4?: { ip?: string } };
              }
          );
        ipAddress = machine.public_net?.ipv4?.ip as string;
        deploymentAuth = `servers/${machine.id}`;

        while (!ipAddress || ipAddress === "0.0.0.0") {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const updatedMachine = await axios
            .get("/api/hetzner/rewrite", {
              params: {
                path: `v1/${deploymentAuth}`,
                method: "GET",
              },
              headers: {
                Authorization: `Bearer ${debouncedApiKey}`,
              },
            })
            .then(
              (res) =>
                res.data.server as {
                  id: number;
                  public_net?: { ipv4?: { ip?: string } };
                }
            );
          ipAddress = updatedMachine.public_net?.ipv4?.ip as string;
        }
      } else if (hardware.providerName === "CherryServers") {
        const teams = await axios
          .get("/api/cherry-servers/rewrite", {
            params: {
              path: "v1/teams",
              method: "GET",
            },
            headers: {
              Authorization: `Bearer ${debouncedApiKey}`,
            },
          })
          .then((res) => res.data as { id: number; name: string }[]);
        const team =
          teams.find((team) => team.name == "Openmesh Network") ??
          (await axios
            .get("/api/cherry-servers/rewrite", {
              params: {
                path: "v1/teams",
                method: "POST",
                body: JSON.stringify({
                  name: "Openmesh Network",
                }),
              },
              headers: {
                Authorization: `Bearer ${debouncedApiKey}`,
              },
            })
            .then(
              (res) =>
                res.data as {
                  id: number;
                  name: string;
                }
            ));
        if (!team) {
          return { type: "error", errorMessage: "No Team" };
        }
        const projects = await axios
          .get("/api/cherry-servers/rewrite", {
            params: {
              path: `v1/teams/${team.id}/projects`,
              method: "GET",
            },
            headers: {
              Authorization: `Bearer ${debouncedApiKey}`,
            },
          })
          .then((res) => res.data as { id: number; name: string }[]);
        const project =
          projects.find((project) => project.name == "Xnode") ??
          (await axios
            .get("/api/cherry-servers/rewrite", {
              params: {
                path: `v1/teams/${team.id}/projects`,
                method: "POST",
                body: JSON.stringify({
                  name: "Xnode",
                }),
              },
              headers: {
                Authorization: `Bearer ${debouncedApiKey}`,
              },
            })
            .then(
              (res) =>
                res.data as {
                  id: number;
                  name: string;
                }
            ));
        if (!project) {
          return { type: "error", errorMessage: "No Project" };
        }

        const productInfo = hardware.id.split("_");
        const productSlug = productInfo[0];
        const regionSlug = productInfo[1];
        const machine = await axios
          .get("/api/cherry-servers/rewrite", {
            params: {
              path: `v1/projects/${project.id}/servers`,
              method: "POST",
              body: JSON.stringify({
                plan: productSlug,
                image: "ubuntu_24_04_64bit",
                region: regionSlug,
                user_data: Buffer.from(cloudInit).toString("base64"),
                cycle: paymentPeriod === "yearly" ? "annually" : paymentPeriod,
              }),
            },
            headers: {
              Authorization: `Bearer ${debouncedApiKey}`,
            },
          })
          .then(
            (res) =>
              res.data as {
                id: number;
              }
          );
        deploymentAuth = `servers/${machine.id}`;

        while (!ipAddress || ipAddress === "0.0.0.0") {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const updatedMachine = await axios
            .get("/api/cherry-servers/rewrite", {
              params: {
                path: `v1/${deploymentAuth}/ips?type=primary-ip`,
                method: "GET",
              },
              headers: {
                Authorization: `Bearer ${debouncedApiKey}`,
              },
            })
            .then((res) => res.data as { address: string }[]);
          ipAddress = updatedMachine.at(0)?.address as string;
        }
      }

      return {
        type: "success",
        ipAddress,
        deploymentAuth: `${hardware.providerName}::${deploymentAuth}`,
      };
    } catch (err: any) {
      return { type: "error", errorMessage: getErrorMessage(err) };
    } finally {
      setProvisioning(false);
    }
  }

  async function resetHardware({
    deploymentAuth,
    debouncedApiKey,
    owner,
  }: {
    deploymentAuth: string;
    debouncedApiKey: string;
    owner: string;
  }): Promise<{ type: "error"; errorMessage: string } | { type: "success" }> {
    setProvisioning(true);
    try {
      const split = deploymentAuth.split("::");
      const provider = split[0];
      const url = split[1];
      const cloudInit = getCloudInit({ owner });

      if (provider === "Hivelocity") {
        // Turn device off
        let power: "ON" | "OFF" = "ON";
        const deviceId = url.split("/")[1];
        await axios.get("/api/hivelocity/rewrite", {
          params: {
            path: `v2/device/${deviceId}/power?action=shutdown`,
            method: "POST",
          },
          headers: {
            "X-API-KEY": debouncedApiKey,
          },
        });
        while (power !== "OFF") {
          await new Promise((resolve) => setTimeout(resolve, 3000)); //2 sec
          power = await axios
            .get("/api/hivelocity/rewrite", {
              params: {
                path: `v2/device/${deviceId}/power`,
                method: "GET",
              },
              headers: {
                "X-API-KEY": debouncedApiKey,
              },
            })
            .then((res) => res.data as { powerStatus: "ON" | "OFF" })
            .then((data) => data.powerStatus);
        }

        // Reload
        await axios.get("/api/hivelocity/rewrite", {
          params: {
            path: `v2/${url}`,
            method: "PUT",
            body: JSON.stringify({
              osName: `Ubuntu 24.04${url.includes("compute") ? " (VPS)" : ""}`,
              hostname: "xnode.openmesh.network",
              script: cloudInit,
              forceReload: true,
            }),
          },
          headers: {
            "X-API-KEY": debouncedApiKey,
          },
        });
      }

      return { type: "success" };
    } catch (err: any) {
      return { type: "error", errorMessage: getErrorMessage(err) };
    } finally {
      setProvisioning(false);
    }
  }

  return { provisioning, provisionHardware, resetHardware };
}
