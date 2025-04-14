import { Hex, parseSignature, toBytes } from "viem";
import axios, { AxiosInstance } from "axios";
import https from "https";

export enum Scope {
  Processes = "Processes",
  ResourceUsage = "ResourceUsage",
  OS = "OS",
  Config = "Config",
}

export interface Session {
  axiosInstance: AxiosInstance;
  baseUrl: string;
}

export interface CPUUsage {
  name: string;
  used: number;
  frequency: number;
}

export interface MemoryUsage {
  used: number;
  total: number;
}

export interface DiskUsage {
  mount_point: string;
  used: number;
  total: number;
}

export interface OS {
  flake: string;
  flake_lock: string;

  xnode_owner?: string;
  domain?: string;
  acme_email?: string;
  user_passwd?: string;
}

export interface OSChange {
  flake?: string;
  update_inputs?: string[];

  xnode_owner?: string;
  domain?: string;
  acme_email?: string;
  user_passwd?: string;

  as_child: boolean;
}

export type Container = string;

export interface ContainerConfiguration {
  flake: string;
  flake_lock: string;
}

export interface ContainerSettings {
  flake: string;
}

export type ConfigurationAction =
  | {
      Set: {
        container: string;
        settings?: ContainerSettings;
        update_inputs?: string[];
      };
    }
  | {
      Remove: {
        container: string;
        backup: boolean;
      };
    };

export interface Process {
  name: string;
  description: string;
  running: boolean;
}

export interface Log {
  timestamp: number;
  message:
    | {
        type: "string";
        string: String;
      }
    | {
        type: "bytes";
        bytes: number[];
      };
}

export interface File {
  content: string;
}

export interface Directory {
  directories: string[];
  files: string[];
  symlinks: string[];
  unknown: string[];
}

export async function login({
  domain,
  insecure,
  sig,
}: {
  domain: string;
  insecure?: boolean;
  sig: Hex;
}): Promise<Session> {
  const axiosInstance = axios.create({
    // httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Allow self-signed certificates (for "recovery mode", no secrets should be shared from the client)
    withCredentials: true, // Store cookies
  });
  const prefix = insecure ? "xnode-forward-insecure" : "xnode-forward";
  const baseUrl = `/${prefix}/${domain}`;

  const signature = parseSignature(sig);
  await axiosInstance.post(`${baseUrl}/auth/login`, {
    login_method: {
      WalletSignature: {
        v: signature.yParity,
        r: [...toBytes(signature.r)],
        s: [...toBytes(signature.s)],
      },
    },
  });

  return { axiosInstance, baseUrl };
}

export async function scopes({
  session,
}: {
  session: Session;
}): Promise<Scope[]> {
  return session.axiosInstance
    .get(`${session.baseUrl}/auth/scopes`)
    .then((res) => res.data as Scope[]);
}

export async function cpuUsage({
  session,
}: {
  session: Session;
}): Promise<CPUUsage[]> {
  return session.axiosInstance
    .get(`${session.baseUrl}/usage/cpu`)
    .then((res) => res.data as CPUUsage[]);
}

export async function memoryUsage({
  session,
}: {
  session: Session;
}): Promise<MemoryUsage> {
  return session.axiosInstance
    .get(`${session.baseUrl}/usage/memory`)
    .then((res) => res.data as MemoryUsage);
}

export async function diskUsage({
  session,
}: {
  session: Session;
}): Promise<DiskUsage[]> {
  return session.axiosInstance
    .get(`${session.baseUrl}/usage/disk`)
    .then((res) => res.data as DiskUsage[])
    .then((disk) => disk.filter((d) => d.mount_point.startsWith("/mnt")));
}

export async function getOS({ session }: { session: Session }): Promise<OS> {
  return session.axiosInstance
    .get(`${session.baseUrl}/os/get`)
    .then((res) => res.data as OS);
}

export async function setOS({
  session,
  os,
}: {
  session: Session;
  os: OSChange;
}): Promise<void> {
  return session.axiosInstance.post(`${session.baseUrl}/os/set`, os);
}

export async function getContainers({
  session,
}: {
  session: Session;
}): Promise<Container[]> {
  return session.axiosInstance
    .get(`${session.baseUrl}/config/containers`)
    .then((res) => res.data as Container[]);
}

export async function getContainerConfig({
  session,
  containerId,
}: {
  session: Session;
  containerId: string;
}): Promise<ContainerConfiguration> {
  return session.axiosInstance
    .get(`${session.baseUrl}/config/container/${containerId}`)
    .then((res) => res.data as ContainerConfiguration);
}

export async function changeConfig({
  session,
  changes,
}: {
  session: Session;
  changes: ConfigurationAction[];
}): Promise<void> {
  return session.axiosInstance.post(
    `${session.baseUrl}/config/change`,
    changes
  );
}

export async function getProcesses({
  session,
  containerId,
}: {
  session: Session;
  containerId: string;
}): Promise<Process[]> {
  return session.axiosInstance
    .get(`${session.baseUrl}/process/list/${containerId}`)
    .then((res) => res.data as Process[]);
}

export async function getLogs({
  session,
  containerId,
  process,
}: {
  session: Session;
  containerId: string;
  process: string;
}): Promise<Log[]> {
  return session.axiosInstance
    .get(`${session.baseUrl}/process/logs/${containerId}/${process}`)
    .then(
      (res) =>
        res.data as {
          timestamp: number;
          message: any;
        }[]
    )
    .then((data) =>
      data.map((log) => {
        return {
          timestamp: log.timestamp,
          message: log.message.UTF8
            ? {
                type: "string",
                string: log.message.UTF8.string,
              }
            : {
                type: "bytes",
                bytes: log.message.Raw.bytes,
              },
        };
      })
    );
}

export async function getFile({
  session,
  location,
}: {
  session: Session;
  location: {
    containerId: string;
    path: string;
  };
}): Promise<File> {
  return session.axiosInstance
    .post(`${session.baseUrl}/file/read_file`, {
      location: {
        container: location.containerId,
        path: location.path.substring(1), // Remove first /
      },
    })
    .then((res) => res.data as { content: number[] })
    .then((file) => {
      return { ...file, content: Buffer.from(file.content).toString("utf-8") };
    });
}

export async function removeFile({
  session,
  location,
}: {
  session: Session;
  location: {
    containerId: string;
    path: string;
  };
}): Promise<File> {
  return session.axiosInstance.post(`${session.baseUrl}/file/remove_file`, {
    location: {
      container: location.containerId,
      path: location.path.substring(1), // Remove first /
    },
  });
}

export async function getDirectory({
  session,
  location,
}: {
  session: Session;
  location: {
    containerId: string;
    path: string;
  };
}): Promise<Directory> {
  return session.axiosInstance
    .post(`${session.baseUrl}/file/read_directory`, {
      location: {
        container: location.containerId,
        path: location.path.substring(1), // Remove first /
      },
    })
    .then((res) => res.data as Directory);
}

export async function removeDirectory({
  session,
  location,
  make_empty,
}: {
  session: Session;
  location: {
    containerId: string;
    path: string;
  };
  make_empty: boolean;
}): Promise<File> {
  return session.axiosInstance.post(
    `${session.baseUrl}/file/remove_directory`,
    {
      location: {
        container: location.containerId,
        path: location.path.substring(1), // Remove first /
      },
      make_empty,
    }
  );
}
