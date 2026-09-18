import * as React from 'react';
import { Modal, PrimaryButton, DefaultButton, TextField } from '@fluentui/react';
import { IProcessStep, nextSectionId } from '../models/IProcessStep';
import { IDataService } from '../services/IDataService';
import styles from './AddStepSectionModal.module.scss';

export interface IAddStepSectionModalProps {
  isOpen: boolean;
  // Already includes the Process ID plus a trailing dot, e.g. "9.6.1." -
  // the user only ever types the 4th (Activity) segment, same as every
  // other ID field in this app that's already anchored to a known parent.
  idPrefix: string;
  // Any existing step already in this Process ID (any region/section) -
  // apqcTitle/processDescription describe the Process ID as a whole, not
  // this specific section, so a new section inherits them rather than
  // asking again (same reasoning as handleAddStep's own fallback logic).
  referenceStep: IProcessStep | undefined;
  // The current region's own steps (not every region) - used only to work
  // out the next available Process Step ID when that field is left blank
  // (see nextSectionId). Same region-scoping reasoning as
  // stepsInSameRegionAs elsewhere: a different region reusing the same
  // number is a separate, unrelated section, not a collision to avoid.
  stepsInRegion: IProcessStep[];
  region: string | undefined; // the currently-selected flow region, if any - auto-tags the new section the same way "Add a step" does
  dataService: IDataService;
  onDismiss: () => void;
  onCreated: (created: IProcessStep) => void;
}

// The 4th (Activity) level - e.g. "9.6.1.4" as a new sibling to
// "9.6.1.1"/"9.6.1.2"/"9.6.1.3" - never had a lightweight shell-creation
// path the way Process Group and Process ID do (see
// AddHierarchyShellModal). The only way to add one was the full "Add new
// process" modal, which both starts an entirely separate area (asking for
// Process Description again, unrelated to the section you're actually
// trying to extend) AND demands full step content up front - confirmed
// as a real, confusing bug source: a user typing into that modal's
// generically-labeled "Process description" field ended up overwriting
// the Process ID's own name with junk. This creates ONE minimal, real
// step (there's no separate "section label" list the way Process
// Group/Process ID have - a section's name only ever exists on real step
// rows) with just an ID and a name, immediately editable afterward via
// the normal edit panel for everything else (Action, Risk, Responsible,
// Depends on...).
const AddStepSectionModal: React.FC<IAddStepSectionModalProps> = ({
  isOpen, idPrefix, referenceStep, stepsInRegion, region, dataService, onDismiss, onCreated
}) => {
  const [id, setId] = React.useState('');
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (isOpen) {
      setId(idPrefix);
      setName('');
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, idPrefix]);

  const trimmedId = id.trim();
  // Not compulsory (changed 2026-09-18 at the user's request - "if I just
  // save a title that should allow me to work") - blank means either the
  // field's never been touched (still just idPrefix, e.g. "9.6.1.") or
  // genuinely emptied out; either way, nothing beyond the known prefix has
  // actually been typed, so handleCreate below auto-assigns the next
  // available number instead (see nextSectionId).
  const withoutPrefix = trimmedId.startsWith(idPrefix) ? trimmedId.slice(idPrefix.length) : trimmedId;
  const isBlankId = withoutPrefix.trim().length === 0;
  const idLooksValid = isBlankId || /^\d+(\.\d+){3}$/.test(trimmedId);
  const trimmedName = name.trim();
  const canSubmit = idLooksValid && trimmedName.length > 0 && !saving;

  const handleCreate = (): void => {
    if (!canSubmit) return;
    setSaving(true);
    setError(undefined);
    const finalId = isBlankId ? nextSectionId(idPrefix, stepsInRegion) : trimmedId;
    dataService.addProcessStep({
      apqcTitle: referenceStep?.apqcTitle || idPrefix.replace(/\.$/, ''),
      processDescription: referenceStep?.processDescription || '',
      processStepId: finalId,
      processStepName: trimmedName,
      actionType: 'Execute (Within Limits)',
      action: '',
      // Deliberately NOT the section name (was, until 2026-09-15) - the
      // section's own name already shows once, in the column header above
      // the whole group (see SwimlaneCanvas); repeating it as this seed
      // step's own action label made it look like a second, redundant
      // step duplicating the section title rather than a real action
      // waiting to be filled in. Generic instead, same "real but minimal"
      // spirit as the Process Group/Process ID shells, immediately
      // editable on the canvas afterward either way.
      actionDescription: 'New step - click to edit',
      responsibleJobTitle: '',
      region: region || '',
      dependsOn: []
    })
      .then(created => {
        setSaving(false);
        onCreated(created);
      })
      .catch((err: Error) => {
        setSaving(false);
        setError(err.message);
      });
  };

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} isBlocking={false} containerClassName={styles.modal}>
      <div className={styles.header}>
        <h3>Add a section</h3>
        <p>Just a name is enough - add real steps to it afterward the same way you would to any other section.</p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <TextField
        label="Process Step ID (optional - not compulsory)"
        description="Leave as-is (or clear it) to have the next number assigned automatically."
        value={id}
        onChange={(_e, v) => setId(v || '')}
        errorMessage={!isBlankId && !idLooksValid ? `Needs exactly 4 dot-separated numbers, e.g. ${idPrefix}1 - or leave it blank/as-is to auto-assign one` : undefined}
      />
      <TextField
        label="Section name"
        placeholder="e.g. Create Purchase Order"
        value={name}
        onChange={(_e, v) => setName(v || '')}
        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
      />

      <div className={styles.footer}>
        <DefaultButton text="Cancel" onClick={onDismiss} disabled={saving} />
        <PrimaryButton text={saving ? 'Creating...' : 'Create'} onClick={handleCreate} disabled={!canSubmit} />
      </div>
    </Modal>
  );
};

export default AddStepSectionModal;
