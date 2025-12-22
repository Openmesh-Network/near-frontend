import { NextRequest } from "next/server";
import axios, { AxiosError } from "axios";

export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path");
    if (!path) {
      throw new Error("Missing path param.");
    }

    const method = req.nextUrl.searchParams.get("method") || "GET";

    const body = req.nextUrl.searchParams.get("body");
    const parsedBody = body ? JSON.parse(body) : undefined;
    if (
      method === "POST" &&
      path.startsWith("v1/projects/") &&
      (path.endsWith("/servers") || path.endsWith("/servers/")) &&
      parsedBody?.plan === "B2-6-6gb-100s-shared" &&
      parsedBody?.cycle === "monthly"
    ) {
      parsedBody.discount = process.env.CHERRYSERVERS_DISCOUNT_CODE;
    }

    const res = await axios({
      method: method,
      url: `https://api.cherryservers.com/${path}`,
      data: parsedBody,
      headers: {
        Authorization: req.headers.get("Authorization"),
      },
    });
    return Response.json(res.data, { status: res.status });
  } catch (err: any) {
    if (err instanceof AxiosError) {
      return Response.json(
        { error: err.response?.data ?? err.toJSON() },
        { status: err.status }
      );
    }
    return Response.json({ error: err?.message ?? err }, { status: 500 });
  }
}
