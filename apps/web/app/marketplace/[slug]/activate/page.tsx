import { notFound } from "next/navigation";
import { getDefinition } from "@platform/catalog";
import ActivateWizard from "./wizard";

export default async function ActivatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = getDefinition(slug);
  if (!def) notFound();
  // Serialize only what the client wizard needs (schema→UI, Decision 003 §1).
  return (
    <ActivateWizard
      slug={def.slug}
      name={def.name}
      configFields={def.definition.configFields}
      sampleMessages={def.definition.sampleMessages}
    />
  );
}
