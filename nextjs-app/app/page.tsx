import { Section } from "@/components/text";
import { DeployXnode } from "@/components/xnode/deploy-xnode";
import { ImportXnode } from "@/components/xnode/import-xnode";
import { MyXnodes } from "@/components/xnode/my-xnodes";
import { Cpu } from "lucide-react";
import Link from "next/link";
import React from "react";

export default function IndexPage() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="My NEAR Nodes">
        <div className="flex flex-col gap-2">
          <div className="flex gap-3 items-center">
            <DeployXnode />
            <span>or</span>
            <ImportXnode />
          </div>
          <MyXnodes />
        </div>
      </Section>
      <div className="w-full flex fixed bottom-2 place-content-center">
        <Link href="https://www.openmesh.network/Xnodepage" target="_blank">
          <div className="flex gap-1 bg-[#0c2246d6] text-white rounded-lg px-2 py-1">
            <Cpu />
            <span>Powered by Xnode</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
