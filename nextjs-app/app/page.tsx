import { Section } from "@/components/text";
import { DeployXnode } from "@/components/xnode/deploy-xnode";
import { ImportXnode } from "@/components/xnode/import-xnode";
import { MyXnodes } from "@/components/xnode/my-xnodes";
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
    </div>
  );
}
