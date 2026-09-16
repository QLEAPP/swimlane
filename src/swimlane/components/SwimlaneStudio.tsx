import * as React from 'react';
import {
  Spinner, MessageBar, MessageBarType, MessageBarButton, DefaultButton, PrimaryButton, IconButton, Pivot, PivotItem,
  Dialog, DialogType, DialogFooter, TextField, Panel, PanelType
} from '@fluentui/react';
import styles from './SwimlaneStudio.module.scss';
import type { ISwimlaneStudioProps } from './ISwimlaneStudioProps';
import { IProcessStep, getProcessId } from '../models/IProcessStep';
import { IEmployee } from '../models/IEmployee';
import { IRiskStatement } from '../models/IRiskStatement';
import { IControlStatement } from '../models/IControlStatement';
import { IProcessGroupLabel } from '../models/IProcessGroupLabel';
import { ICategoryLabel } from '../models/ICategoryLabel';
import { IProcessIdLabel } from '../models/IProcessIdLabel';
import { IProcessIdLock, findActiveLock } from '../models/IProcessIdLock';
import { ISwimlaneComment } from '../models/ISwimlaneComment';
import { ISwimlaneStatus, SwimlaneStage } from '../models/ISwimlaneStatus';
import { resolveDependencyEdges, stepIdsToDependsOnTokens, buildDependsOnOptions } from '../utils/dependencyResolution';
import { computeInsertOrderBefore } from '../utils/columns';
import { buildExportCsv, downloadTextFile } from '../utils/csvExport';
import { ADMIN_UNLOCK_PASSWORD } from '../adminConfig';
import {
  getCategoryId, getProcessGroupId, getCategoryName, getProcessGroupName, getProcessIdName,
  APQC_CATEGORY_NAMES, APQC_PROCESS_GROUP_NAMES, APQC_PROCESS_ID_NAMES
} from '../utils/apqcHierarchy';
import HierarchyPicker from './HierarchyPicker';
import GlobalSearch from './GlobalSearch';
import ProcessStepTabs from './ProcessStepTabs';
import FlowRegionTabs from './FlowRegionTabs';
import EmployeesList from './EmployeesList';
import AddEmployeeModal from './AddEmployeeModal';
import AddRiskModal from './AddRiskModal';
import RiskRegisterList from './RiskRegisterList';
import AddControlModal from './AddControlModal';
import ControlRegisterList from './ControlRegisterList';
import AuditView from './AuditView';
import ImprovementsView from './ImprovementsView';
import SwimlaneComments from './SwimlaneComments';
import SwimlaneCanvas from './SwimlaneCanvas';
import ImportCsvModal from './ImportCsvModal';
import NewProcessModal from './NewProcessModal';
import AddHierarchyShellModal, { HierarchyShellLevel } from './AddHierarchyShellModal';
import AddStepSectionModal from './AddStepSectionModal';
import DuplicateRegionModal from './DuplicateRegionModal';
import ProcessStepForm, { IProcessStepFormValue } from './ProcessStepForm';
import qleLogo from '../../assets/qle-logo.svg';

type MainTab = 'flows' | 'employees' | 'risks' | 'controls' | 'audit' | 'improvements';

// Full multi-level undo stack (changed 2026-09-15 at the user's request -
// was single-level, only ever covering the one most recent action) -
// covers every action that loses data outright: deleting a step,
// bulk-deleting a whole flow or section, editing (which overwrites the
// previous field values), and renaming/renumbering a section (which
// overwrites several steps' values at once - see bulkEdit). Moving a step
// (drag-reorder, drag to a different section, drag to reassign its lane -
// see SwimlaneCanvas) IS covered too, despite looking like a separate
// gesture - onMoveStep is wired straight to handleEditStep below, so a
// drag pushes an ordinary 'edit' entry the same as any other field
// change. Only adding a step isn't covered - a mistaken add is trivial to
// just delete, and unlike the others it hasn't overwritten anything.
// NOTE: undoing a delete re-creates the step via addProcessStep, which
// appends it as a new row rather than reinserting it at its exact
// original position - if another step's DependsOn token referenced it by
// original row number (see dependencyResolution.ts), that link won't
// perfectly restore. Pre-existing limitation of the row-number dependency
// system, not something undo makes worse - deleting already shifts every
// later row's number regardless of whether the delete is later undone.
type UndoAction =
  | { type: 'delete'; step: IProcessStep }
  | { type: 'bulkDelete'; steps: IProcessStep[] }
  | { type: 'edit'; previous: IProcessStep }
  | { type: 'bulkEdit'; previous: IProcessStep[] };

// Shared between the toast banner and the history panel (see
// undoHistoryOpen) so the two can never describe the same entry
// differently.
function describeUndoAction(action: UndoAction): string {
  if (action.type === 'delete') return `Deleted "${action.step.actionDescription}"`;
  if (action.type === 'bulkDelete') return `Deleted ${action.steps.length} step${action.steps.length === 1 ? '' : 's'}`;
  if (action.type === 'edit') return `Updated "${action.previous.actionDescription}"`;
  return `Renamed/renumbered ${action.previous.length} step${action.previous.length === 1 ? '' : 's'}`;
}

// Caps how far back undo can go, same reasoning most editors cap undo
// depth - an unbounded stack would just be a slow memory leak across a
// long editing session most of which will never actually get undone.
const MAX_UNDO_STACK = 20;

// Promise.allSettled gives back whatever the rejection actually was, not
// necessarily an Error instance - GraphDataService rejects with a real
// Error, but this stays safe even if something else throws a plain string.
function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

const emptyStepDraft = (): IProcessStepFormValue => ({
  action: '',
  actionDescription: '',
  actionType: 'Execute (Within Limits)',
  shapeOverride: '',
  responsibleJobTitle: '',
  dependsOnStepIds: [],
  linkedRisks: [],
  sopLink: '',
  delegationOfAuthorityLink: '',
  notes: ''
});

const SwimlaneStudio: React.FC<ISwimlaneStudioProps> = (props) => {
  const { dataService, onSignOut, signOutLabel, currentUserName } = props;

  const [steps, setSteps] = React.useState<IProcessStep[]>([]);
  const [employees, setEmployees] = React.useState<IEmployee[]>([]);
  const [riskStatements, setRiskStatements] = React.useState<IRiskStatement[]>([]);
  const [controlStatements, setControlStatements] = React.useState<IControlStatement[]>([]);
  const [categoryLabels, setCategoryLabels] = React.useState<ICategoryLabel[]>([]);
  const [processGroupLabels, setProcessGroupLabels] = React.useState<IProcessGroupLabel[]>([]);
  const [processIdLabels, setProcessIdLabels] = React.useState<IProcessIdLabel[]>([]);
  const [processIdLocks, setProcessIdLocks] = React.useState<IProcessIdLock[]>([]);
  const [swimlaneComments, setSwimlaneComments] = React.useState<ISwimlaneComment[]>([]);
  const [swimlaneStatuses, setSwimlaneStatuses] = React.useState<ISwimlaneStatus[]>([]);
  // One-shot signal telling SwimlaneCanvas to open a just-created step's
  // edit panel automatically - see handleCreateStepFromShape and the
  // matching prop comment on ISwimlaneCanvasProps.
  const [autoOpenStepId, setAutoOpenStepId] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>(undefined);

  // APQC drill-down: Category (e.g. "9") -> Process Group (e.g. "9.6") ->
  // Process ID (e.g. "9.6.1", the existing swimlane-per-flow level) - see
  // utils/apqcHierarchy.ts. Each level's picker is only reachable once its
  // parent is chosen, and clearing a level clears everything below it.
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | undefined>(undefined);
  const [selectedProcessGroupId, setSelectedProcessGroupId] = React.useState<string | undefined>(undefined);
  const [selectedProcessId, setSelectedProcessId] = React.useState<string | undefined>(undefined);
  const [drilledDownStepId, setDrilledDownStepId] = React.useState<string | undefined>(undefined);
  // Which region's variant of the current Process ID's flow is showing -
  // undefined = "All" regions combined. See FlowRegionTabs for the full
  // reasoning.
  const [selectedFlowRegion, setSelectedFlowRegion] = React.useState<string | undefined>(undefined);

  const [newStepDraft, setNewStepDraft] = React.useState<IProcessStepFormValue>(emptyStepDraft());
  const [saving, setSaving] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [newProcessOpen, setNewProcessOpen] = React.useState(false);
  const [addEmployeeOpen, setAddEmployeeOpen] = React.useState(false);
  const [addRiskOpen, setAddRiskOpen] = React.useState(false);
  const [addControlOpen, setAddControlOpen] = React.useState(false);
  // The lightweight "just name and reserve an ID" flow (see
  // AddHierarchyShellModal) - separate from newProcessOpen, which is the
  // full "create a complete step" flow. idPrefix is the parent ID plus a
  // trailing dot (e.g. "13." when adding a Process Group under Category
  // 13), computed fresh each time it's opened rather than reusing
  // newProcessPrefix so the two flows stay independent.
  const [addShellState, setAddShellState] = React.useState<{ level: HierarchyShellLevel; idPrefix: string } | undefined>(undefined);
  // The lightweight "add a 4th-level section" flow (see
  // AddStepSectionModal) - a real minimal step, not a label-only shell
  // like addShellState above, since a section's name only ever lives on
  // real step rows. true only once a Process ID is actually selected
  // (there's nowhere to add a section before that).
  const [addSectionOpen, setAddSectionOpen] = React.useState(false);
  const [duplicateRegionOpen, setDuplicateRegionOpen] = React.useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  // TEMPORARY - see the interface comment on IDataService.backfillUniqueIds.
  const [backfillDialogOpen, setBackfillDialogOpen] = React.useState(false);
  const [backfilling, setBackfilling] = React.useState(false);
  const [backfillMessage, setBackfillMessage] = React.useState<string | undefined>(undefined);
  const [renameTarget, setRenameTarget] = React.useState<{ level: 'category' | 'processGroup' | 'processId'; id: string; currentLabel: string } | undefined>(undefined);
  const [renameValue, setRenameValue] = React.useState('');
  // Separate from renameTarget/renameValue above - a section isn't a
  // label-list row the way Category/Process Group/Process ID are, it's
  // real step rows (see the comment on ProcessStepTabs'
  // onRenameSection), so saving means a bulk updateProcessStep across
  // every step sharing that Process Step ID, not an add/update against a
  // labels list. Renumbering (editing the ID itself, not just the name)
  // and deleting the whole section added 2026-09-15 at the user's
  // request ("why can't I just delete a section or edit it including
  // numbering") - renameSectionId holds the ID field's current draft
  // value separately from renameSectionTarget.processStepId (the
  // ORIGINAL id being edited, needed to find which steps to update/
  // delete regardless of what the id field is edited to).
  const [renameSectionTarget, setRenameSectionTarget] = React.useState<{ processStepId: string; currentName: string } | undefined>(undefined);
  const [renameSectionId, setRenameSectionId] = React.useState('');
  const [renameSectionValue, setRenameSectionValue] = React.useState('');
  const [deleteSectionConfirmOpen, setDeleteSectionConfirmOpen] = React.useState(false);
  // Which lock dialog is open, if any, and the reason text being typed
  // into it - 'lock' and 'unlock' share one dialog/one reason field since
  // they're never open at the same time.
  const [lockDialogMode, setLockDialogMode] = React.useState<'lock' | 'unlock' | undefined>(undefined);
  const [lockReasonValue, setLockReasonValue] = React.useState('');
  // Only used for unlock, not lock - see ADMIN_UNLOCK_PASSWORD for why
  // this exists and what it actually does/doesn't protect against.
  const [unlockPasswordValue, setUnlockPasswordValue] = React.useState('');
  const [unlockPasswordError, setUnlockPasswordError] = React.useState(false);
  // "Leave a comment" dialog - never gated by activeLock (see
  // ISwimlaneComment), so it's a plain independent boolean rather than
  // sharing lockDialogMode's 'lock' | 'unlock' pattern.
  const [commentDialogOpen, setCommentDialogOpen] = React.useState(false);
  const [commentValue, setCommentValue] = React.useState('');
  // Oldest action first, most recent (what Undo acts on next) last - a
  // real stack, not just the one last action (see the UndoAction comment).
  const [undoStack, setUndoStack] = React.useState<UndoAction[]>([]);
  // Whether the small toast-style banner (see below) is currently showing -
  // separate from undoStack itself (changed 2026-09-16 at the user's
  // request - "allow a history of undo" for "stuff one did that were not
  // supposed to"). The banner still auto-hides a while after the last
  // action so it doesn't linger forever on screen, but the underlying
  // history it was reading from used to get wiped out at the very same
  // moment - meaning noticing a mistake more than ~10s after making it
  // left nothing left to undo. Now only the banner's VISIBILITY times out;
  // the stack itself persists (capped at MAX_UNDO_STACK, same as always)
  // and stays reachable any time via the "Undo history" button.
  const [showUndoBanner, setShowUndoBanner] = React.useState(false);
  const [undoHistoryOpen, setUndoHistoryOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<MainTab>('flows');

  React.useEffect(() => {
    if (undoStack.length === 0) { setShowUndoBanner(false); return; }
    setShowUndoBanner(true);
    const timer = window.setTimeout(() => setShowUndoBanner(false), 10000);
    return () => window.clearTimeout(timer);
  }, [undoStack]);

  const pushUndo = (action: UndoAction): void => {
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO_STACK - 1)), action]);
  };

  // Promise.allSettled, not Promise.all - the three sources are genuinely
  // independent (separate SharePoint lists, each with its own chance of
  // being misconfigured or not existing yet), so one failing (e.g. the
  // Employees list title not confirmed yet) shouldn't block the other two
  // from showing. A real case this fixed: Process steps resolving fine
  // while Employees still 404s would previously blank out the whole app
  // instead of just the Employees-dependent pieces.
  const loadAll = React.useCallback(() => {
    setLoading(true);
    setError(undefined);
    Promise.allSettled([
      dataService.getProcessSteps(), dataService.getEmployees(), dataService.getRiskStatements(), dataService.getControlStatements(),
      dataService.getCategoryLabels(), dataService.getProcessGroupLabels(), dataService.getProcessIdLabels(), dataService.getProcessIdLocks(),
      dataService.getSwimlaneComments(), dataService.getSwimlaneStatuses()
    ])
      .then(([stepsResult, employeesResult, risksResult, controlsResult, categoryLabelsResult, groupLabelsResult, processIdLabelsResult, locksResult, commentsResult, statusesResult]) => {
        const errors: string[] = [];

        if (stepsResult.status === 'fulfilled') {
          setSteps(stepsResult.value);
        } else {
          errors.push(`Process steps: ${describeError(stepsResult.reason)}`);
        }

        if (employeesResult.status === 'fulfilled') {
          setEmployees(employeesResult.value);
        } else {
          errors.push(`Employees: ${describeError(employeesResult.reason)}`);
        }

        if (risksResult.status === 'fulfilled') {
          setRiskStatements(risksResult.value);
        } else {
          errors.push(`Risk statements: ${describeError(risksResult.reason)}`);
        }

        if (controlsResult.status === 'fulfilled') {
          setControlStatements(controlsResult.value);
        } else {
          errors.push(`Control statements: ${describeError(controlsResult.reason)}`);
        }

        // Same "nice to have, not a blocking error" treatment as
        // groupLabelsResult below - most sites won't have this list
        // created yet, and every category it would name already has a
        // working fallback (the static table, or just "Category N").
        if (categoryLabelsResult.status === 'fulfilled') {
          setCategoryLabels(categoryLabelsResult.value);
        }

        // Not surfaced as an error - this list is a nice-to-have that most
        // sites won't have created yet, and every group it would name
        // already has a working fallback (the static table, or just
        // "Process Group X.Y"), so a missing/misconfigured list here
        // shouldn't read as something broken the way the other three do.
        if (groupLabelsResult.status === 'fulfilled') {
          setProcessGroupLabels(groupLabelsResult.value);
        }

        if (processIdLabelsResult.status === 'fulfilled') {
          setProcessIdLabels(processIdLabelsResult.value);
        }

        // Same "nice to have, not a blocking error" treatment as the label
        // lists above, for the same reason (this list won't exist on most
        // sites yet). Deliberate trade-off: a failure here means locks are
        // treated as "nothing is locked" rather than making the whole app
        // unusable - reasonable given locking is a v1, anyone-signed-in
        // social control (see IProcessIdLock), not a hard permission
        // system, but worth knowing this is fail-open, not fail-closed.
        if (locksResult.status === 'fulfilled') {
          setProcessIdLocks(locksResult.value);
        }

        // Same fail-open treatment as locks/labels above - a missing
        // "Swimlane status" list means every swimlane is treated as its
        // default Draft rather than blocking the app.
        if (statusesResult.status === 'fulfilled') {
          setSwimlaneStatuses(statusesResult.value);
        }

        // Same fail-open treatment as locks/labels above - a missing
        // "Swimlane comments" list means comments are treated as "none
        // posted yet" rather than blocking the app.
        if (commentsResult.status === 'fulfilled') {
          setSwimlaneComments(commentsResult.value);
        }

        setError(errors.length > 0 ? errors.join(' | ') : undefined);
        setLoading(false);
      });
  }, [dataService]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  // Same idea, one level up - user-added names for Categories the static
  // apqcHierarchy.ts table doesn't already cover (see ICategoryLabel).
  const customCategoryNames = React.useMemo(
    () => Object.fromEntries(categoryLabels.map(l => [l.categoryId, l.name])) as Record<string, string>,
    [categoryLabels]
  );

  // User-added names for Process Groups the static apqcHierarchy.ts table
  // doesn't already cover (see IProcessGroupLabel) - merged in wherever a
  // Process Group name is looked up or listed, same as the static table.
  const customGroupNames = React.useMemo(
    () => Object.fromEntries(processGroupLabels.map(l => [l.groupId, l.name])) as Record<string, string>,
    [processGroupLabels]
  );

  // Same idea as customGroupNames, one level down - a name for a Progress
  // ID that has no real steps yet to derive one from (see getLabel on the
  // Process ID HierarchyPicker below, which otherwise falls back to a
  // real step's processDescription or the static APQC table).
  const customProcessIdNames = React.useMemo(
    () => Object.fromEntries(processIdLabels.map(l => [l.processId, l.name])) as Record<string, string>,
    [processIdLabels]
  );

  const stepsInCategory = React.useMemo(
    () => selectedCategoryId ? steps.filter(s => getCategoryId(s.processStepId) === selectedCategoryId) : [],
    [steps, selectedCategoryId]
  );

  const stepsInProcessGroup = React.useMemo(
    () => selectedProcessGroupId ? stepsInCategory.filter(s => getProcessGroupId(s.processStepId) === selectedProcessGroupId) : [],
    [stepsInCategory, selectedProcessGroupId]
  );

  const stepsInProcessId = React.useMemo(
    () => selectedProcessId ? steps.filter(s => getProcessId(s.processStepId) === selectedProcessId) : [],
    [steps, selectedProcessId]
  );

  // The readable name for wherever the header breadcrumb is currently
  // pointing - the breadcrumb itself stays the compact numeric trail
  // ("9 / 9.2 / 9.2.3") since that's genuinely useful for quick reference,
  // but showing ONLY numbers up there left no way to tell at a glance
  // which actual swimlane is open without drilling back down through the
  // pickers - a real user flagged this directly. Same name-resolution
  // logic each picker level already uses - a custom label (an explicit,
  // deliberate rename) always wins over a step's own processDescription,
  // not the other way around, so a wrong/junk value that ended up in real
  // data (e.g. someone typing "yes" into the wrong field) can always be
  // corrected via rename instead of being permanently stuck showing.
  const currentLevelName = React.useMemo(() => {
    if (drilledDownStepId) {
      return stepsInProcessId.find(s => s.processStepId === drilledDownStepId)?.processStepName;
    }
    if (selectedProcessId) {
      return customProcessIdNames[selectedProcessId] || stepsInProcessId[0]?.processDescription || getProcessIdName(selectedProcessId);
    }
    if (selectedProcessGroupId) {
      return customGroupNames[selectedProcessGroupId] || getProcessGroupName(selectedProcessGroupId);
    }
    if (selectedCategoryId) {
      return getCategoryName(selectedCategoryId);
    }
    return undefined;
  }, [drilledDownStepId, selectedProcessId, selectedProcessGroupId, selectedCategoryId, stepsInProcessId, customGroupNames, customProcessIdNames]);

  // Same resolution as currentLevelName's own selectedProcessId branch,
  // but WITHOUT the drilledDownStepId override - this always names the
  // process itself (e.g. "Process accounts payable (AP)"), never a single
  // step's own name, since it's used to pre-fill/suggest context when
  // creating a new Control inline (see ControlLinkPicker) and to match
  // against Risk Register's own "Process" column for narrowing which
  // Risks are offered there.
  const currentProcessDescription = React.useMemo(
    () => selectedProcessId
      ? customProcessIdNames[selectedProcessId] || stepsInProcessId[0]?.processDescription || getProcessIdName(selectedProcessId)
      : '',
    [selectedProcessId, stepsInProcessId, customProcessIdNames]
  );

  // The lock currently in effect for the swimlane actually on screen right
  // now (this Process ID + this region), if any - undefined means it's
  // editable. Scoped to processId+region together, not just processId,
  // matching the confirmed design rule that regions are genuinely separate
  // swimlanes (see IProcessIdLock/FlowRegionTabs) - locking the UK
  // version of a flow never touches the US/SA versions on the same
  // Process ID.
  const activeLock = React.useMemo(
    () => selectedProcessId ? findActiveLock(processIdLocks, selectedProcessId, selectedFlowRegion) : undefined,
    [processIdLocks, selectedProcessId, selectedFlowRegion]
  );

  // Same processId + region scoping as activeLock above. Undefined means
  // no one has ever explicitly set a stage for this swimlane - treated as
  // Draft by default (see ISwimlaneStatus) rather than requiring an
  // explicit initial record before the badge can show anything.
  const activeStatus = React.useMemo(
    () => (selectedProcessId
      ? swimlaneStatuses.find(s => s.processId === selectedProcessId && s.region === (selectedFlowRegion || ''))
      : undefined),
    [swimlaneStatuses, selectedProcessId, selectedFlowRegion]
  );
  const currentStage: SwimlaneStage = activeStatus?.stage || 'Draft';

  // Same processId + region scoping as activeLock above - only the
  // comments that actually belong to the swimlane currently on screen,
  // not every comment ever left anywhere (that's what the separate
  // Improvements tab is for).
  const commentsForSwimlane = React.useMemo(
    () => selectedProcessId
      ? swimlaneComments.filter(c => c.processId === selectedProcessId && c.region === (selectedFlowRegion || ''))
      : [],
    [swimlaneComments, selectedProcessId, selectedFlowRegion]
  );

  // A Process ID can hold several genuinely separate swimlanes side by
  // side, one per region (see FlowRegionTabs) - narrowed here, upstream of
  // everything else derived from stepsInProcessId, so picking a region
  // acts as the primary partition and Process Step ID tabs/Depends-on
  // options/the canvas itself only ever see that region's own steps.
  const stepsInRegion = React.useMemo(
    () => selectedFlowRegion ? stepsInProcessId.filter(s => (s.region || '') === selectedFlowRegion) : stepsInProcessId,
    [stepsInProcessId, selectedFlowRegion]
  );

  // What "Duplicate to another region" duplicates FROM. A specific region
  // tab duplicates just that region's steps (stepsInRegion above already
  // narrows to that). "All" is different: stepsInRegion there is EVERY
  // step regardless of tag, which would merge already-distinct regions
  // together if duplicated as-is - not useful. What people actually want
  // from "All" (confirmed at a real user's request) is to duplicate the
  // steps that never got a region tag at all (created there by mistake,
  // sitting under "All" with nowhere else to be) into a real one.
  const duplicateSourceSteps = React.useMemo(
    () => selectedFlowRegion ? stepsInRegion : stepsInProcessId.filter(s => !s.region),
    [selectedFlowRegion, stepsInRegion, stepsInProcessId]
  );

  // Whether this Process ID actually uses regions at all - most don't,
  // and for those "All" is the only view that ever exists, so adding
  // steps from it is completely normal. Once even one region-tagged step
  // exists here, though, "All" becomes a genuine aggregate of separate
  // swimlanes (see FlowRegionTabs) rather than a swimlane of its own -
  // confirmed at a real user's request that adding directly from "All" in
  // that case is exactly how steps were silently ending up with no region
  // tag at all ("created in All by error").
  const regionsInUseForProcessId = React.useMemo(
    () => stepsInProcessId.some(s => !!s.region),
    [stepsInProcessId]
  );
  const addBlockedInAllView = !selectedFlowRegion && regionsInUseForProcessId;

  // Scoped to the current swimlane (this region's own steps within the
  // Process ID), not the full cross-process-ID dataset - a step
  // realistically only ever depends on something in its own flow, and
  // listing all ~40 steps from every unrelated flow made the real option
  // buried in noise. No excludeStepId - a brand-new step has no "self" to
  // leave out, unlike the edit panel's version of this same list.
  const addStepDependsOnOptions = React.useMemo(() => buildDependsOnOptions(stepsInRegion), [stepsInRegion]);

  const visibleSteps = React.useMemo(
    () => drilledDownStepId ? stepsInRegion.filter(s => s.processStepId === drilledDownStepId) : stepsInRegion,
    [stepsInRegion, drilledDownStepId]
  );

  // Resolved against the FULL, unfiltered `steps` array - row-number-based
  // DependsOn tokens only make sense against original load order, not a
  // filtered/reordered subset. SwimlaneCanvas takes care of only drawing
  // the edges whose endpoints are currently visible.
  const edges = React.useMemo(() => resolveDependencyEdges(steps), [steps]);

  const handleLabelEdge = (toRowId: string, token: string, label: string): void => {
    const step = steps.find(s => s.id === toRowId);
    if (!step) return;
    const updated: IProcessStep = {
      ...step,
      edgeLabels: { ...(step.edgeLabels || {}), [token]: label }
    };
    setSteps(prev => prev.map(s => (s.id === toRowId ? updated : s)));
    dataService.updateProcessStep(updated).catch((err: Error) => setError(err.message));
  };

  // updateProcessStep returns void (unlike addProcessStep, which hands
  // back a freshly-stamped object) - GraphDataService can't know the true
  // native lastModifiedBy/lastModifiedDateTime until the next reload
  // re-fetches it, so the caller has to stamp its own optimistic
  // modifiedBy/modifiedAt here instead. Never touches createdBy/createdAt
  // - only who/when CREATED a step changes that, not an edit.
  const withModifiedStamp = (step: IProcessStep): IProcessStep => ({
    ...step,
    modifiedBy: currentUserName,
    modifiedAt: new Date().toISOString()
  });

  const handleEditStep = (updated: IProcessStep): void => {
    if (activeLock) return; // defense in depth - SwimlaneCanvas's isLocked prop already keeps its Save button from calling this
    const previous = steps.find(s => s.id === updated.id);
    const stamped = withModifiedStamp(updated);
    setSteps(prev => prev.map(s => (s.id === stamped.id ? stamped : s)));
    dataService.updateProcessStep(stamped).catch((err: Error) => setError(err.message));
    if (previous) pushUndo({ type: 'edit', previous });
  };

  const handleDeleteStep = (stepId: string): void => {
    if (activeLock) return; // defense in depth - SwimlaneCanvas's isLocked prop already hides the delete affordance
    const step = steps.find(s => s.id === stepId);
    setSteps(prev => prev.filter(s => s.id !== stepId));
    dataService.deleteProcessStep(stepId).catch((err: Error) => setError(err.message));
    if (step) pushUndo({ type: 'delete', step });
  };

  // Deletes every step currently visible - the whole selected Process Step
  // ID group's flow, or the whole Process ID if "All" is selected (see
  // visibleSteps) - so removing a whole mistaken flow doesn't mean
  // deleting each of its steps one at a time via the edit panel.
  const handleBulkDelete = (): void => {
    if (activeLock) return; // defense in depth - the menu item that opens this is already disabled while locked
    const deleted = visibleSteps.slice();
    const idsToDelete = deleted.map(s => s.id);
    setSteps(prev => prev.filter(s => !idsToDelete.includes(s.id)));
    idsToDelete.forEach(id => {
      dataService.deleteProcessStep(id).catch((err: Error) => setError(err.message));
    });
    pushUndo({ type: 'bulkDelete', steps: deleted });
    setBulkDeleteOpen(false);
  };

  // Reverts a single action's content - shared by handleUndo (one) and
  // handleUndoThrough (several at once, for the history panel's per-row
  // "Undo to here"). Doesn't touch undoStack itself - both callers do
  // that afterward, once, for however many entries they actually popped.
  const applyUndo = (action: UndoAction): void => {
    if (action.type === 'edit') {
      // Undoing IS itself a real modification event (someone just acted,
      // right now) even though the CONTENT reverts to old values - so this
      // gets a fresh modifiedBy/modifiedAt too, same as any other edit,
      // rather than silently reverting the audit trail along with the
      // content.
      const stamped = withModifiedStamp(action.previous);
      setSteps(prev => prev.map(s => (s.id === stamped.id ? stamped : s)));
      dataService.updateProcessStep(stamped).catch((err: Error) => setError(err.message));
    } else if (action.type === 'bulkEdit') {
      action.previous.forEach(prevStep => {
        const stamped = withModifiedStamp(prevStep);
        setSteps(prev => prev.map(s => (s.id === stamped.id ? stamped : s)));
        dataService.updateProcessStep(stamped).catch((err: Error) => setError(err.message));
      });
    } else if (action.type === 'delete') {
      const { id: _id, ...rest } = action.step;
      dataService.addProcessStep(rest)
        .then(created => setSteps(prev => [...prev, created]))
        .catch((err: Error) => setError(err.message));
    } else {
      action.steps.forEach(step => {
        const { id: _id, ...rest } = step;
        dataService.addProcessStep(rest)
          .then(created => setSteps(prev => [...prev, created]))
          .catch((err: Error) => setError(err.message));
      });
    }
  };

  // Pops and reverts just the MOST RECENT action, not the whole stack -
  // click Undo again right after and the banner already shows the next
  // one back, same chained feel as a real multi-level undo without a
  // separate history-browsing UI to build. Also what the banner's own
  // "Undo" button calls.
  const handleUndo = (): void => {
    if (undoStack.length === 0) return;
    applyUndo(undoStack[undoStack.length - 1]);
    setUndoStack(prev => prev.slice(0, -1));
  };

  // The history panel's per-row "Undo to here" (added 2026-09-16 at the
  // user's request - "allow a history of undo") - reverts everything from
  // the most recent action down through the one at `index`, inclusive,
  // most-recent-first. A stack can only unwind from the top: reverting an
  // older action without also reverting everything done after it would
  // leave state that conflicts with those later changes (e.g. undoing a
  // rename from under a delete that happened afterward).
  const handleUndoThrough = (index: number): void => {
    for (let i = undoStack.length - 1; i >= index; i--) {
      applyUndo(undoStack[i]);
    }
    setUndoStack(prev => prev.slice(0, index));
  };

  const handleImported = (created: IProcessStep[]): void => {
    setSteps(prev => [...prev, ...created]);
  };

  const handleDuplicated = (created: IProcessStep[]): void => {
    setSteps(prev => [...prev, ...created]);
  };

  // Always the FULL current dataset, regardless of whatever category/
  // group/swimlane happens to be on screen right now - see the schema
  // comment on buildExportCsv for why a filtered subset can't safely
  // reuse the same DependsOn row-number scheme. Never gated by
  // activeLock - reading data out doesn't modify anything, same
  // reasoning as "Leave a comment" above.
  const handleExportCsv = (): void => {
    downloadTextFile(`swimlane-export-${new Date().toISOString().slice(0, 10)}.csv`, buildExportCsv(steps), 'text/csv;charset=utf-8;');
  };

  // TEMPORARY - see the interface comment on IDataService.backfillUniqueIds.
  const handleBackfillUniqueIds = (): void => {
    setBackfilling(true);
    dataService.backfillUniqueIds()
      .then(count => {
        setBackfilling(false);
        setBackfillDialogOpen(false);
        setBackfillMessage(`Assigned Unique IDs to ${count} step${count === 1 ? '' : 's'}.`);
        loadAll();
      })
      .catch((err: Error) => {
        setBackfilling(false);
        setBackfillMessage(`Failed: ${err.message}`);
      });
  };

  const handleGroupLabelCreated = (created: IProcessGroupLabel): void => {
    setProcessGroupLabels(prev => [...prev, created]);
  };

  const handleEmployeeCreated = (created: IEmployee): void => {
    setEmployees(prev => [...prev, created]);
    setAddEmployeeOpen(false);
  };

  const handleRiskCreated = (created: IRiskStatement): void => {
    setRiskStatements(prev => [...prev, created]);
    setAddRiskOpen(false);
  };

  const handleControlCreated = (created: IControlStatement): void => {
    setControlStatements(prev => [...prev, created]);
    setAddControlOpen(false);
  };

  // Fires after ControlLinkPicker writes a link/unlink straight to Control
  // Register (see setControlLinkKey) - keeps this list's local copy in
  // sync without a full reload, same "hand up what actually happened"
  // pattern as every other created/updated callback in this file.
  const handleControlLinked = (updated: IControlStatement): void => {
    setControlStatements(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  };

  // Lands the user straight in the empty Category, Process Group, or
  // Process ID they just named, same "go straight to what you made"
  // treatment as handleProcessCreated gets for a full step - the
  // difference here is there's no step to select underneath it, so
  // drilling in shows an empty picker/canvas ready for "Add a step".
  const handleShellCreated = (created: ICategoryLabel | IProcessGroupLabel | IProcessIdLabel): void => {
    if ('categoryId' in created) {
      setCategoryLabels(prev => [...prev, created]);
      setSelectedCategoryId(created.categoryId);
    } else if ('groupId' in created) {
      setProcessGroupLabels(prev => [...prev, created]);
      setSelectedProcessGroupId(created.groupId);
    } else {
      setProcessIdLabels(prev => [...prev, created]);
      setSelectedProcessId(created.processId);
      setSelectedFlowRegion(undefined);
    }
    setAddShellState(undefined);
  };

  const openRename = (level: 'category' | 'processGroup' | 'processId', id: string, currentLabel: string): void => {
    setRenameTarget({ level, id, currentLabel });
    setRenameValue(currentLabel);
  };

  // Renaming something that already has a custom label updates that same
  // record; renaming one that's still showing its static apqcHierarchy.ts
  // name (or a step-derived/generic fallback) creates a new custom label
  // instead, which then wins over that fallback the same way it already
  // does for a brand-new group/process ID (see customGroupNames /
  // customProcessIdNames) - this is the ONLY way to correct a wrong
  // value that ended up baked into real step data (e.g. a real case: a
  // Process ID showing "yes" as its name because that's literally what
  // ended up in some step's Process Description field).
  const handleRenameSave = (): void => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    if (renameTarget.level === 'category') {
      const existingLabel = categoryLabels.find(l => l.categoryId === renameTarget.id);
      if (existingLabel) {
        setCategoryLabels(prev => prev.map(l => (l.id === existingLabel.id ? { ...l, name: trimmed } : l)));
        dataService.updateCategoryLabel(existingLabel.id, trimmed).catch((err: Error) => setError(err.message));
      } else {
        dataService.addCategoryLabel(renameTarget.id, trimmed)
          .then(created => setCategoryLabels(prev => [...prev, created]))
          .catch((err: Error) => setError(err.message));
      }
    } else if (renameTarget.level === 'processGroup') {
      const existingLabel = processGroupLabels.find(l => l.groupId === renameTarget.id);
      if (existingLabel) {
        setProcessGroupLabels(prev => prev.map(l => (l.id === existingLabel.id ? { ...l, name: trimmed } : l)));
        dataService.updateProcessGroupLabel(existingLabel.id, trimmed).catch((err: Error) => setError(err.message));
      } else {
        dataService.addProcessGroupLabel(renameTarget.id, trimmed)
          .then(created => setProcessGroupLabels(prev => [...prev, created]))
          .catch((err: Error) => setError(err.message));
      }
    } else {
      const existingLabel = processIdLabels.find(l => l.processId === renameTarget.id);
      if (existingLabel) {
        setProcessIdLabels(prev => prev.map(l => (l.id === existingLabel.id ? { ...l, name: trimmed } : l)));
        dataService.updateProcessIdLabel(existingLabel.id, trimmed).catch((err: Error) => setError(err.message));
      } else {
        dataService.addProcessIdLabel(renameTarget.id, trimmed)
          .then(created => setProcessIdLabels(prev => [...prev, created]))
          .catch((err: Error) => setError(err.message));
      }
    }
    setRenameTarget(undefined);
  };

  const openRenameSection = (processStepId: string, currentName: string): void => {
    setRenameSectionTarget({ processStepId, currentName });
    setRenameSectionId(processStepId);
    setRenameSectionValue(currentName);
    setDeleteSectionConfirmOpen(false);
  };

  const trimmedRenameSectionId = renameSectionId.trim();
  // Renumbering stays within the same Process ID (first 3 segments locked)
  // - reassigning a section to an entirely different process is enough of
  // a different operation (it'd mean re-deriving apqcTitle/
  // processDescription too) that it's out of scope here; same 4-segment
  // format AddStepSectionModal itself validates against.
  const renameSectionIdLooksValid = renameSectionTarget
    ? new RegExp(`^${renameSectionTarget.processStepId.split('.').slice(0, 3).join('\\.')}\\.\\d+$`).test(trimmedRenameSectionId)
    : false;
  // Sections are per-region, not global (confirmed at the user's request -
  // "they don't sit in their own category, they form part of a specific
  // process for a specific region"): the SAME Process Step ID number can
  // legitimately exist in UK's swimlane AND US's AND Global's, as three
  // genuinely separate sections. Editing/deleting/collision-checking one
  // must only ever touch steps in the CURRENTLY VIEWED region - the
  // rename/delete dialog is only ever opened from within one region's own
  // view (ProcessStepTabs/SwimlaneCanvas are both already region-filtered
  // by the time they get here), so selectedFlowRegion is always the right
  // scope for whichever section is being edited.
  const stepsInSameRegionAs = (candidates: IProcessStep[]): IProcessStep[] =>
    candidates.filter(s => (s.region || '') === (selectedFlowRegion || ''));
  // A different, ALREADY-EXISTING section in this SAME region (not this
  // one being renumbered, and not some other region's section that
  // happens to share the target number) already using the target ID -
  // blocked rather than silently merging two sections' steps together.
  const renameSectionIdCollides = !!renameSectionTarget
    && trimmedRenameSectionId !== renameSectionTarget.processStepId
    && stepsInSameRegionAs(steps).some(s => s.processStepId === trimmedRenameSectionId);

  // A section's name and ID both live on every real step row sharing its
  // Process Step ID (see the comment on ProcessStepTabs' onRenameSection),
  // so saving means updating ALL of them at once, not one label-list row
  // the way Category/Process Group/Process ID renames do.
  const handleRenameSectionSave = (): void => {
    if (!renameSectionTarget) return;
    const trimmedName = renameSectionValue.trim();
    if (!trimmedName || !renameSectionIdLooksValid || renameSectionIdCollides) return;
    const oldId = renameSectionTarget.processStepId;
    const newId = trimmedRenameSectionId;
    const affected = stepsInSameRegionAs(steps.filter(s => s.processStepId === oldId));
    const affectedIds = new Set(affected.map(s => s.id));
    pushUndo({ type: 'bulkEdit', previous: affected });
    setSteps(prev => prev.map(s => (affectedIds.has(s.id) ? { ...s, processStepId: newId, processStepName: trimmedName } : s)));
    affected.forEach(step => {
      dataService.updateProcessStep({ ...step, processStepId: newId, processStepName: trimmedName }).catch((err: Error) => setError(err.message));
    });
    // The renumbered section's own tab needs to still be "selected" under
    // its new ID, and any DependsOn picker option keyed on the old
    // Process Step ID text needs to follow it too - both derive fresh
    // from `steps` already updated above, this just keeps the currently
    // open tab from silently pointing at an ID that no longer exists.
    if (drilledDownStepId === oldId) setDrilledDownStepId(newId);
    setRenameSectionTarget(undefined);
  };

  // Deletes every step sharing this Process Step ID IN THIS REGION - the
  // whole section, not just the one row the small trash icon on an
  // individual step already covers, and not some other region's
  // same-numbered section (see stepsInSameRegionAs above). Same "keep
  // whatever local removal already happened" pattern as handleBulkDelete.
  const handleDeleteSectionConfirm = (): void => {
    if (!renameSectionTarget) return;
    const targetId = renameSectionTarget.processStepId;
    const deleted = stepsInSameRegionAs(steps.filter(s => s.processStepId === targetId));
    const idsToDelete = deleted.map(s => s.id);
    setSteps(prev => prev.filter(s => !idsToDelete.includes(s.id)));
    idsToDelete.forEach(id => {
      dataService.deleteProcessStep(id).catch((err: Error) => setError(err.message));
    });
    pushUndo({ type: 'bulkDelete', steps: deleted });
    if (drilledDownStepId === targetId) setDrilledDownStepId(undefined);
    setDeleteSectionConfirmOpen(false);
    setRenameSectionTarget(undefined);
  };

  // Confirmed design rule: v1 doesn't restrict who can lock/unlock to
  // specific people - anyone signed in can do either. Accountability comes
  // from every action being attributed (currentUserName) and permanently
  // logged (see IProcessIdLock's append-only shape), not from a
  // technical permission barrier.
  const handleLockConfirm = (): void => {
    if (!selectedProcessId || lockDialogMode !== 'lock') return;
    const region = selectedFlowRegion || '';
    dataService.lockProcessId(selectedProcessId, region, currentUserName, lockReasonValue.trim())
      .then(created => setProcessIdLocks(prev => [...prev, created]))
      .catch((err: Error) => setError(err.message));
    setLockDialogMode(undefined);
    setLockReasonValue('');
  };

  const handleUnlockConfirm = (): void => {
    if (!activeLock || lockDialogMode !== 'unlock') return;
    if (unlockPasswordValue !== ADMIN_UNLOCK_PASSWORD) {
      setUnlockPasswordError(true);
      return;
    }
    const reason = lockReasonValue.trim();
    const unlockedAt = new Date().toISOString();
    setProcessIdLocks(prev => prev.map(l => (l.id === activeLock.id
      ? { ...l, unlockedBy: currentUserName, unlockedAt, unlockReason: reason }
      : l)));
    dataService.unlockProcessId(activeLock.id, currentUserName, reason).catch((err: Error) => setError(err.message));
    setLockDialogMode(undefined);
    setLockReasonValue('');
    setUnlockPasswordValue('');
    setUnlockPasswordError(false);
  };

  // Flips Draft <-> Finalised for the swimlane on screen right now. Never
  // gated by activeLock or a password, unlike locking - this is a plain
  // status label with no enforcement behind it (see ISwimlaneStatus),
  // same "social signal, not a technical barrier" philosophy locking
  // itself already uses. Same update-or-add pattern as handleRenameSave:
  // updates the existing record in place if one exists (refreshing who/
  // when along with the new stage), otherwise creates the first one.
  const handleToggleStage = (): void => {
    if (!selectedProcessId) return;
    const region = selectedFlowRegion || '';
    const nextStage: SwimlaneStage = currentStage === 'Draft' ? 'Finalised' : 'Draft';
    if (activeStatus) {
      setSwimlaneStatuses(prev => prev.map(s => (s.id === activeStatus.id
        ? { ...s, stage: nextStage, setBy: currentUserName, setAt: new Date().toISOString() }
        : s)));
      dataService.updateSwimlaneStatus(activeStatus.id, nextStage, currentUserName).catch((err: Error) => setError(err.message));
    } else {
      dataService.addSwimlaneStatus(selectedProcessId, region, nextStage, currentUserName)
        .then(created => setSwimlaneStatuses(prev => [...prev, created]))
        .catch((err: Error) => setError(err.message));
    }
  };

  // Never gated by activeLock - see ISwimlaneComment for why leaving a
  // comment is deliberately independent of the lock/edit flow entirely.
  const handleCommentConfirm = (): void => {
    // The "Comment" box is multiline for comfortable typing, but the real
    // SharePoint column it's stored in is a single line of text field -
    // Graph rejects a value containing a line break with a generic 400
    // "Invalid request" (no field-level detail). Collapse line breaks into
    // spaces so multi-line typing still saves successfully. The 255-char
    // cap mirrors the TextField's own maxLength - kept here too as a
    // safety net against that limit changing in only one place.
    const text = commentValue.trim().replace(/\s*\n+\s*/g, ' ').slice(0, 255);
    if (!selectedProcessId || !text) return;
    const region = selectedFlowRegion || '';
    dataService.addSwimlaneComment(selectedProcessId, region, currentUserName, text)
      .then(created => setSwimlaneComments(prev => [...prev, created]))
      .catch((err: Error) => setError(err.message));
    setCommentDialogOpen(false);
    setCommentValue('');
  };

  // Lands the user straight in the swimlane they just created, the same
  // place they'd be if they'd clicked all the way down through an
  // already-populated area - drilling back through empty pickers to find
  // what was just added would be a pointless extra step.
  const handleProcessCreated = (created: IProcessStep): void => {
    setSteps(prev => [...prev, created]);
    setSelectedCategoryId(getCategoryId(created.processStepId));
    setSelectedProcessGroupId(getProcessGroupId(created.processStepId));
    setSelectedProcessId(getProcessId(created.processStepId));
    // NewProcessModal has no region context to inherit (it's often used to
    // start an entirely new area from scratch), so the created step is
    // unregioned - "All" is the only view it's guaranteed to show up in.
    setSelectedFlowRegion(undefined);
    // Selects the new step's own Process Step ID tab, not "All" - without
    // this, "Add a step" right afterward defaulted to the bare Process ID
    // as its processStepId (drilledDownStepId || selectedProcessId, with
    // drilledDownStepId unset), landing new steps in a second, separate
    // column group instead of continuing the one the user just started.
    setDrilledDownStepId(created.processStepId);
    setNewProcessOpen(false);
  };

  // Lands the user straight in the section they just created, same "go
  // straight to what you made" treatment as handleProcessCreated - the
  // new section already belongs to the current Process ID/region (see
  // AddStepSectionModal), so only its own Process Step ID tab needs
  // selecting, nothing else about the current context changes.
  const handleSectionCreated = (created: IProcessStep): void => {
    setSteps(prev => [...prev, created]);
    setDrilledDownStepId(created.processStepId);
    setAddSectionOpen(false);
  };

  // Jumps straight to a step found via GlobalSearch - lands on the
  // Process ID's swimlane (Category -> Process Group -> Process ID),
  // same as clicking all the way down by hand, but stops there rather
  // than also auto-selecting that step's own Process Step ID tab - the
  // swimlane for the whole Process ID is the useful landing spot, since
  // it shows the found step in context next to everything around it.
  const handleSearchNavigate = (step: IProcessStep): void => {
    setActiveTab('flows');
    setSelectedCategoryId(getCategoryId(step.processStepId));
    setSelectedProcessGroupId(getProcessGroupId(step.processStepId));
    setSelectedProcessId(getProcessId(step.processStepId));
    // Guarantees the found step is actually visible - without this, a
    // stale region selection from wherever the user was browsing before
    // could hide the very step search just landed them on.
    setSelectedFlowRegion(step.region || undefined);
    setDrilledDownStepId(undefined);
  };

  const newProcessPrefix = selectedProcessGroupId ? `${selectedProcessGroupId}.` : selectedCategoryId ? `${selectedCategoryId}.` : '';

  const handleAddStep = (): void => {
    if (!selectedProcessId || !newStepDraft.actionDescription.trim() || activeLock) return;
    // The very first step in a brand-new region has no reference step IN
    // THAT REGION to inherit from (stepsInRegion is empty) - it used to
    // fall back straight to blank/bare defaults there, leaving Process
    // Description empty and APQC Title as just the bare Process ID
    // number. Falls back to ANY step in the Process ID instead: Process
    // Description/Step Name describe the same underlying business process
    // regardless of which region's specific procedure this is, so
    // inheriting them from another region's step is far more useful than
    // leaving them blank. APQC Title alone gets rebuilt for the new
    // region (mirroring the real data's own "9.6.1 - UK" convention)
    // rather than inherited verbatim, since copying e.g. "9.6.1 - US"
    // onto a brand-new UK step would mislabel it.
    const regionReferenceStep = stepsInRegion[0];
    const anyReferenceStep = stepsInProcessId[0];
    const { dependsOnStepIds, ...fields } = newStepDraft;
    setSaving(true);
    dataService.addProcessStep({
      apqcTitle: regionReferenceStep
        ? regionReferenceStep.apqcTitle
        : selectedFlowRegion
          ? `${selectedProcessId} - ${selectedFlowRegion}`
          : anyReferenceStep ? anyReferenceStep.apqcTitle : selectedProcessId,
      // A custom rename (if one's been set) wins over whatever's actually
      // sitting in existing steps' processDescription - otherwise a new
      // step would keep perpetuating a wrong value a rename was supposed
      // to have already corrected.
      processDescription: (selectedProcessId && customProcessIdNames[selectedProcessId])
        || regionReferenceStep?.processDescription || anyReferenceStep?.processDescription || '',
      processStepId: drilledDownStepId || selectedProcessId,
      processStepName: regionReferenceStep?.processStepName || anyReferenceStep?.processStepName || '',
      region: selectedFlowRegion || '',
      ...fields,
      actionDescription: fields.actionDescription.trim(),
      dependsOn: stepIdsToDependsOnTokens(steps, dependsOnStepIds)
    })
      .then(created => {
        setSteps(prev => [...prev, created]);
        setNewStepDraft(emptyStepDraft());
        setSaving(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setSaving(false);
      });
  };

  // Drag-from-legend creation (see ShapeLegend's draggable swatches and
  // SwimlaneCanvas's onCreateStep) - unlike handleAddStep above, there's
  // no form to fill in first. The step is created immediately, positioned
  // right where it was dropped (columnStep's Process Step ID/group, the
  // lane it landed in, taking over columnStep's own column and shifting
  // it one place right - see computeInsertOrderBefore), with a
  // placeholder description, and its edit panel opens automatically right
  // after (see autoOpenStepId) so the real details get filled in on the
  // spot - the same "drop a shape,
  // then type into it" flow a real diagramming tool would give you.
  // apqcTitle/processDescription/processStepName/region are inherited
  // straight from columnStep, the concrete step actually sitting at the
  // dropped position, rather than handleAddStep's own reference-step
  // fallback chain (unnecessary here - there's always a real columnStep,
  // that's what was dropped onto).
  const handleCreateStepFromShape = (shapeOverride: string, lane: string, columnStep: IProcessStep): void => {
    if (activeLock) return;
    dataService.addProcessStep({
      apqcTitle: columnStep.apqcTitle,
      processDescription: columnStep.processDescription,
      processStepId: columnStep.processStepId,
      processStepName: columnStep.processStepName,
      region: columnStep.region || '',
      action: '',
      actionType: '',
      actionDescription: 'New step',
      shapeOverride,
      responsibleJobTitle: lane === 'Unassigned' ? '' : lane,
      manualOrder: computeInsertOrderBefore(steps, columnStep.id),
      dependsOn: [],
      linkedRisks: []
    })
      .then(created => {
        setSteps(prev => [...prev, created]);
        setAutoOpenStepId(created.id);
      })
      .catch((err: Error) => setError(err.message));
  };

  if (loading) {
    // Keeps the real header (logo, title) visible instead of a bare
    // Spinner with no layout at all - on the real Graph data path this can
    // sit on screen for a couple of seconds, long enough that an unstyled
    // corner spinner reads as the app being broken rather than loading.
    return (
      <div className={styles.page}>
        <header className={styles.appBar}>
          <img src={qleLogo} className={styles.appBarLogo} alt="Quantum Leap Energy" />
          <div>
            <h2 className={styles.title}>Swimlane Studio</h2>
            <p className={styles.breadcrumb}>Business process visualisation</p>
          </div>
        </header>
        <div className={styles.loadingState}>
          <Spinner label="Loading process data..." />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.appBar}>
        <img src={qleLogo} className={styles.appBarLogo} alt="Quantum Leap Energy" />
        <div>
          <h2 className={styles.title}>Swimlane Studio</h2>
          {selectedCategoryId ? (
            <p className={styles.breadcrumb}>
              {[selectedCategoryId, selectedProcessGroupId, selectedProcessId, drilledDownStepId].filter(Boolean).join(' / ')}
              {currentLevelName ? ` — ${currentLevelName}` : ''}
            </p>
          ) : (
            <p className={styles.breadcrumb}>Business process visualisation</p>
          )}
        </div>
        <div className={styles.appBarSearch}>
          <GlobalSearch steps={steps} onNavigate={handleSearchNavigate} />
        </div>
        <div className={styles.appBarActions}>
          {onSignOut && (
            <DefaultButton
              text={signOutLabel || 'Sign out'}
              onClick={onSignOut}
              styles={{
                root: {
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 8,
                  marginRight: 10
                },
                rootHovered: { background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.45)' },
                rootPressed: { background: 'rgba(255,255,255,0.24)' },
                label: { color: '#fff', fontWeight: 600 }
              }}
            />
          )}
        </div>
      </header>

      <ImportCsvModal
        isOpen={importOpen}
        dataService={dataService}
        insertionIndex={steps.length}
        existingSteps={steps}
        onDismiss={() => setImportOpen(false)}
        onImported={handleImported}
      />

      <NewProcessModal
        isOpen={newProcessOpen}
        steps={steps}
        employees={employees}
        riskStatements={riskStatements}
        controlStatements={controlStatements}
        dataService={dataService}
        processStepIdPrefix={newProcessPrefix}
        knownProcessGroupIds={new Set([...Object.keys(APQC_PROCESS_GROUP_NAMES), ...Object.keys(customGroupNames)])}
        onDismiss={() => setNewProcessOpen(false)}
        onCreated={handleProcessCreated}
        onGroupLabelCreated={handleGroupLabelCreated}
        onControlLinked={handleControlLinked}
        onControlCreated={handleControlCreated}
        onRiskCreated={handleRiskCreated}
      />

      <AddHierarchyShellModal
        isOpen={!!addShellState}
        level={addShellState?.level || 'processGroup'}
        idPrefix={addShellState?.idPrefix || ''}
        dataService={dataService}
        onDismiss={() => setAddShellState(undefined)}
        onCreated={handleShellCreated}
      />

      <AddEmployeeModal
        isOpen={addEmployeeOpen}
        dataService={dataService}
        onDismiss={() => setAddEmployeeOpen(false)}
        onCreated={handleEmployeeCreated}
      />

      <AddRiskModal
        isOpen={addRiskOpen}
        dataService={dataService}
        onDismiss={() => setAddRiskOpen(false)}
        onCreated={handleRiskCreated}
      />

      <AddControlModal
        isOpen={addControlOpen}
        dataService={dataService}
        controlStatements={controlStatements}
        riskStatements={riskStatements}
        onDismiss={() => setAddControlOpen(false)}
        onCreated={handleControlCreated}
      />

      <AddStepSectionModal
        isOpen={addSectionOpen}
        idPrefix={selectedProcessId ? `${selectedProcessId}.` : ''}
        referenceStep={stepsInProcessId[0]}
        region={selectedFlowRegion}
        dataService={dataService}
        onDismiss={() => setAddSectionOpen(false)}
        onCreated={handleSectionCreated}
      />

      <DuplicateRegionModal
        isOpen={duplicateRegionOpen}
        dataService={dataService}
        processId={selectedProcessId || ''}
        sourceRegion={selectedFlowRegion || ''}
        sourceSteps={duplicateSourceSteps}
        allSteps={steps}
        onDismiss={() => setDuplicateRegionOpen(false)}
        onDuplicated={handleDuplicated}
      />

      <Dialog
        hidden={!bulkDeleteOpen}
        onDismiss={() => setBulkDeleteOpen(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Delete this flow?',
          subText: `This removes all ${visibleSteps.length} step${visibleSteps.length === 1 ? '' : 's'} currently shown - not just one. You'll have a short window to undo it afterward.`
        }}
      >
        <DialogFooter>
          <DefaultButton text="Cancel" onClick={() => setBulkDeleteOpen(false)} />
          <PrimaryButton
            text={`Delete ${visibleSteps.length} step${visibleSteps.length === 1 ? '' : 's'}`}
            onClick={handleBulkDelete}
            styles={{ root: { background: 'var(--risk-high)', border: 'none' }, rootHovered: { background: '#b02419' } }}
          />
        </DialogFooter>
      </Dialog>

      {/* TEMPORARY - see the interface comment on IDataService.backfillUniqueIds. */}
      <Dialog
        hidden={!backfillDialogOpen}
        onDismiss={() => setBackfillDialogOpen(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Backfill Unique IDs?',
          subText: `This overwrites the "Unique ID" column on all ${steps.length} process steps, numbering them 001, 002... in their current order. One-time migration - safe to run again, but there's no need to.`
        }}
      >
        <DialogFooter>
          <DefaultButton text="Cancel" onClick={() => setBackfillDialogOpen(false)} disabled={backfilling} />
          <PrimaryButton text={backfilling ? 'Assigning...' : 'Assign Unique IDs'} onClick={handleBackfillUniqueIds} disabled={backfilling} />
        </DialogFooter>
      </Dialog>

      <Dialog
        hidden={!renameTarget}
        onDismiss={() => setRenameTarget(undefined)}
        dialogContentProps={{ type: DialogType.normal, title: `Rename ${renameTarget?.id || ''}` }}
      >
        <TextField
          label={renameTarget?.level === 'processId' ? 'Process ID name' : renameTarget?.level === 'category' ? 'Category name' : 'Process Group name'}
          value={renameValue}
          onChange={(_e, v) => setRenameValue(v || '')}
          onKeyDown={e => { if (e.key === 'Enter') handleRenameSave(); }}
        />
        <DialogFooter>
          <DefaultButton text="Cancel" onClick={() => setRenameTarget(undefined)} />
          <PrimaryButton text="Save" onClick={handleRenameSave} disabled={!renameValue.trim()} />
        </DialogFooter>
      </Dialog>

      <Dialog
        hidden={!renameSectionTarget}
        onDismiss={() => setRenameSectionTarget(undefined)}
        dialogContentProps={{ type: DialogType.normal, title: `Edit section ${renameSectionTarget?.processStepId || ''}` }}
      >
        <TextField
          label="Process Step ID"
          value={renameSectionId}
          onChange={(_e, v) => setRenameSectionId(v || '')}
          errorMessage={
            trimmedRenameSectionId.length > 0 && !renameSectionIdLooksValid
              ? `Needs exactly 4 dot-separated numbers under ${renameSectionTarget?.processStepId.split('.').slice(0, 3).join('.')}`
              : renameSectionIdCollides
                ? `${trimmedRenameSectionId} is already used by another section`
                : undefined
          }
        />
        <TextField
          label="Section name"
          value={renameSectionValue}
          onChange={(_e, v) => setRenameSectionValue(v || '')}
          onKeyDown={e => { if (e.key === 'Enter') handleRenameSectionSave(); }}
        />
        <DialogFooter>
          <DefaultButton
            text="Delete section"
            onClick={() => setDeleteSectionConfirmOpen(true)}
            styles={{ root: { color: 'var(--risk-high)', borderColor: 'var(--risk-high)' } }}
          />
          <DefaultButton text="Cancel" onClick={() => setRenameSectionTarget(undefined)} />
          <PrimaryButton
            text="Save"
            onClick={handleRenameSectionSave}
            disabled={!renameSectionValue.trim() || !renameSectionIdLooksValid || renameSectionIdCollides}
          />
        </DialogFooter>
      </Dialog>

      <Dialog
        hidden={!deleteSectionConfirmOpen}
        onDismiss={() => setDeleteSectionConfirmOpen(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: `Delete section ${renameSectionTarget?.processStepId || ''}?`,
          // Corrected 2026-09-16 - this used to claim undo stops working
          // "once you navigate away", which was never true: undoStack
          // (see pushUndo) isn't tied to the current tab/process/region at
          // all, only to a ~10s idle timer or 20 more actions pushing it
          // off the stack (see MAX_UNDO_STACK) - confirmed by code review,
          // the old wording could wrongly convince someone a deletion was
          // already unrecoverable when it wasn't.
          subText: `Deletes all ${stepsInSameRegionAs(steps.filter(s => s.processStepId === renameSectionTarget?.processStepId)).length} step(s) in this section. Undo is available for about 10 seconds afterward, or until you take another action.`
        }}
      >
        <DialogFooter>
          <DefaultButton text="Cancel" onClick={() => setDeleteSectionConfirmOpen(false)} />
          <PrimaryButton
            text="Delete section"
            onClick={handleDeleteSectionConfirm}
            styles={{ root: { background: 'var(--risk-high)', border: 'none' }, rootHovered: { background: '#b02419' } }}
          />
        </DialogFooter>
      </Dialog>

      <Dialog
        hidden={!lockDialogMode}
        onDismiss={() => { setLockDialogMode(undefined); setLockReasonValue(''); setUnlockPasswordValue(''); setUnlockPasswordError(false); }}
        dialogContentProps={{
          type: DialogType.normal,
          title: lockDialogMode === 'unlock' ? 'Unlock this swimlane?' : 'Lock this swimlane?',
          subText: lockDialogMode === 'unlock'
            ? 'Reopens it for editing. This is recorded permanently, same as the original lock.'
            : "Blocks further edits until it's unlocked again. Who locked it, when, and why is recorded permanently."
        }}
      >
        {lockDialogMode === 'unlock' && (
          <TextField
            label="Admin password"
            type="password"
            canRevealPassword
            value={unlockPasswordValue}
            onChange={(_e, v) => { setUnlockPasswordValue(v || ''); setUnlockPasswordError(false); }}
            errorMessage={unlockPasswordError ? 'Wrong password.' : undefined}
            onKeyDown={e => { if (e.key === 'Enter') handleUnlockConfirm(); }}
          />
        )}
        <TextField
          label="Reason (optional)"
          // Same 255-char single line of text column as "Comment" (see
          // handleCommentConfirm) - capped here so this field can't hit the
          // same generic Graph 400 "Invalid request".
          maxLength={255}
          placeholder={lockDialogMode === 'unlock' ? 'e.g. Reopening to fix an error found in review' : 'e.g. Approved for FY26 audit'}
          value={lockReasonValue}
          onChange={(_e, v) => setLockReasonValue(v || '')}
          onKeyDown={e => { if (e.key === 'Enter') (lockDialogMode === 'unlock' ? handleUnlockConfirm() : handleLockConfirm()); }}
        />
        <DialogFooter>
          <DefaultButton text="Cancel" onClick={() => { setLockDialogMode(undefined); setLockReasonValue(''); setUnlockPasswordValue(''); setUnlockPasswordError(false); }} />
          <PrimaryButton
            text={lockDialogMode === 'unlock' ? 'Unlock' : 'Lock'}
            onClick={lockDialogMode === 'unlock' ? handleUnlockConfirm : handleLockConfirm}
          />
        </DialogFooter>
      </Dialog>

      <Dialog
        hidden={!commentDialogOpen}
        onDismiss={() => { setCommentDialogOpen(false); setCommentValue(''); }}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Leave a comment',
          subText: "Posted under your name, permanently - visible here and on the Improvements tab. Not blocked by a lock, and doesn't change anything on the swimlane itself."
        }}
      >
        <TextField
          label="Comment"
          multiline
          rows={4}
          // The real SharePoint "Comment" column is a Single line of text
          // field, capped at 255 characters - Graph rejects anything longer
          // with a generic, field-agnostic 400 "Invalid request" (no detail
          // pointing at which field or why). Capping input here means that
          // failure mode can't happen from this dialog.
          maxLength={255}
          description={`${commentValue.length}/255`}
          placeholder="e.g. This step should route to the Regional Finance Manager instead"
          value={commentValue}
          onChange={(_e, v) => setCommentValue(v || '')}
        />
        <DialogFooter>
          <DefaultButton text="Cancel" onClick={() => { setCommentDialogOpen(false); setCommentValue(''); }} />
          <PrimaryButton text="Post comment" onClick={handleCommentConfirm} disabled={!commentValue.trim()} />
        </DialogFooter>
      </Dialog>

      {/*
        Added 2026-09-16 at the user's request ("add an undo button for
        stuff one did that were not supposed to and allow a history of
        undo") - the toast banner above is quick but transient (hides
        after ~10s - see showUndoBanner); this is the persistent way back
        in to the same undoStack, reachable any time via the "Undo
        history" toolbar button regardless of how long ago the mistake
        happened or how much else has been undone/redone since. Most
        recent action listed first, since that's the only one a plain
        "Undo" click would act on - every row below it is "Undo to here"
        instead, since a stack can only unwind from the top (see
        handleUndoThrough).
      */}
      <Panel
        isOpen={undoHistoryOpen}
        onDismiss={() => setUndoHistoryOpen(false)}
        type={PanelType.smallFixedFar}
        headerText={`Undo history${undoStack.length > 0 ? ` (${undoStack.length})` : ''}`}
      >
        {undoStack.length === 0 && <p>Nothing to undo right now.</p>}
        <div className={styles.undoHistoryList}>
          {[...undoStack].reverse().map((action, i) => {
            const index = undoStack.length - 1 - i; // real position in undoStack
            return (
              <div className={styles.undoHistoryRow} key={index}>
                <span>{describeUndoAction(action)}</span>
                <DefaultButton
                  text={i === 0 ? 'Undo' : 'Undo to here'}
                  onClick={() => handleUndoThrough(index)}
                />
              </div>
            );
          })}
        </div>
      </Panel>

      <section className={styles.swimlaneStudio}>
        {error && (
          <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(undefined)}>
            {error}
          </MessageBar>
        )}

        {showUndoBanner && undoStack.length > 0 && (() => {
          const lastAction = undoStack[undoStack.length - 1];
          const earlierCount = undoStack.length - 1;
          return (
            <MessageBar
              messageBarType={MessageBarType.info}
              // Dismissing the toast only hides IT - the history underneath
              // stays put (see showUndoBanner) and is still reachable via
              // the "Undo history" button below, not gone forever.
              onDismiss={() => setShowUndoBanner(false)}
              actions={<MessageBarButton onClick={handleUndo}>Undo</MessageBarButton>}
            >
              {describeUndoAction(lastAction)}.
              {earlierCount > 0 && ` (${earlierCount} more earlier action${earlierCount === 1 ? '' : 's'} - see "Undo history".)`}
            </MessageBar>
          );
        })()}

        <Pivot
          className={styles.mainTabs}
          selectedKey={activeTab}
          onLinkClick={(item?: PivotItem) => {
            const key = item?.props.itemKey;
            setActiveTab(key === 'employees' || key === 'risks' || key === 'controls' || key === 'audit' || key === 'improvements' ? key : 'flows');
          }}
        >
          <PivotItem headerText="Process Flows" itemKey="flows" />
          <PivotItem headerText="Employees" itemKey="employees" />
          <PivotItem headerText="Risk Register" itemKey="risks" />
          <PivotItem headerText="Control Register" itemKey="controls" />
          <PivotItem headerText="Audit" itemKey="audit" />
          <PivotItem headerText="Improvements" itemKey="improvements" />
        </Pivot>

        {activeTab === 'employees' ? (
          <EmployeesList employees={employees} onAddClick={() => setAddEmployeeOpen(true)} />
        ) : activeTab === 'risks' ? (
          <RiskRegisterList riskStatements={riskStatements} onAddClick={() => setAddRiskOpen(true)} />
        ) : activeTab === 'controls' ? (
          <ControlRegisterList controlStatements={controlStatements} onAddClick={() => setAddControlOpen(true)} />
        ) : activeTab === 'audit' ? (
          <>
            {/* TEMPORARY - see the interface comment on IDataService.backfillUniqueIds. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <DefaultButton text="Backfill Unique IDs (run once)" onClick={() => setBackfillDialogOpen(true)} />
              {backfillMessage && <span>{backfillMessage}</span>}
            </div>
            <AuditView steps={steps} processIdLocks={processIdLocks} />
          </>
        ) : activeTab === 'improvements' ? (
          <ImprovementsView comments={swimlaneComments} />
        ) : (
          <>
            {!selectedCategoryId && (
              <div className={styles.intro}>
                <h3>Select a category to explore</h3>
                <p>Pick an APQC process category, then a process group, then a Process ID to open its swimlane.</p>
              </div>
            )}

            {!selectedCategoryId ? (
              <>
                <div className={styles.toolbar}>
                  <DefaultButton text="Import CSV" iconProps={{ iconName: 'Upload' }} onClick={() => setImportOpen(true)} />
                  <DefaultButton text="Export CSV" iconProps={{ iconName: 'Download' }} disabled={steps.length === 0} onClick={handleExportCsv} />
                </div>
                <HierarchyPicker
                  steps={steps}
                  getGroupId={getCategoryId}
                  getLabel={id => customCategoryNames[id] || getCategoryName(id)}
                  onSelect={setSelectedCategoryId}
                  allGroupIds={[...Object.keys(APQC_CATEGORY_NAMES), ...Object.keys(customCategoryNames)]}
                  onAddNew={() => setAddShellState({ level: 'category', idPrefix: '' })}
                  addNewLabel="+ Add new category"
                  onRename={(id, label) => openRename('category', id, label)}
                  countBy={getProcessGroupId}
                  countLabel="process group"
                  allSubGroupIds={[...Object.keys(APQC_PROCESS_GROUP_NAMES), ...Object.keys(customGroupNames)]}
                />
              </>
            ) : !selectedProcessGroupId ? (
              <>
                <div className={styles.toolbar}>
                  <DefaultButton text="Back to Categories" onClick={() => setSelectedCategoryId(undefined)} />
                  <DefaultButton text="Import CSV" iconProps={{ iconName: 'Upload' }} onClick={() => setImportOpen(true)} />
                  <DefaultButton text="Export CSV" iconProps={{ iconName: 'Download' }} disabled={steps.length === 0} onClick={handleExportCsv} />
                </div>
                <HierarchyPicker
                  steps={stepsInCategory}
                  getGroupId={getProcessGroupId}
                  getLabel={id => customGroupNames[id] || getProcessGroupName(id)}
                  onSelect={setSelectedProcessGroupId}
                  allGroupIds={[...Object.keys(APQC_PROCESS_GROUP_NAMES), ...Object.keys(customGroupNames)].filter(id => getCategoryId(id) === selectedCategoryId)}
                  onAddNew={() => setAddShellState({ level: 'processGroup', idPrefix: `${selectedCategoryId}.` })}
                  addNewLabel="+ Add new process group"
                  onRename={(id, label) => openRename('processGroup', id, label)}
                  countBy={getProcessId}
                  countLabel="process"
                  countLabelPlural="processes"
                  allSubGroupIds={[...Object.keys(APQC_PROCESS_ID_NAMES), ...Object.keys(customProcessIdNames)].filter(id => getCategoryId(id) === selectedCategoryId)}
                />
              </>
            ) : !selectedProcessId ? (
              <>
                <div className={styles.toolbar}>
                  <DefaultButton text="Back to Process Groups" onClick={() => setSelectedProcessGroupId(undefined)} />
                  <DefaultButton text="Import CSV" iconProps={{ iconName: 'Upload' }} onClick={() => setImportOpen(true)} />
                  <DefaultButton text="Export CSV" iconProps={{ iconName: 'Download' }} disabled={steps.length === 0} onClick={handleExportCsv} />
                </div>
                <HierarchyPicker
                  steps={stepsInProcessGroup}
                  getGroupId={getProcessId}
                  getLabel={(id, sampleStep) => customProcessIdNames[id] || sampleStep?.processDescription || getProcessIdName(id)}
                  onSelect={setSelectedProcessId}
                  allGroupIds={[...Object.keys(APQC_PROCESS_ID_NAMES), ...Object.keys(customProcessIdNames)].filter(id => getProcessGroupId(id) === selectedProcessGroupId)}
                  onAddNew={() => setAddShellState({ level: 'processId', idPrefix: `${selectedProcessGroupId}.` })}
                  addNewLabel="+ Add new process ID"
                  onRename={(id, label) => openRename('processId', id, label)}
                />
              </>
            ) : (
              <>
                <div className={styles.toolbar}>
                  {activeLock && (
                    <MessageBar messageBarType={MessageBarType.warning} className={styles.lockBanner}>
                      Locked by {activeLock.lockedBy} on {new Date(activeLock.lockedAt).toLocaleString()}
                      {activeLock.reason ? ` — ${activeLock.reason}` : ''}. Read-only until it's unlocked.
                    </MessageBar>
                  )}
                  <div className={styles.toolbarRow}>
                    <DefaultButton text="Back to Process IDs" onClick={() => { setSelectedProcessId(undefined); setDrilledDownStepId(undefined); setSelectedFlowRegion(undefined); }} />
                    {activeLock ? (
                      <DefaultButton
                        text="Unlock swimlane"
                        iconProps={{ iconName: 'Unlock' }}
                        onClick={() => setLockDialogMode('unlock')}
                      />
                    ) : (
                      <DefaultButton
                        text="Lock swimlane"
                        iconProps={{ iconName: 'Lock' }}
                        disabled={visibleSteps.length === 0}
                        onClick={() => setLockDialogMode('lock')}
                      />
                    )}
                    <DefaultButton
                      text="Leave a comment"
                      iconProps={{ iconName: 'Comment' }}
                      onClick={() => setCommentDialogOpen(true)}
                    />
                    <DefaultButton
                      text={`Undo history${undoStack.length > 0 ? ` (${undoStack.length})` : ''}`}
                      iconProps={{ iconName: 'History' }}
                      disabled={undoStack.length === 0}
                      onClick={() => setUndoHistoryOpen(true)}
                    />
                    <IconButton
                      menuIconProps={{ iconName: 'More' }}
                      title="More actions"
                      ariaLabel="More actions"
                      styles={{ root: { border: '1px solid var(--border)', borderRadius: 4 } }}
                      menuProps={{
                        items: [
                          { key: 'addNew', text: '+ Add new process', iconProps: { iconName: 'Add' }, onClick: () => { setNewProcessOpen(true); }, disabled: !!activeLock },
                          {
                            key: 'duplicateRegion',
                            text: 'Duplicate to another region',
                            iconProps: { iconName: 'Copy' },
                            disabled: duplicateSourceSteps.length === 0 || !!activeLock,
                            onClick: () => { setDuplicateRegionOpen(true); }
                          },
                          { key: 'importCsv', text: 'Import CSV', iconProps: { iconName: 'Upload' }, onClick: () => { setImportOpen(true); }, disabled: !!activeLock },
                          // Not gated by activeLock - exporting is read-only, same reasoning as "Leave a comment".
                          { key: 'exportCsv', text: 'Export CSV', iconProps: { iconName: 'Download' }, disabled: steps.length === 0, onClick: handleExportCsv },
                          {
                            key: 'deleteFlow',
                            text: `Delete flow (${visibleSteps.length})`,
                            iconProps: { iconName: 'Delete', styles: { root: { color: 'var(--risk-high)' } } },
                            disabled: visibleSteps.length === 0 || !!activeLock,
                            onClick: () => { setBulkDeleteOpen(true); }
                          }
                        ]
                      }}
                    />
                  </div>
                  <FlowRegionTabs
                    steps={stepsInProcessId}
                    selectedRegion={selectedFlowRegion}
                    onSelect={region => {
                      // A Process Step ID tab selected in one region may not
                      // exist (or mean the same thing) in another - clear it
                      // so switching regions never leaves the canvas
                      // showing a stale, unrelated tab's worth of nothing.
                      setSelectedFlowRegion(region);
                      setDrilledDownStepId(undefined);
                    }}
                  />
                  <ProcessStepTabs
                    steps={stepsInRegion}
                    selectedStepId={drilledDownStepId}
                    onSelect={setDrilledDownStepId}
                    onAddNew={activeLock || addBlockedInAllView ? undefined : () => setAddSectionOpen(true)}
                    onRenameSection={activeLock ? undefined : openRenameSection}
                  />
                </div>

                <SwimlaneCanvas
                  steps={visibleSteps}
                  allSteps={steps}
                  swimlaneSteps={stepsInRegion}
                  edges={edges}
                  riskStatements={riskStatements}
                  controlStatements={controlStatements}
                  processDescription={currentProcessDescription}
                  dataService={dataService}
                  onControlLinked={handleControlLinked}
                  onControlCreated={handleControlCreated}
                  onRiskCreated={handleRiskCreated}
                  onRenameSection={activeLock ? undefined : openRenameSection}
                  employees={employees}
                  isLocked={!!activeLock}
                  onLabelEdge={handleLabelEdge}
                  onEditStep={handleEditStep}
                  onDeleteStep={handleDeleteStep}
                  onMoveStep={handleEditStep}
                  onCreateStep={handleCreateStepFromShape}
                  autoOpenStepId={autoOpenStepId}
                  onAutoOpenHandled={() => setAutoOpenStepId(undefined)}
                  swimlaneStage={currentStage}
                  stageSetBy={activeStatus?.setBy}
                  onToggleStage={handleToggleStage}
                />

                {!activeLock && (
                <div className={styles.addStepForm}>
                  <h3 className={styles.cardTitle}>Add a step</h3>
                  {addBlockedInAllView ? (
                    <p className={styles.mutedNote}>
                      "All" is a combined view across every region this Process ID has ({Array.from(new Set(
                        stepsInProcessId.map(s => s.region).filter((r): r is string => !!r)
                      )).join(', ')}), not its own swimlane - select one of those region tabs above to add a step to it.
                    </p>
                  ) : (
                    <>
                      <ProcessStepForm
                        value={newStepDraft}
                        onChange={setNewStepDraft}
                        employees={employees}
                        dependsOnOptions={addStepDependsOnOptions}
                        riskStatements={riskStatements}
                        controlStatements={controlStatements}
                        processStepId={drilledDownStepId || selectedProcessId || ''}
                        processDescription={currentProcessDescription}
                        dataService={dataService}
                        onControlLinked={handleControlLinked}
                        onControlCreated={handleControlCreated}
                        onRiskCreated={handleRiskCreated}
                      />
                      <PrimaryButton
                        text={saving ? 'Adding...' : 'Add step'}
                        disabled={saving || !newStepDraft.actionDescription.trim()}
                        onClick={handleAddStep}
                      />
                    </>
                  )}
                </div>
                )}

                <SwimlaneComments comments={commentsForSwimlane} />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default SwimlaneStudio;
