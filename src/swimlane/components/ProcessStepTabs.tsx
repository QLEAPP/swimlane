import * as React from 'react';
import { IProcessStep } from '../models/IProcessStep';
import { compareProcessStepIds } from '../utils/columns';
import styles from './ProcessStepTabs.module.scss';

export interface IProcessStepTabsProps {
  steps: IProcessStep[]; // all steps for the currently selected Process ID
  // undefined only ever transiently - true while there are no sections yet
  // to select, or for the one render before the auto-select effect below
  // lands on the first real one. Never a real, user-choosable "All" state
  // any more (removed 2026-09-17 at the user's request) - see the effect.
  selectedStepId: string | undefined;
  onSelect: (stepId: string | undefined) => void;
  // Opens the lightweight section-creation flow (see AddStepSectionModal)
  // - undefined when there's nowhere sensible to add one yet (no Progress
  // ID selected).
  onAddNew?: () => void;
  // Small edit affordance on each real tab (not "All") - a section's name
  // (Process Step Name) previously had no way to be changed once created
  // (added 2026-09-15 at the user's request - "it seems like they are not
  // editable at present"). Unlike Category/Process Group/Process ID
  // renames (a separate label-list row), a section's name only ever lives
  // on real step rows (see AddStepSectionModal's own comment on this) -
  // renaming one means updating EVERY step row sharing that Process Step
  // ID, all at once, which is what the caller does with this callback.
  onRenameSection?: (stepId: string, currentName: string) => void;
}

// Drill-down level: each tab narrows to a single Process Step ID (a
// "section"). There used to be an "All" tab here showing every section's
// steps combined, removed 2026-09-17 at the user's request - a section is
// its own real, scoped part of the process (see AddStepSectionModal), not
// meant to be viewed merged together with unrelated ones the way "All"
// did, and it was a common source of confused step counts (steps from
// every section adding up under one number). See the auto-select effect
// below for how a real tab always ends up chosen instead.
const ProcessStepTabs: React.FC<IProcessStepTabsProps> = ({ steps, selectedStepId, onSelect, onAddNew, onRenameSection }) => {
  const stepIds = React.useMemo(
    () => Array.from(new Set(steps.map(s => s.processStepId))).sort(compareProcessStepIds),
    [steps]
  );

  // Lands on the first real section whenever nothing valid is currently
  // selected - covers the initial mount, switching to a Process ID/region
  // that resets selectedStepId back to undefined, and a previously-
  // selected section having just been deleted out from under it. Does
  // nothing when stepIds is empty (no sections exist yet at all) - there's
  // genuinely nothing to select until "+ Add section" creates one.
  React.useEffect(() => {
    if (stepIds.length === 0) return;
    if (selectedStepId === undefined || !stepIds.includes(selectedStepId)) {
      onSelect(stepIds[0]);
    }
  }, [stepIds, selectedStepId, onSelect]);

  const countFor = (stepId: string): number => steps.filter(s => s.processStepId === stepId).length;

  // Same "first matching step wins" precedence used everywhere else a
  // section needs a representative name - every row sharing a Process
  // Step ID is expected to carry the same Process Step Name, but nothing
  // enforces that, so this is just whichever one happens to be first.
  const nameFor = (stepId: string): string => steps.find(s => s.processStepId === stepId)?.processStepName || '';

  return (
    <div className={styles.tabs}>
      {stepIds.length === 0 && <p className={styles.empty}>No sections yet - add one below.</p>}
      {stepIds.map(stepId => (
        <div className={styles.tabWrap} key={stepId}>
          <button
            className={`${styles.tab} ${selectedStepId === stepId ? styles.active : ''}`}
            onClick={() => onSelect(stepId)}
          >
            {stepId} <span className={styles.count}>{countFor(stepId)}</span>
          </button>
          {onRenameSection && (
            <button
              type="button"
              className={styles.renameButton}
              title="Rename this section"
              onClick={e => { e.stopPropagation(); onRenameSection(stepId, nameFor(stepId)); }}
            >
              ✎
            </button>
          )}
        </div>
      ))}
      {onAddNew && (
        <button type="button" className={styles.addTab} onClick={onAddNew}>
          + Add section
        </button>
      )}
    </div>
  );
};

export default ProcessStepTabs;
