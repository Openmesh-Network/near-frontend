export type Specs = {
  // cores: number
  ram: number;
  storage: number;
};

export interface HardwareProduct {
  type: "VPS" | "Bare Metal";
  id: string;
  available: number;
  productName: string;
  providerName: string;
  location: string;
  price: { [duration: string]: number | undefined };
  cpu: { cores: number; threads?: number; ghz?: number; name?: string };
  ram: { capacity: number; ghz?: number };
  storage: { capacity: number; type?: string }[];
  gpu: { vram: number; type?: string }[];
  network: { speed?: number; max_usage?: number };
}

export interface AdditionalStorage {
  price: { [duration: string]: number | undefined };
  size: number;
}

export function getSummary({ hardware }: { hardware: HardwareProduct }) {
  let summary = "";
  if (hardware.cpu.name) summary += `${hardware.cpu.name}: `;
  if (hardware.cpu.ghz) summary += `${hardware.cpu.ghz}GHz `;
  if (hardware.cpu.cores) summary += `${hardware.cpu.cores}-Core`;
  if (hardware.cpu.threads) summary += ` (${hardware.cpu.threads} threads)`;
  if (hardware.ram.capacity) summary += `, ${hardware.ram.capacity}GB RAM`;
  if (hardware.ram.ghz) summary += ` ${hardware.ram.ghz}GHz`;
  if (hardware.storage.length) {
    summary += `, ${hardware.storage.reduce(
      (prev, cur) => prev + cur.capacity,
      0
    )} GB Storage (`;
    const drives = hardware.storage
      .map((drive) => {
        let driveDescription = `${drive.capacity} GB`;
        if (drive.type) {
          driveDescription += ` ${drive.type}`;
        }
        return driveDescription;
      })
      .reduce((prev, cur) => {
        prev[cur] = (prev[cur] ?? 0) + 1;
        return prev;
      }, {} as { [driveDescription: string]: number });
    Object.keys(drives).forEach((driveDescription, i) => {
      if (i > 0) {
        summary += ", ";
      }
      summary += `${drives[driveDescription]}x ${driveDescription}`;
    });
    summary += ")";
  }
  if (hardware.network.speed)
    summary += `, ${hardware.network.speed} Gbps Networking`;
  if (hardware.network.max_usage)
    summary += `, ${hardware.network.max_usage} GB Bandwidth`;
  if (hardware.gpu.length) {
    summary += `, ${hardware.gpu[0].vram}GB VRAM ${
      hardware.gpu[0].type ? ` (${hardware.gpu[0].type})` : ""
    }`;
  }
  return summary;
}
