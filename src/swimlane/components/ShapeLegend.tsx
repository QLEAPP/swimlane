import * as React from 'react';
import { SwimlaneStage } from '../models/ISwimlaneStatus';
import styles from './ShapeLegend.module.scss';

export interface IShapeLegendProps {
  // Drag-to-create: dragging a "Step type" swatch and dropping it onto a
  // cell in the canvas grid creates a new step there with that shape
  // already set - see SwimlaneCanvas's draggingNewShape/onCreateStep.
  // Values match ProcessStepForm's SHAPE_OPTIONS keys exactly ('Process
  // Step' | 'Decision' | 'Approval' | 'Document'), since they're written
  // straight into the new step's shapeOverride field.
  onDragShapeStart: (shapeOverride: string) => void;
  onDragShapeEnd: () => void;
  // Draft/Finalised status for the swimlane on screen right now (see
  // ISwimlaneStatus) - shown underneath the rest of the legend with a
  // toggle button. Purely a display label; never gates anything.
  stage: SwimlaneStage;
  // Undefined means no one has ever explicitly set a stage - Draft shows
  // with no attribution rather than a misleading "set by nobody" line.
  stageSetBy: string | undefined;
  onToggleStage: () => void;
  // While locked the legend stops offering drag-to-add and the stage
  // toggle, and shows a LOCKED badge next to the stage - user report,
  // 2026-10-20: a locked swimlane still saying "drag onto the flow to add"
  // and offering "Mark as Finalised" read as contradicting the lock.
  isLocked: boolean;
  // True only while the PDF export is capturing - drops the same editing-
  // only wording/buttons as isLocked does (but without the LOCKED badge),
  // since a printed diagram can't be dragged onto or toggled either.
  printing?: boolean;
}

// Step type is conveyed by both FORM (mirrors getShapeType in
// models/IProcessStep.ts) and, for Decision/Approval, FILL COLOR too -
// both plain, unconditional lists rather than derived from the data,
// since a legend should show what every possible shape/color means
// regardless of which ones happen to appear in the steps on screen.
const ShapeLegend: React.FC<IShapeLegendProps> = ({ onDragShapeStart, onDragShapeEnd, stage, stageSetBy, onToggleStage, isLocked, printing = false }) => {
  const readOnly = isLocked || printing;
  const itemClass = readOnly ? styles.item : `${styles.item} ${styles.draggableItem}`;
  const dragProps = (shapeOverride: string, label: string): React.HTMLAttributes<HTMLSpanElement> => readOnly ? {} : ({
    title: `Drag onto the flow to add ${label}`,
    draggable: true,
    onDragStart: e => {
      e.dataTransfer.effectAllowed = 'copy';
      // Firefox refuses to start a drag at all unless setData is called -
      // same reasoning as SwimlaneCanvas's own handleDragStart.
      e.dataTransfer.setData('text/plain', shapeOverride);
      onDragShapeStart(shapeOverride);
    },
    onDragEnd: onDragShapeEnd
  });

  return (
    <div className={styles.legend}>
      <div className={styles.row}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>{readOnly ? 'Step types' : 'Step type - drag onto the flow to add'}</span>
          <span className={itemClass} {...dragProps('Process Step', 'a Process step')}>
            <span className={`${styles.swatch} ${styles.process}`} />
            Process step
          </span>
          <span className={itemClass} {...dragProps('Decision', 'a Decision')}>
            <span className={`${styles.swatch} ${styles.decision}`} />
            Decision
          </span>
          <span className={itemClass} {...dragProps('Approval', 'an Approval')}>
            <span className={`${styles.swatch} ${styles.approval}`} />
            Approval
          </span>
          <span className={itemClass} {...dragProps('Document', 'a Document')}>
            <span className={`${styles.swatch} ${styles.document}`} />
            Document
          </span>
        </div>
        <div className={styles.divider} />
        <div className={styles.group}>
          <span className={styles.groupLabel}>Linked risk</span>
          <span className={styles.item}>
            <span className={styles.markerSample}>!</span>
            {printing ? 'Linked risk' : 'Linked risk - click the step for details'}
          </span>
        </div>
      </div>

      {/*
        Its own row underneath the rest of the key, per explicit user
        request - not just another inline group in the row above, since
        that would read as one more shape-legend entry rather than a
        distinct status for the whole swimlane.
      */}
      <div className={styles.stageRow}>
        {isLocked && <span className={`${styles.stageBadge} ${styles.stageLocked}`}>&#128274; Locked - view only</span>}
        <span className={`${styles.stageBadge} ${stage === 'Finalised' ? styles.stageFinalised : styles.stageDraft}`}>
          {stage}
        </span>
        {stageSetBy && <span className={styles.stageBy}>set by {stageSetBy}</span>}
        {!readOnly && (
          <button type="button" className={styles.stageToggle} onClick={onToggleStage}>
            Mark as {stage === 'Draft' ? 'Finalised' : 'Draft'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ShapeLegend;
