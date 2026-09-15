import * as React from 'react';
import { IProcessStep } from '../models/IProcessStep';
import { compareProcessStepIds } from '../utils/columns';
import styles from './ProcessStepTabs.module.scss';

export interface IProcessStepTabsProps {
  steps: IProcessStep[]; // all steps for the currently selected Process ID
  selectedStepId: string | undefined; // undefined = "All" (top-level view)
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

// Drill-down level of the two confirmed navigation levels: "All" shows
// every row under the Process ID as one continuous flow; each tab
// narrows to a single Process Step ID.
const ProcessStepTabs: React.FC<IProcessStepTabsProps> = ({ steps, selectedStepId, onSelect, onAddNew, onRenameSection }) => {
  const stepIds = React.useMemo(
    () => Array.from(new Set(steps.map(s => s.processStepId))).sort(compareProcessStepIds),
    [steps]
  );

  const countFor = (stepId: string | undefined): number =>
    stepId === undefined ? steps.length : steps.filter(s => s.processStepId === stepId).length;

  // Same "first matching step wins" precedence used everywhere else a
  // section needs a representative name - every row sharing a Process
  // Step ID is expected to carry the same Process Step Name, but nothing
  // enforces that, so this is just whichever one happens to be first.
  const nameFor = (stepId: string): string => steps.find(s => s.processStepId === stepId)?.processStepName || '';

  return (
    <div className={styles.tabs}>
      <button
        className={`${styles.tab} ${selectedStepId === undefined ? styles.active : ''}`}
        onClick={() => onSelect(undefined)}
      >
        All <span className={styles.count}>{countFor(undefined)}</span>
      </button>
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
