/**
 * The real "Control Register" SharePoint list - CONFIRMED 2026-09-08,
 * columns given directly by the user (not yet cross-checked against a
 * live screenshot the way Risk Register's original columns were, but the
 * same standard of confidence as every other user-stated real-schema fact
 * in this app): Control ID, Risk ID, Risk Statement, Control Description,
 * Control Owner, Control Type, Execution Method, Frequency, Evidence,
 * Status, Design Effective?, Operating Effective?, Function, Link Key,
 * Mapping Notes.
 *
 * A standing enterprise register this app doesn't own, but can add new
 * rows to - same deliberate exception as Risk Register (see
 * IDataService.addControlStatement).
 *
 * Risk ID/Risk Statement here are free text meant to match Risk
 * Register's OWN "Risk ID"/"Risk Statement" columns (see
 * ControlLinkPicker) - NOT the SharePoint item id IRiskStatement.id uses
 * for its own linking. Risk Register's own schema comment already flags
 * "Risk ID" as often blank in practice on THAT list; the same caveat
 * applies here, so a Control that doesn't textually match any Risk simply
 * won't appear when narrowing by Function -> Risk in the picker.
 *
 * Link Key - CONFIRMED 2026-09-08 at the user's request: holds a step's
 * Process Step ID (e.g. "9.6.1.1"), the same identifier used everywhere
 * else in this app (DependsOn, the canvas columns) - NOT
 * IProcessStep.uniqueId. This is how a Control ties to a specific step;
 * unlike Risk (which stores its links AS AN ARRAY on the step itself, see
 * IProcessStep.linkedRisks), a Control can only ever point at ONE step at
 * a time, because Link Key is a single value on the Control's own row,
 * not a list. Setting it is a write to Control Register, not to the
 * Process Steps list - see IDataService.setControlLinkKey.
 */
export interface IControlStatement {
  id: string; // SharePoint list item ID
  controlId: string; // the "Control ID" text column - display only, not the linking key
  riskId: string; // "Risk ID" text - matched against IRiskStatement.riskId, see interface comment above
  riskStatement: string;
  controlDescription: string;
  controlOwner: string;
  controlType: string;
  executionMethod: string;
  frequency: string;
  evidence: string;
  status: string;
  designEffective: string; // "Design Effective?" column, e.g. "Yes"/"No"
  operatingEffective: string; // "Operating Effective?" column, e.g. "Yes"/"No"
  function: string; // "Function" column - added 2026-09-08, what ControlLinkPicker narrows by first
  linkKey: string; // "Link Key" - see interface comment above; '' means not linked to any step
  mappingNotes: string;
}

/**
 * Auto-generates the next Control ID for a NEWLY created control (e.g.
 * "CTL-003" following "CTL-002") - added 2026-09-15 at the user's request,
 * same reasoning and pattern as nextRiskId in IRiskStatement.ts: a real,
 * unique, system-assigned ID rather than one someone could mistype, leave
 * blank, or collide with another row. No Category-like field exists on
 * Control to derive a varying prefix from the way Risk ID's does, so this
 * is one flat "CTL-" sequence rather than several scoped ones.
 */
export function nextControlId(controls: Array<{ controlId: string }>): string {
  const pattern = /^CTL-(\d+)$/;
  const max = controls.reduce((acc, c) => {
    const match = pattern.exec((c.controlId || '').trim());
    return match ? Math.max(acc, parseInt(match[1], 10)) : acc;
  }, 0);
  return `CTL-${String(max + 1).padStart(3, '0')}`;
}
