import { NextRequest } from 'next/server'
import axios, { AxiosError } from 'axios'

export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get('path')
    if (!path) {
      throw new Error('Missing path param.')
    }

    const method = req.nextUrl.searchParams.get('method') || 'GET'

    const body = req.nextUrl.searchParams.get('body')

    const res = await axios({
      method: method,
      url: `https://core.hivelocity.net/api/${path}`,
      data: body ? JSON.parse(body) : undefined,
      headers: {
        'X-API-KEY': req.headers.get('X-API-KEY'),
      },
    })
    return Response.json(res.data, { status: res.status })
  } catch (err: any) {
    if (err instanceof AxiosError) {
      return Response.json(
        { error: err.response?.data ?? err.toJSON() },
        { status: err.status }
      )
    }
    return Response.json({ error: err?.message ?? err }, { status: 500 })
  }
}
