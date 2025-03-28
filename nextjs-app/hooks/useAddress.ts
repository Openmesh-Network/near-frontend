import { useMemo } from "react";
import { useAccount } from "wagmi";

export function toXnodeAddress({ address }: { address: string }): string {
  return `eth:${address.replace("0x", "").toLowerCase()}`;
}

export function useAddress() {
  const { address } = useAccount();

  const processedAddress = useMemo(() => {
    if (!address) {
      return undefined;
    } else return toXnodeAddress({ address });
  }, [address]);

  return processedAddress;
}
