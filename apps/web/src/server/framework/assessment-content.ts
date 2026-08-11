/**
 * Plain-language guidance for the control-assessment UX (see chat §D-F: "plain-language question
 * + why this matters + what good looks like + evidence examples per control"). Pure, no DB.
 *
 * Templated per dimension (policy/procedure/implementation/effectiveness) and interpolated with
 * the control's own title/category, rather than hand-authored per individual control — the control
 * library has dozens of controls across categories, and inventing specific regulatory or
 * operational detail for each one this app has no source data for would violate the same "never
 * fabricate a value" rule the rest of this app follows. What's here is genuinely generic guidance
 * on what each maturity dimension means, not a claim of control-specific expertise.
 */

export type AssessmentDimension = "policy" | "procedure" | "implementation" | "effectiveness";

export interface AssessmentGuidance {
  question: string;
  whyItMatters: string;
  whatGoodLooksLike: string;
  evidenceExamples: string[];
}

export function getAssessmentGuidance(
  control: { title: string; category: string | null },
  dimension: AssessmentDimension,
): AssessmentGuidance {
  const subject = control.category ? `${control.title} (${control.category})` : control.title;

  switch (dimension) {
    case "policy":
      return {
        question: `Is there a documented policy or standard covering "${control.title}"?`,
        whyItMatters:
          "A written policy is the starting point for consistent, auditable practice — without one, whether this is handled well depends entirely on who happens to be on shift.",
        whatGoodLooksLike:
          "A dated, approved policy or standard exists, is accessible to the people who need it, and is reviewed on a defined cycle.",
        evidenceExamples: [
          "The approved policy/standard document itself",
          "Approval sign-off or version history showing it's current",
          "Where the policy is published/accessible to staff",
        ],
      };
    case "procedure":
      return {
        question: `Are there step-by-step procedures for how "${subject}" is carried out day to day?`,
        whyItMatters:
          "A policy states intent; a procedure tells someone exactly what to do. Gaps between the two are where incidents happen.",
        whatGoodLooksLike:
          "Clear, current step-by-step procedures exist, are consistent with the policy above, and are written for the people who actually perform the work.",
        evidenceExamples: [
          "The procedure/SOP document, checklist, or work instruction",
          "Sign-in sheets or briefing records showing the procedure was communicated",
        ],
      };
    case "implementation":
      return {
        question: `Is "${subject}" actually being carried out in practice, not just documented?`,
        whyItMatters:
          "A procedure that exists on paper but isn't followed provides no real protection — this dimension asks what's actually happening, not what's written down.",
        whatGoodLooksLike:
          "Observable evidence that staff are trained on and following the procedure — inspection records, training logs, or direct observation showing consistent practice.",
        evidenceExamples: [
          "Training/competence records for the people who perform this work",
          "Inspection, audit, or spot-check records",
          "Photos or logs from routine checks",
        ],
      };
    case "effectiveness":
      return {
        question: `Is "${subject}" actually reducing risk — does it work?`,
        whyItMatters:
          "Effort and paperwork aren't the goal — a control that's followed exactly as written but still doesn't prevent harm needs to be redesigned, not just re-audited.",
        whatGoodLooksLike:
          "A track record showing the control prevents or reduces the harm it targets — few or no related incidents, corrective actions closed out and verified, or a measurable trend improvement.",
        evidenceExamples: [
          "Incident trend data related to this control",
          "Closed-out CAPA/corrective actions with verification evidence",
          "Audit findings showing sustained conformance over time",
        ],
      };
  }
}
