import * as React from 'react';
import { Modal, PrimaryButton, DefaultButton, TextField, Dropdown, IDropdownOption, ComboBox, IComboBoxOption } from '@fluentui/react';
import { IControlStatement } from '../models/IControlStatement';
import { IRiskStatement, GUARANTEED_FUNCTIONS } from '../models/IRiskStatement';
import { IDataService } from '../services/IDataService';
import styles from './AddHierarchyShellModal.module.scss';

// Standard control terminology (added 2026-09-15 at the user's request) -
// not a confirmed real SharePoint choice list, just sensible fixed
// options so these three fields are picked rather than free-typed.
const CONTROL_TYPE_OPTIONS: IDropdownOption[] = ['Preventive', 'Detective', 'Corrective'].map(v => ({ key: v, text: v }));
const EXECUTION_METHOD_OPTIONS: IDropdownOption[] = ['Manual', 'Automated', 'IT-dependent'].map(v => ({ key: v, text: v }));
const FREQUENCY_OPTIONS: IDropdownOption[] = ['Continuous', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'].map(v => ({ key: v, text: v }));

export interface IAddControlModalProps {
  isOpen: boolean;
  dataService: IDataService;
  controlStatements: IControlStatement[];
  riskStatements: IRiskStatement[];
  onDismiss: () => void;
  onCreated: (created: IControlStatement) => void;
}

// Writes a real row into "Control Register" - same deliberate exception
// as AddRiskModal (see the schema comment on IDataService.addControlStatement).
// Link Key is deliberately NOT a field here - it's set afterward via
// ControlLinkPicker when the control is actually tied to a step, not
// guessed/typed at creation time. Control ID is likewise not a field -
// auto-generated server-side (see nextControlId), same reasoning as Risk
// ID's own auto-generation. Risk ID/Risk Statement removed entirely
// 2026-09-15 at the user's request - a control's tie to a risk only ever
// happens through "Link to a risk" in ControlLinkPicker's own create
// flow, which fills both automatically; never typed by hand here.
const AddControlModal: React.FC<IAddControlModalProps> = ({ isOpen, dataService, controlStatements, riskStatements, onDismiss, onCreated }) => {
  const [controlDescription, setControlDescription] = React.useState('');
  const [controlOwner, setControlOwner] = React.useState('');
  const [controlType, setControlType] = React.useState('');
  const [executionMethod, setExecutionMethod] = React.useState('');
  const [frequency, setFrequency] = React.useState('');
  const [evidence, setEvidence] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [designEffective, setDesignEffective] = React.useState('');
  const [operatingEffective, setOperatingEffective] = React.useState('');
  // Named controlFunction, not function - "function" is a reserved word
  // and can't be a local variable/state name (same reasoning as
  // AddRiskModal's riskFunction).
  const [controlFunction, setControlFunction] = React.useState('');
  const [mappingNotes, setMappingNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (isOpen) {
      setControlDescription('');
      setControlOwner('');
      setControlType('');
      setExecutionMethod('');
      setFrequency('');
      setEvidence('');
      setStatus('');
      setDesignEffective('');
      setOperatingEffective('');
      setControlFunction('');
      setMappingNotes('');
      setError(undefined);
    }
  }, [isOpen]);

  // Same list ControlLinkPicker's own "create a new control" Function
  // field draws from - pulls from both registers, not just Control
  // Register's own (usually sparser), so there's more to pick from.
  const functionOptions: IComboBoxOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_FUNCTIONS, ...controlStatements.map(c => c.function), ...riskStatements.map(r => r.function)].filter(Boolean)))
      .sort()
      .map(f => ({ key: f, text: f })),
    [controlStatements, riskStatements]
  );

  const trimmedDescription = controlDescription.trim();
  const canSubmit = trimmedDescription.length > 0 && !saving;

  const handleCreate = (): void => {
    if (!canSubmit) return;
    setSaving(true);
    setError(undefined);
    dataService.addControlStatement({
      controlId: '', // ignored/overwritten server-side - see nextControlId
      riskId: '',
      riskStatement: '',
      controlDescription: trimmedDescription,
      controlOwner: controlOwner.trim(),
      controlType: controlType.trim(),
      executionMethod: executionMethod.trim(),
      frequency: frequency.trim(),
      evidence: evidence.trim(),
      status: status.trim(),
      designEffective: designEffective.trim(),
      operatingEffective: operatingEffective.trim(),
      function: controlFunction.trim(),
      linkKey: '',
      mappingNotes: mappingNotes.trim()
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
        <h3>Add a control</h3>
        <p>Writes a new row into the control register - Control Description is the only required field. Link it to a step afterward from the step's edit panel.</p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <p className={styles.preview}>Control ID will be assigned automatically (CTL-XXX) - not something you type.</p>
      <TextField
        label="Control description"
        placeholder="Describe the control"
        value={controlDescription}
        onChange={(_e, v) => setControlDescription(v || '')}
        multiline
        rows={3}
      />
      <TextField label="Control owner" placeholder="e.g. Finance Manager" value={controlOwner} onChange={(_e, v) => setControlOwner(v || '')} />
      <Dropdown
        label="Control type"
        placeholder="Choose from the list..."
        selectedKey={controlType || null}
        options={CONTROL_TYPE_OPTIONS}
        onChange={(_e, option) => setControlType(option ? String(option.key) : '')}
      />
      <Dropdown
        label="Execution method"
        placeholder="Choose from the list..."
        selectedKey={executionMethod || null}
        options={EXECUTION_METHOD_OPTIONS}
        onChange={(_e, option) => setExecutionMethod(option ? String(option.key) : '')}
      />
      <Dropdown
        label="Frequency"
        placeholder="Choose from the list..."
        selectedKey={frequency || null}
        options={FREQUENCY_OPTIONS}
        onChange={(_e, option) => setFrequency(option ? String(option.key) : '')}
      />
      <TextField label="Evidence" placeholder="How this control's operation is evidenced" value={evidence} onChange={(_e, v) => setEvidence(v || '')} />
      <TextField label="Status" placeholder="e.g. Active" value={status} onChange={(_e, v) => setStatus(v || '')} />
      <TextField label="Design effective?" placeholder="e.g. Yes" value={designEffective} onChange={(_e, v) => setDesignEffective(v || '')} />
      <TextField label="Operating effective?" placeholder="e.g. Yes" value={operatingEffective} onChange={(_e, v) => setOperatingEffective(v || '')} />
      <ComboBox
        label="Function"
        placeholder={functionOptions.length === 0 ? 'No functions in use yet' : 'Choose from the list...'}
        selectedKey={controlFunction || null}
        options={functionOptions}
        autoComplete="on"
        disabled={functionOptions.length === 0}
        onChange={(_e, option) => setControlFunction(option ? String(option.key) : '')}
      />
      <TextField
        label="Mapping notes"
        placeholder="Optional notes"
        value={mappingNotes}
        onChange={(_e, v) => setMappingNotes(v || '')}
        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
      />

      <div className={styles.footer}>
        <DefaultButton text="Cancel" onClick={onDismiss} disabled={saving} />
        <PrimaryButton text={saving ? 'Adding...' : 'Add'} onClick={handleCreate} disabled={!canSubmit} />
      </div>
    </Modal>
  );
};

export default AddControlModal;
