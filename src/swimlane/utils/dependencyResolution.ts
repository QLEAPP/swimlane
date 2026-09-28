import { IProcessStep } from '../models/IProcessStep';

export interface IResolvedEdge {
  fromRowId: string;
  toRowId: string;
  token: string; // the raw DependsOn token that produced this edge, e.g. "9.6.1.1-3" - used as the edgeLabels key
  label?: string;
}

/**
 * CONFIRMED: DependsOn tokens (e.g. "9.6.1.1-3") reference a row by its
 * position in the source data, not a Process Step ID - the trailing
 * number is a spreadsheet row number with the header counted as row 1, so
 * the first data row is row 2, the second is row 3, and so on.
 *
 * IMPORTANT: `steps` must be in original source order (unfiltered) for
 * this numbering to be correct - row numbers are meaningless once rows
 * have been reordered or filtered out. Resolve edges once against the
 * full dataset immediately after loading, then let the rendering layer
 * decide which resolved edges have both endpoints currently visible.
 */
export function resolveDependencyEdges(orderedSteps: IProcessStep[]): IResolvedEdge[] {
  const rowNumberToIndex = new Map<number, number>();
  orderedSteps.forEach((_step, idx) => {
    rowNumberToIndex.set(idx + 2, idx); // idx 0 -> row 2 (header is row 1)
  });

  const edges: IResolvedEdge[] = [];
  orderedSteps.forEach((step, idx) => {
    step.dependsOn.forEach(token => {
      const match = /(\d+)\s*$/.exec(token);
      if (!match) return;
      const targetIdx = rowNumberToIndex.get(parseInt(match[1], 10));
      if (targetIdx === undefined || targetIdx === idx) {
        return; // unresolved token, or a row referencing itself
      }
      edges.push({
        fromRowId: orderedSteps[targetIdx].id,
        toRowId: step.id,
        token,
        label: step.edgeLabels && step.edgeLabels[token] ? step.edgeLabels[token] : undefined
      });
    });
  });
  return edges;
}

/**
 * Row number (header counted as row 1) for a step's position in the FULL
 * unfiltered dataset - the same numbering resolveDependencyEdges itself
 * uses. Shared by the add-step form and the edit panel so both convert a
 * human's "depends on" pick into a raw DependsOn token the exact same way.
 */
export function rowNumberForStepId(allSteps: IProcessStep[], stepId: string): number | undefined {
  const idx = allSteps.findIndex(s => s.id === stepId);
  return idx === -1 ? undefined : idx + 2;
}

export function stepIdForRowNumber(allSteps: IProcessStep[], rowNumber: number): string | undefined {
  return allSteps[rowNumber - 2]?.id;
}

/** Human-picked "depends on" step IDs -> raw DependsOn row-number tokens. */
export function stepIdsToDependsOnTokens(allSteps: IProcessStep[], stepIds: string[]): string[] {
  return stepIds
    .map(id => rowNumberForStepId(allSteps, id))
    .filter((n): n is number => n !== undefined)
    .map(n => String(n));
}

/** Raw DependsOn tokens -> the step IDs they resolve to (for pre-populating a picker from existing data). */
export function dependsOnTokensToStepIds(allSteps: IProcessStep[], tokens: string[]): string[] {
  const ids: string[] = [];
  tokens.forEach(token => {
    const match = /(\d+)\s*$/.exec(token);
    if (!match) return;
    const stepId = stepIdForRowNumber(allSteps, parseInt(match[1], 10));
    if (stepId) ids.push(stepId);
  });
  return ids;
}

/**
 * ProcessStepForm's inline branch-label draft (see
 * edgeLabelsByDependsOnId there) -> the real, token-keyed edgeLabels
 * shape IProcessStep actually stores - a token isn't knowable until the
 * dependency is resolved against the full step list, so this can't
 * happen until save time. Shared by every place that saves a step
 * (add-step, edit panel, new-process) so the conversion can't drift
 * between them.
 */
export function buildEdgeLabels(allSteps: IProcessStep[], edgeLabelsByDependsOnId: { [stepId: string]: string }): { [token: string]: string } {
  const edgeLabels: { [token: string]: string } = {};
  Object.entries(edgeLabelsByDependsOnId).forEach(([stepId, label]) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const rowNumber = rowNumberForStepId(allSteps, stepId);
    if (rowNumber !== undefined) edgeLabels[String(rowNumber)] = trimmed;
  });
  return edgeLabels;
}

/** Reverse of buildEdgeLabels - pre-populates the edit panel's draft from a step's existing edgeLabels. */
export function edgeLabelsToDependsOnDraft(allSteps: IProcessStep[], edgeLabels: { [token: string]: string } | undefined): { [stepId: string]: string } {
  const draft: { [stepId: string]: string } = {};
  Object.entries(edgeLabels || {}).forEach(([token, label]) => {
    const match = /(\d+)\s*$/.exec(token);
    if (!match) return;
    const stepId = stepIdForRowNumber(allSteps, parseInt(match[1], 10));
    if (stepId) draft[stepId] = label;
  });
  return draft;
}

/**
 * Options for a "depends on" picker: every step, labeled by its Process
 * Step ID and a truncated description so two steps with the same wording
 * elsewhere are still distinguishable. Shared by the add-step form and
 * the edit panel - `excludeStepId` leaves out the step being edited
 * (nothing to add for a brand-new step being created).
 */
export function buildDependsOnOptions(allSteps: IProcessStep[], excludeStepId?: string): Array<{ key: string; text: string }> {
  const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  return allSteps
    .filter(s => s.id !== excludeStepId)
    .map(s => ({ key: s.id, text: `${s.processStepId} — ${truncate(s.actionDescription, 50)}` }));
}

/**
 * Every outgoing edge from a decision must have a visible label (confirmed
 * design rule) - flags edges that need one.
 */
export function findUnlabeledDecisionEdges(steps: IProcessStep[], edges: IResolvedEdge[], getShapeType: (step: IProcessStep) => string): IResolvedEdge[] {
  const stepById = new Map(steps.map(s => [s.id, s]));
  return edges.filter(edge => {
    const fromStep = stepById.get(edge.fromRowId);
    if (!fromStep) return false;
    return getShapeType(fromStep) === 'decision' && !edge.label;
  });
}
