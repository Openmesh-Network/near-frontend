import { Section } from "@/components/text";
import { TroubleshootXnode } from "@/components/xnode/troubleshoot-xnode";

export default async function TroubleshootPage() {
  return (
    <Section title="Troubleshoot">
      <TroubleshootXnode />
    </Section>
  );
}
