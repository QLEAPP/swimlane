import { IProcessStep } from '../models/IProcessStep';

export interface IResolvedEdge {
  fromRowId: string;
  toRowId: string;
  token: string; // the raw DependsOn token that produced this edge, e.g. "9.6.1.1-3" - used as the edgeLabels key
  label?: string;
}

/**
 * Two DependsOn token formats exist side by side:
 *
 * - STABLE (written by the app since 2026-10-20): "[198]" - the referenced
 *   step's own SharePoint item id, which never changes or gets reused.
 * - LEGACY (the original source data, CSV files, and anything written
 *   before then): e.g. "9.6.1.1-3" - CONFIRMED a row number (position in
 *   the full, unfiltered dataset, header counted as row 1, so the first
 *   data row is row 2), not a Process Step ID.
 *
 * Legacy tokens broke whenever a step was deleted (confirmed real bug,
 * 2026-10-20): every later row moved up one, but tokens kept pointing at
 * the old numbers, so arrows and Yes/No labels silently re-attached to
 * the wrong steps. Every write now produces stable tokens; legacy ones
 * are still READ correctly until convertLegacyTokens rewrites them (see
 * the one-time "Convert links" action in SwimlaneStudio.tsx). Brackets,
 * not e.g. "#198", deliberately - an older copy of the app still open in
 * a tab parses trailing digits as a row number, so "#198" would have been
 * misread as row 198 there; "[198]" just reads as unresolved instead.
 *
 * Every function that turns a token into a step MUST go through
 * resolveTokenToStepId rather than parsing digits itself, or it'll
 * misread a stable token as a row number.
 */
export const stableToken = (stepId: string): string => `[${stepId}]`;

export function isStableToken(token: string): boolean {
  return /^\[.+\]$/.test(token.trim());
}

/**
 * `allSteps` must be the full unfiltered dataset in original load order -
 * required for legacy row-number tokens (row numbers are meaningless once
 * rows have been reordered or filtered out); stable tokens don't care.
 */
export function resolveTokenToStepId(allSteps: IProcessStep[], token: string): string | undefined {
  const trimmed = token.trim();
  const stable = /^\[(.+)\]$/.exec(trimmed);
  if (stable) {
    return allSteps.some(s => s.id === stable[1]) ? stable[1] : undefined;
  }
  const match = /(\d+)\s*$/.exec(trimmed);
  return match ? stepIdForRowNumber(allSteps, parseInt(match[1], 10)) : undefined;
}

/**
 * Resolve edges once against the full dataset (see resolveTokenToStepId),
 * then let the rendering layer decide which resolved edges have both
 * endpoints currently visible.
 */
export function resolveDependencyEdges(orderedSteps: IProcessStep[]): IResolvedEdge[] {
  const edges: IResolvedEdge[] = [];
  orderedSteps.forEach(step => {
    step.dependsOn.forEach(token => {
      const fromRowId = resolveTokenToStepId(orderedSteps, token);
      if (!fromRowId || fromRowId === step.id) {
        return; // unresolved token, or a row referencing itself
      }
      edges.push({
        fromRowId,
        toRowId: step.id,
        token,
        label: step.edgeLabels && step.edgeLabels[token] ? step.edgeLabels[token] : undefined
      });
    });
  });
  return edges;
}

/**
 * Rewrites every legacy row-number token on `step` (DependsOn and the
 * matching Edge Labels keys) to its stable equivalent, resolved against
 * `allSteps` exactly as it's drawn right now. Unresolvable legacy tokens
 * are left untouched rather than dropped - they already draw nothing, and
 * keeping them means nothing is lost if it turns out they mattered.
 * Returns undefined when there's nothing to convert.
 */
export function convertLegacyTokens(allSteps: IProcessStep[], step: IProcessStep): IProcessStep | undefined {
  const tokenMap = new Map<string, string>();
  step.dependsOn.forEach(token => {
    if (isStableToken(token)) return;
    const resolvedId = resolveTokenToStepId(allSteps, token);
    if (resolvedId) tokenMap.set(token, stableToken(resolvedId));
  });
  if (tokenMap.size === 0) return undefined;
  const edgeLabels: { [token: string]: string } = {};
  Object.entries(step.edgeLabels || {}).forEach(([token, label]) => {
    edgeLabels[tokenMap.get(token) || token] = label;
  });
  return {
    ...step,
    dependsOn: step.dependsOn.map(token => tokenMap.get(token) || token),
    edgeLabels: Object.keys(edgeLabels).length > 0 ? edgeLabels : undefined
  };
}

/**
 * Undo of a delete re-creates the step under a NEW SharePoint id, so
 * stable tokens that pointed at the old one would otherwise stay dangling
 * and the arrows into/out of it would never come back. Rewrites every
 * "[oldId]" token (and its Edge Labels key) to "[newId]" per `idMap`;
 * returns only the steps that actually changed.
 */
export function remapStableTokens(steps: IProcessStep[], idMap: Map<string, string>): IProcessStep[] {
  const remap = (token: string): string => {
    const stable = /^\[(.+)\]$/.exec(token.trim());
    const newId = stable ? idMap.get(stable[1]) : undefined;
    return newId ? stableToken(newId) : token;
  };
  return steps
    .filter(step => step.dependsOn.some(token => remap(token) !== token))
    .map(step => {
      const edgeLabels: { [token: string]: string } = {};
      Object.entries(step.edgeLabels || {}).forEach(([token, label]) => { edgeLabels[remap(token)] = label; });
      return {
        ...step,
        dependsOn: step.dependsOn.map(remap),
        edgeLabels: Object.keys(edgeLabels).length > 0 ? edgeLabels : undefined
      };
    });
}

/** Every step in `allSteps` that still has at least one convertible legacy token, already converted. */
export function findStepsNeedingTokenConversion(allSteps: IProcessStep[]): IProcessStep[] {
  return allSteps
    .map(step => convertLegacyTokens(allSteps, step))
    .filter((s): s is IProcessStep => !!s);
}

/**
 * Row number (header counted as row 1) for a step's position in the FULL
 * unfiltered dataset - legacy token numbering only (see the format note on
 * stableToken). Still needed for CSV export and for bulk creates, where
 * the new steps' ids aren't known until after they exist.
 */
export function rowNumberForStepId(allSteps: IProcessStep[], stepId: string): number | undefined {
  const idx = allSteps.findIndex(s => s.id === stepId);
  return idx === -1 ? undefined : idx + 2;
}

export function stepIdForRowNumber(allSteps: IProcessStep[], rowNumber: number): string | undefined {
  return allSteps[rowNumber - 2]?.id;
}

/**
 * Human-picked "depends on" step IDs -> stable DependsOn tokens. Shared by
 * the add-step form and the edit panel so both convert a pick the exact
 * same way.
 */
export function stepIdsToDependsOnTokens(allSteps: IProcessStep[], stepIds: string[]): string[] {
  return stepIds
    .filter(id => allSteps.some(s => s.id === id))
    .map(stableToken);
}

/** DependsOn tokens (either format) -> the step IDs they resolve to (for pre-populating a picker from existing data). */
export function dependsOnTokensToStepIds(allSteps: IProcessStep[], tokens: string[]): string[] {
  return tokens
    .map(token => resolveTokenToStepId(allSteps, token))
    .filter((id): id is string => !!id);
}

/**
 * ProcessStepForm's inline branch-label draft (see
 * edgeLabelsByDependsOnId there) -> the real, token-keyed edgeLabels
 * shape IProcessStep actually stores - a token isn't knowable until the
 * dependency is resolved against the full step list, so this can't
 * happen until save time. Shared by every place that saves a step
 * (add-step, edit panel, new-process) so the conversion can't drift
 * between them.
 *
 * Only keeps labels for steps still in `dependsOnStepIds` - confirmed real
 * bug (2026-10-20): un-picking a dependency left its "Yes"/"No" behind in
 * the draft and it got saved anyway, so re-linking the same two steps
 * later brought the old label straight back. Saving through here also
 * clears any such leftover label already sitting in the data.
 */
export function buildEdgeLabels(
  allSteps: IProcessStep[],
  edgeLabelsByDependsOnId: { [stepId: string]: string },
  dependsOnStepIds: string[]
): { [token: string]: string } {
  const edgeLabels: { [token: string]: string } = {};
  Object.entries(edgeLabelsByDependsOnId).forEach(([stepId, label]) => {
    const trimmed = label.trim();
    if (!trimmed || !dependsOnStepIds.includes(stepId)) return;
    if (allSteps.some(s => s.id === stepId)) edgeLabels[stableToken(stepId)] = trimmed;
  });
  return edgeLabels;
}

/** Reverse of buildEdgeLabels - pre-populates the edit panel's draft from a step's existing edgeLabels. */
export function edgeLabelsToDependsOnDraft(allSteps: IProcessStep[], edgeLabels: { [token: string]: string } | undefined): { [stepId: string]: string } {
  const draft: { [stepId: string]: string } = {};
  Object.entries(edgeLabels || {}).forEach(([token, label]) => {
    const stepId = resolveTokenToStepId(allSteps, token);
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
