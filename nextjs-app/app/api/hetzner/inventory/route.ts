import { NextRequest } from "next/server";

import type { HardwareProduct } from "@/lib/hardware";

interface HetznerProduct {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  prices: {
    location: string;
    price_hourly: {
      net: string;
      gross: string;
    };
    price_monthly: {
      net: string;
      gross: string;
    };
    included_traffic: number;
    price_per_tb_traffic: {
      net: string;
      gross: string;
    };
  }[];
  storage_type: "local" | "network";
  cpu_type: "shared" | "dedicated";
  category: string;
  architecture: "x86" | "arm";
  locations: [
    {
      id: number;
      name: string;
      deprecation?: {
        unavailable_after: string;
        announced: string;
      };
    }
  ];
}

interface HetznerLocation {
  id: number;
  name: string;
  description: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  network_zone: string;
}

async function getHetznerPaging(url: string, resultKey: string) {
  const results: any[] = [];
  const baseUrl = `${url}?per_page=50`;
  let nextUrl: string | undefined = baseUrl;
  while (nextUrl) {
    const res: any = await fetch(nextUrl, {
      headers: [["Authorization", `Bearer ${process.env.HETZNER_API_KEY}`]],
    }).then((res) => res.json());
    console.log({ res, HETZNER_API_KEY: process.env.HETZNER_API_KEY });
    results.push(...res[resultKey]);
    nextUrl = res.meta.pagination.next_page
      ? `${baseUrl}&page=${res.meta.pagination.next_page}`
      : undefined;
  }
  return results;
}

// Add this export to prevent prerendering
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest) {
  const rawInventory: HetznerProduct[] = [];
  const locations: HetznerLocation[] = [];
  await Promise.all([
    getHetznerPaging(
      "https://api.hetzner.cloud/v1/server_types",
      "server_types"
    ).then((plans) => rawInventory.push(...plans)),
    getHetznerPaging(
      "https://api.hetzner.cloud/v1/locations",
      "locations"
    ).then((regions) => locations.push(...regions)),
  ]);
  const inventory: HardwareProduct[] = rawInventory
    .filter((product) => product.architecture === "x86")
    .flatMap((product) => {
      return product.prices.map((price) => {
        const id = `${product.name}_${price.location}`;
        const location = locations.find((l) => l.name === price.location);
        return {
          type: product.cpu_type === "shared" ? "VPS" : "Bare Metal",
          available: product.locations.find((l) => l.name === price.location)
            ?.deprecation
            ? 0
            : 1_000_000_000,
          cpu: {
            cores: product.cores,
          },
          id: id,
          location: location
            ? `${location.city}, ${location.country}`
            : price.location,
          network: {
            max_usage: price.included_traffic / (1024 * 1024 * 1024),
          },
          price: {
            hourly: (parseFloat(price.price_hourly.net) + 0.001) * 1.27, // Add ipv4 cost + adjust for VAT (assumed 27%)
            monthly: (parseFloat(price.price_monthly.net) + 0.6) * 1.27, // Add ipv4 cost + adjust for VAT (assumed 27%)
          },
          productName: product.name,
          providerName: "Hetzner",
          ram: {
            capacity: product.memory,
          },
          storage: [{ capacity: product.disk }],
          gpu: [],
        };
      });
    });
  return Response.json(inventory);
}

/*
Example

{
  "id": 1,
  "name": "cpx11",
  "description": "CPX11",
  "cores": 2,
  "memory": 2,
  "disk": 40,
  "deprecated": false,
  "prices": [
    {
      "location": "fsn1",
      "price_hourly": {
        "net": "1.0000",
        "gross": "1.1900"
      },
      "price_monthly": {
        "net": "1.0000",
        "gross": "1.1900"
      },
      "included_traffic": 654321,
      "price_per_tb_traffic": {
        "net": "1.0000",
        "gross": "1.1900"
      }
    }
  ],
  "storage_type": "local",
  "cpu_type": "shared",
  "category": "Shared vCPU",
  "architecture": "x86",
  "deprecation": {
    "unavailable_after": "2023-09-01T00:00:00+00:00",
    "announced": "2023-06-01T00:00:00+00:00"
  },
  "locations": [
    {
      "id": 42,
      "name": "fsn1",
      "deprecation": {
        "unavailable_after": "2023-09-01T00:00:00+00:00",
        "announced": "2023-06-01T00:00:00+00:00"
      }
    }
  ]
}

{
  "id": 42,
  "name": "fsn1",
  "description": "Falkenstein DC Park 1",
  "country": "DE",
  "city": "Falkenstein",
  "latitude": 50.47612,
  "longitude": 12.370071,
  "network_zone": "eu-central"
}

  */
