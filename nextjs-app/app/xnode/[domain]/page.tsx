import { XnodeDetailed } from "@/components/xnode/xnode-detailed";
import React from "react";

export default async function XnodePage({
  params,
}: {
  params: Promise<{ domain?: string }>;
}) {
  return <XnodeDetailed domain={(await params).domain} />;
}
