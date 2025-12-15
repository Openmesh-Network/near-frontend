import { NextRequest } from "next/server";

import type { HardwareProduct } from "@/lib/hardware";

interface CherryServersProduct {
  id: number;
  href: string;
  name: string;
  slug: string;
  title: string;
  type: "baremetal" | "vps";
  category: string;
  specs: {
    cpus: {
      count: number;
      name: string;
      cores: number;
      frequency: number;
      unit: "GHz";
    };
    memory: { count: number; total: number; unit: "GB" | "TB"; name: string };
    storage: {
      count: number;
      name: string;
      size: number;
      unit: "GB" | "TB";
      type: "SSD" | "NVME" | "HDD";
    }[];
    nics: { name: `${number}Gbps` | `${number}Mbps` };
    bandwidth: { name: `${number}TB` };
  };
  pricing: {
    id: number;
    unit: "Hourly" | "Monthly" | "Quarterly" | "Semiannually" | "Annually";
    price: number;
    currency: "EUR";
    taxed: false;
  }[];
  available_regions: {
    id: 1;
    name: string;
    region_iso_2: string;
    stock_qty: number;
    spot_qty: number;
    slug: string;
    bgp: {
      hosts: string[];
      asn: number;
    };
    location: string;
  }[];
}

// Add this export to prevent prerendering
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest) {
  const rawInventory: CherryServersProduct[] = [];
  await Promise.all([
    fetch(
      "https://api.cherryservers.com/v1/plans?fields=plan,specs,pricing,region"
    )
      .then((res) => res.json())
      .then((data) => rawInventory.push(...data)),
  ]);
  const eurToUsd = await fetch(
    `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD`
  )
    .then((resp) => resp.json())
    .then((data) => data.rates.USD as number);
  const inventory: HardwareProduct[] = rawInventory.flatMap((product) => {
    return product.available_regions.map((region) => {
      const id = `${product.slug}_${region.slug}`;
      const drives = product.specs.storage.flatMap((storage) =>
        new Array(storage.count).fill({
          capacity: storage.unit === "TB" ? storage.size * 1024 : storage.size,
          type: storage.type,
        })
      );
      const city = region.location.split(", ").at(1);
      let hourly = product.pricing.find((price) => price.unit === "Hourly");
      let monthly = product.pricing.find((price) => price.unit === "Monthly");
      let quarterly = product.pricing.find(
        (price) => price.unit === "Quarterly"
      );
      let yearly = product.pricing.find((price) => price.unit === "Annually");
      return {
        type: product.type.includes("vps") ? "VPS" : "Bare Metal",
        available: region.stock_qty,
        cpu: {
          cores: product.specs.cpus.cores,
          ghz:
            product.specs.cpus.frequency !== 0
              ? product.specs.cpus.frequency
              : undefined,
          name: product.specs.cpus.name.includes("vCores")
            ? undefined
            : product.specs.cpus.name,
        },
        id: id,
        location: city
          ? `${city}, ${region.region_iso_2}`
          : region.region_iso_2,
        network: {
          speed: product.specs.nics.name.endsWith("Mbps")
            ? parseInt(product.specs.nics.name.replace("Mbps", "")) / 1000
            : parseInt(product.specs.nics.name.replace("Gbps", "")),
          max_usage:
            parseInt(product.specs.bandwidth.name.replace("TB", "")) * 1024,
        },
        price: {
          hourly: hourly ? hourly.price * 1.27 * eurToUsd : undefined, // adjust for VAT (assumed 27%)
          monthly: monthly ? monthly.price * 1.27 * eurToUsd : undefined, // adjust for VAT (assumed 27%)
          quarterly: quarterly ? quarterly.price * 1.27 * eurToUsd : undefined, // adjust for VAT (assumed 27%)
          yearly: yearly ? yearly.price * 1.27 * eurToUsd : undefined, // adjust for VAT (assumed 27%)
        },
        productName: product.name,
        providerName: "CherryServers",
        ram: {
          capacity:
            product.specs.memory.unit === "TB"
              ? product.specs.memory.total * 1024
              : product.specs.memory.total,
        },
        storage: drives,
        gpu: [],
      };
    });
  });
  return Response.json(inventory);
}

/*
Example

{
  "id": 86,
  "href": "/plans/e3-1240v3",
  "name": "E3-1240v3",
  "slug": "e3-1240v3",
  "title": "E3-1240v3",
  "type": "baremetal",
  "category": "lightweight",
  "specs": {
    "cpus": {
      "count": 1,
      "name": "E3-1240v3",
      "cores": 4,
      "frequency": 3.4,
      "unit": "GHz"
    },
    "memory": {
      "count": 1,
      "total": 16,
      "unit": "GB",
      "name": "16GB ECC DDRIII "
    },
    "storage": [
      {
        "count": 1,
        "name": "SSD 250GB",
        "size": 250,
        "unit": "GB",
        "type": "SSD"
      }
    ],
    "nics": {
      "name": "1Gbps"
    },
    "bandwidth": {
      "name": "30TB"
    }
  },
  "pricing": [
    {
      "id": 3,
      "unit": "Monthly",
      "price": 49,
      "currency": "EUR",
      "taxed": false
    },
    {
      "id": 4,
      "unit": "Quarterly",
      "price": 139.65,
      "currency": "EUR",
      "taxed": false
    },
    {
      "id": 5,
      "unit": "Semiannually",
      "price": 264.6,
      "currency": "EUR",
      "taxed": false
    },
    {
      "id": 6,
      "unit": "Annually",
      "price": 499.8,
      "currency": "EUR",
      "taxed": false
    },
    {
      "id": 37,
      "unit": "Hourly",
      "price": 0.084,
      "currency": "EUR",
      "taxed": false
    },
    {
      "id": 38,
      "unit": "Spot hourly",
      "price": 0.0671,
      "currency": "EUR",
      "taxed": false
    }
  ],
  "available_regions": [
    {
      "id": 1,
      "name": "Lithuania",
      "region_iso_2": "LT",
      "stock_qty": 31,
      "spot_qty": 10,
      "slug": "LT-Siauliai",
      "bgp": {
        "hosts": [
          "46.166.166.122",
          "46.166.166.123"
        ],
        "asn": 16125
      },
      "location": "Lithuania, Šiauliai"
    }
  ]
}

  */
