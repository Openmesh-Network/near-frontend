import { NextRequest } from "next/server";

import type { AdditionalStorage } from "@/lib/hardware";

interface HivelocityStorage {
  volumeProducts: {
    monthlyPrice: number;
    size: number;
  }[];
}

// Add this export to prevent prerendering
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest) {
  const rawStorage: HivelocityStorage["volumeProducts"] = [];
  await fetch("https://core.hivelocity.net/api/v2/vps/available-volume-sizes", {
    headers: [
      ["Accept", "application/json"],
      ["X-API-KEY", process.env.HIVELOCITY_API_KEY ?? ""],
    ],
  })
    .then((res) => res.json())
    .then((data) => data as HivelocityStorage)
    .then((data) => {
      rawStorage.push(...data.volumeProducts);
    });
  const additionalStorage: AdditionalStorage[] = rawStorage.map((storage) => {
    return {
      price: { monthly: storage.monthlyPrice },
      size: storage.size,
    };
  });
  return Response.json(additionalStorage);
}

/*
Example

{
  annually_location_premium: 0,
  biennial_location_premium: 0,
  core: true,
  data_center: 'AMS1',
  edge: false,
  hourly_location_premium: 0,
  is_sps: true,
  is_vps: false,
  location_option_id: 144406,
  monthly_location_premium: 0,
  processor_info: { cores: 6, sockets: 1, threads: 12, vcpus: 72 },
  product_annually_price: 68,
  product_bandwidth: '20TB / 1Gbps',
  product_biennial_price: 68,
  product_cpu: 'E-2136 3.3GHz Coffee Lake',
  product_cpu_cores: '<br/>(6 cores/12 threads)',
  product_defaults: {
    '11128': 144206,
    '11130': 142850,
    '11137': 144534,
    '11138': 143117,
    '11139': 142977,
    '11140': 143119,
    '11141': 143120,
    '11144': 143004,
    '11149': 144184,
    '11150': 143129,
    '11151': 143130,
    '11152': 144187,
    '11153': 144186,
    '11164': 143158,
    '11191': 144189,
    '11195': 144319,
    '11198': 144697
  },
  product_disabled_billing_periods: [ 'biennial', 'triennial' ],
  product_display_price: null,
  product_drive: '960GB SSD',
  product_gpu: 'None',
  product_hourly_price: 0.14,
  product_id: 474,
  product_memory: '16GB',
  product_monthly_price: 68,
  product_name: 'ci.nano.s2',
  product_on_sale: true,
  product_original_price: 119,
  product_quarterly_price: 68,
  product_semi_annually_price: 68,
  product_triennial_price: 68,
  quarterly_location_premium: 0,
  semi_annually_location_premium: 0,
  stock: 'unavailable',
  triennial_location_premium: 0
}

{
  "location_option_ids": [
    144188, 145225, 145241, 148980, 149033, 149106, 149123, 149176, 149193,
    149308, 149402, 149434, 142632, 144198
  ],
  "edge": false,
  "location": { "state": "FL", "city": "Tampa", "country": "US" },
  "code": "TPA1",
  "title": "Tampa 1",
  "core": true,
  "id": 3
}
  */
