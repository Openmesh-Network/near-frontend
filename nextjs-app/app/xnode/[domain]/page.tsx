import { XnodeDetailed } from "@/components/xnode/xnode-detailed";
import React from "react";

export default function XnodePage({ params }: { params: { domain?: string } }) {
  return <XnodeDetailed domain={params.domain} />;
}
