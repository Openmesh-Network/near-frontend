import { Section } from "@/components/text";
import { MigrateXnodes } from "@/components/xnode/migrate-xnodes";

export default async function MigratePage() {
  return (
    <Section title="NEAR Nodes requiring migration">
      <MigrateXnodes />
    </Section>
  );
}
