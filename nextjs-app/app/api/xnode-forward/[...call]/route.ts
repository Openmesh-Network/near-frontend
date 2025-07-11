// No domain requests require a forward proxy

import { Agent, request } from "undici";

export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;

async function handler(req: Request) {
  const headers = new Headers(req.headers);
  headers.set("Host", "manager.xnode.local");

  const res = await request(
    `https://${req.url.split("/xnode-forward/").at(1)}`,
    {
      method: req.method,
      body: await req.bytes(),
      headers,
      dispatcher: new Agent({ connect: { rejectUnauthorized: false } }), // Accept self-signed certificates
    }
  );

  return new Response(await res.body.bytes(), {
    headers: new Headers(
      Object.entries(res.headers).map(([key, value]) => [key, `${value}`])
    ),
    status: res.statusCode,
  });
}
