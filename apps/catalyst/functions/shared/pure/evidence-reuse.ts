/**
 * Pure computation for the evidence-reuse summary shown on a document's detail page — "this
 * document supports N controls across M frameworks" — so reviewers can see reuse at a glance
 * instead of scrolling a raw link list. Deliberately only counts what the data actually shows:
 * a control_assessment link that doesn't resolve to a known control/framework mapping is not
 * guessed at, it just doesn't contribute to the control/framework counts.
 */
export interface EvidenceReuseSummary {
  totalLinks: number;
  distinctEntityTypes: number;
  distinctControls: number;
  distinctFrameworks: number;
}

export function computeEvidenceReuseSummary(params: {
  links: { linkedEntityType: string; linkedEntityId: string }[];
  controlAssessmentControlIds: Map<string, string>;
  controlFrameworkIds: Map<string, string[]>;
}): EvidenceReuseSummary {
  const { links, controlAssessmentControlIds, controlFrameworkIds } = params;

  const distinctEntityTypes = new Set(links.map((l) => l.linkedEntityType)).size;

  const controlIds = new Set<string>();
  const frameworkIds = new Set<string>();
  for (const link of links) {
    if (link.linkedEntityType !== "control_assessment") continue;
    const controlId = controlAssessmentControlIds.get(link.linkedEntityId);
    if (!controlId) continue;
    controlIds.add(controlId);
    for (const fwId of controlFrameworkIds.get(controlId) ?? []) {
      frameworkIds.add(fwId);
    }
  }

  return {
    totalLinks: links.length,
    distinctEntityTypes,
    distinctControls: controlIds.size,
    distinctFrameworks: frameworkIds.size,
  };
}
