import { Xnode } from "@/components/context/settings";

export function getBaseUrl({ xnode }: { xnode?: Xnode }): string | undefined {
  if (!xnode) {
    return undefined;
  }

  return xnode.secure
    ? `https://${xnode.secure}`
    : `/api/xnode-forward/${xnode.insecure}`; // No domain requests require a forward proxy
}
