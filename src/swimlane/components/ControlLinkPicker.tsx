import * as React from 'react';
import { Dropdown, IDropdownOption, ComboBox, IComboBoxOption, TextField, DefaultButton, PrimaryButton, IconButton } from '@fluentui/react';
import { IControlStatement } from '../models/IControlStatement';
import { IRiskStatement, GUARANTEED_FUNCTIONS } from '../models/IRiskStatement';
import { IDataService } from '../services/IDataService';
import styles from './RiskLinkPicker.module.scss';

export interface IControlLinkPickerProps {
  controlStatements: IControlStatement[];
  riskStatements: IRiskStatement[];
  // The step being edited/created - this IS what gets written into a
  // chosen (or newly-created) Control's own Link Key field (see
  // setControlLinkKey/addControlStatement below), not stored anywhere on
  // the step itself. Falsy while a brand-new process's Process Step ID
  // hasn't been typed yet (see NewProcessModal) - linking/creating is
  // disabled until there's a real value to link against.
  processStepId: string;
  // This Process ID's own name (e.g. "Process accounts payable (AP)") -
  // shown as context when creating a new control, and used to narrow the
  // Risk options offered there to ones from the same process (see the
  // component comment on the "create" section below).
  processDescription: string;
  dataService: IDataService;
  // Fires immediately after a link/unlink write succeeds, with the
  // Control's own new state - lets the caller (SwimlaneStudio) keep its
  // controlStatements list in sync without a full reload.
  onLinked: (updated: IControlStatement) => void;
  // Fires after a brand-new control is created via the inline "create"
  // section - distinct from onLinked since this is a genuinely new row,
  // not an update to one already in controlStatements.
  onCreated: (created: IControlStatement) => void;
}

// Single-step picker (Function, then a Control within it) - simpler than
// RiskLinkPicker's Function-then-Risk-then-severity, for two real reasons:
// Control Register has no severity/rating concept to ask for (confirmed
// at the user's request - a plain link is enough), and linking here writes
// STRAIGHT to the chosen Control's own Link Key field (see
// IDataService.setControlLinkKey) rather than staying pending until the
// step's own "Save changes" - there's no step-side array to hold a draft
// in, Control Register is the only place this link lives. That also means
// a Control can only ever point at ONE step at a time (Link Key is a
// single value, not a list) - already-linked controls (to ANY step, not
// just this one) are left out of the picker below rather than silently
// stealing them from wherever they're currently linked; unlink from that
// other step first if it needs to move.
const ControlLinkPicker: React.FC<IControlLinkPickerProps> = ({
  controlStatements, riskStatements, processStepId, processDescription, dataService, onLinked, onCreated
}) => {
  const [controlFunction, setControlFunction] = React.useState<string | undefined>(undefined);
  const [selectedControlId, setSelectedControlId] = React.useState<string | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  // Creating a brand-new control right here (added at the user's request,
  // "as well as" picking an already-existing one above) - most controls
  // won't be typed up front in Control Register the way risks usually
  // are, so waiting until one already exists there before it can be tied
  // to a step was a real gap. Collapses to a button when closed, same
  // reveal pattern as OptionalLinkField.
  const [creating, setCreating] = React.useState(false);
  const [newFunction, setNewFunction] = React.useState('');
  const [newControlText, setNewControlText] = React.useState('');
  const [newRiskId, setNewRiskId] = React.useState<string | undefined>(undefined);
  const [creatingSaving, setCreatingSaving] = React.useState(false);
  const [creatingError, setCreatingError] = React.useState<string | undefined>(undefined);

  const linkedControls = React.useMemo(
    () => controlStatements.filter(c => !!processStepId && c.linkKey === processStepId),
    [controlStatements, processStepId]
  );

  const functionOptions: IDropdownOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_FUNCTIONS, ...controlStatements.map(c => c.function)].filter(Boolean))).sort().map(f => ({ key: f, text: f })),
    [controlStatements]
  );

  const controlOptions: IDropdownOption[] = React.useMemo(
    () => controlStatements
      .filter(c => c.function === controlFunction)
      // Not yet linked to ANY step - see the component comment above for why.
      .filter(c => !c.linkKey)
      .map(c => ({ key: c.id, text: c.controlId ? `${c.controlId} — ${c.controlDescription}` : c.controlDescription })),
    [controlStatements, controlFunction]
  );

  // Function suggestions for the CREATE section pull from both registers,
  // not just Control Register's own (usually sparser, especially before
  // this feature existed) - Risk's Function values are the same
  // vocabulary and there's more of them to draw on.
  const newFunctionOptions: IComboBoxOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_FUNCTIONS, ...controlStatements.map(c => c.function), ...riskStatements.map(r => r.function)].filter(Boolean)))
      .sort()
      .map(f => ({ key: f, text: f })),
    [controlStatements, riskStatements]
  );

  // Narrowed to Risks from the SAME process this step belongs to
  // (confirmed at the user's request: "all risks from APQC process area
  // only... linked to [this process]") rather than the entire Risk
  // Register or just risks already linked to this one step - matches on
  // Risk's own "Process" column (see IRiskStatement.process) against this
  // Process ID's name.
  //
  // Case-insensitive, either-contains-the-other rather than exact equality
  // - CONFIRMED these are two independently-typed free-text fields on two
  // different lists (a step's own Process Description vs a Risk's own
  // Process), not a shared lookup value, so they're not guaranteed to
  // match verbatim even when they clearly mean the same process (e.g. a
  // step's "Process accounts payable" vs a risk's "Process accounts
  // payable (AP)" - real mismatch caught while testing this feature).
  const riskOptionsForNewControl: IDropdownOption[] = React.useMemo(
    () => {
      const normalizedProcess = processDescription.trim().toLowerCase();
      return [
        { key: '', text: '(no risk)' },
        ...riskStatements
          .filter(r => {
            if (!normalizedProcess || !r.process) return false;
            const normalizedRiskProcess = r.process.trim().toLowerCase();
            return normalizedRiskProcess.includes(normalizedProcess) || normalizedProcess.includes(normalizedRiskProcess);
          })
          .map(r => ({ key: r.id, text: r.riskId ? `${r.riskId} — ${r.riskStatement}` : r.riskStatement }))
      ];
    },
    [riskStatements, processDescription]
  );

  const canAdd = !!processStepId && !!controlFunction && !!selectedControlId && !saving;

  const handleAdd = (): void => {
    if (!canAdd || !selectedControlId) return;
    setSaving(true);
    setError(undefined);
    dataService.setControlLinkKey(selectedControlId, processStepId)
      .then(() => {
        const control = controlStatements.find(c => c.id === selectedControlId);
        if (control) onLinked({ ...control, linkKey: processStepId });
        setControlFunction(undefined);
        setSelectedControlId(undefined);
        setSaving(false);
      })
      .catch((err: Error) => {
        setSaving(false);
        setError(err.message);
      });
  };

  const handleRemove = (controlId: string): void => {
    setSaving(true);
    setError(undefined);
    dataService.setControlLinkKey(controlId, '')
      .then(() => {
        const control = controlStatements.find(c => c.id === controlId);
        if (control) onLinked({ ...control, linkKey: '' });
        setSaving(false);
      })
      .catch((err: Error) => {
        setSaving(false);
        setError(err.message);
      });
  };

  const trimmedNewControlText = newControlText.trim();
  const canCreate = !!processStepId && !!newFunction.trim() && trimmedNewControlText.length > 0 && !creatingSaving;

  const handleCreate = (): void => {
    if (!canCreate) return;
    setCreatingSaving(true);
    setCreatingError(undefined);
    const linkedRisk = newRiskId ? riskStatements.find(r => r.id === newRiskId) : undefined;
    dataService.addControlStatement({
      controlId: '',
      riskId: linkedRisk?.riskId || '',
      riskStatement: linkedRisk?.riskStatement || '',
      controlDescription: trimmedNewControlText,
      controlOwner: '',
      controlType: '',
      executionMethod: '',
      frequency: '',
      evidence: '',
      status: '',
      designEffective: '',
      operatingEffective: '',
      function: newFunction.trim(),
      // Auto-linked to the step being worked on right now (confirmed at
      // the user's request) - the whole point of creating it here rather
      // than from the Control Register tab is that it's already tied to
      // this exact step, no separate linking step needed afterward.
      linkKey: processStepId,
      mappingNotes: ''
    })
      .then(created => {
        onCreated(created);
        setNewFunction('');
        setNewControlText('');
        setNewRiskId(undefined);
        setCreatingSaving(false);
      })
      .catch((err: Error) => {
        setCreatingSaving(false);
        setCreatingError(err.message);
      });
  };

  return (
    <div className={styles.picker}>
      <label className={styles.label}>Linked controls</label>

      {error && <p className={styles.empty}>{error}</p>}

      {linkedControls.length > 0 && (
        <ul className={styles.linkedList}>
          {linkedControls.map(control => (
            <li key={control.id} className={styles.linkedRow}>
              <span className={styles.linkedText}>
                {control.controlId ? `${control.controlId} — ${control.controlDescription}` : control.controlDescription}
              </span>
              <IconButton
                iconProps={{ iconName: 'Cancel' }}
                title="Remove this linked control"
                ariaLabel="Remove this linked control"
                className={styles.removeButton}
                disabled={saving}
                onClick={() => handleRemove(control.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {!processStepId ? (
        <p className={styles.empty}>Enter a Process Step ID above first - a control links to that.</p>
      ) : (
        <>
          {controlStatements.length === 0 ? (
            <p className={styles.empty}>No controls loaded from the Control Register yet.</p>
          ) : (
            <div className={styles.addRow}>
              <Dropdown
                placeholder="Function"
                selectedKey={controlFunction}
                options={functionOptions}
                onChange={(_e, option) => { setControlFunction(option ? String(option.key) : undefined); setSelectedControlId(undefined); }}
                className={styles.addField}
              />
              <Dropdown
                placeholder="Control"
                selectedKey={selectedControlId}
                options={controlOptions}
                disabled={!controlFunction}
                onChange={(_e, option) => setSelectedControlId(option ? String(option.key) : undefined)}
                className={styles.addField}
                dropdownWidth="auto"
              />
              <DefaultButton text={saving ? 'Linking...' : '+ Link control'} onClick={handleAdd} disabled={!canAdd} />
            </div>
          )}

          {!creating ? (
            <DefaultButton text="+ Create a new control" onClick={() => setCreating(true)} />
          ) : (
            <div className={styles.createBox}>
              {creatingError && <p className={styles.empty}>{creatingError}</p>}
              {/* Stated explicitly (added 2026-09-16 at the user's request -
                  "so people don't wonder about it") - AddControlModal
                  already said this, this popup's own "create" section
                  hadn't, even though it goes through the exact same
                  auto-generation (see nextControlId). */}
              <p className={styles.empty}>Control ID will be assigned automatically (CTL-XXX) - not something you type.</p>
              <ComboBox
                label="Function"
                placeholder="Choose from the list..."
                selectedKey={newFunction || null}
                autoComplete="on"
                options={newFunctionOptions}
                // No allowFreeform (removed at the user's request) - must
                // pick a real, already-in-use Function rather than typing
                // a new one here, same "come from the list" constraint as
                // Risk Owner (see EmployeePicker).
                onChange={(_e, option) => setNewFunction(option ? String(option.key) : '')}
              />
              <p className={styles.empty}>Process: {processDescription || '(unnamed process)'}</p>
              <TextField
                label="Control"
                placeholder="Describe the control"
                value={newControlText}
                onChange={(_e, v) => setNewControlText(v || '')}
                multiline
                rows={2}
              />
              <Dropdown
                label="Link to a risk (optional)"
                selectedKey={newRiskId || ''}
                options={riskOptionsForNewControl}
                onChange={(_e, option) => setNewRiskId(option && option.key ? String(option.key) : undefined)}
                dropdownWidth="auto"
              />
              <div className={styles.addRow}>
                <PrimaryButton text={creatingSaving ? 'Adding...' : '+ Add control'} onClick={handleCreate} disabled={!canCreate} />
                <DefaultButton text="Cancel" onClick={() => { setCreating(false); setNewFunction(''); setNewControlText(''); setNewRiskId(undefined); setCreatingError(undefined); }} disabled={creatingSaving} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ControlLinkPicker;
