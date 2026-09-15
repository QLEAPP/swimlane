import * as React from 'react';
import { Modal, PrimaryButton, DefaultButton, TextField, Dropdown, IDropdownOption, ComboBox, IComboBoxOption } from '@fluentui/react';
import { IControlStatement } from '../models/IControlStatement';
import { IRiskStatement, GUARANTEED_FUNCTIONS } from '../models/IRiskStatement';
import { IDataService } from '../services/IDataService';
import styles from './AddHierarchyShellModal.module.scss';

// Standard control terminology (added 2026-09-15 at the user's request) -
// not a confirmed real SharePoint choice list, just sensible fixed
// options so these fields are picked rather than free-typed.
const CONTROL_TYPE_OPTIONS: IDropdownOption[] = ['Preventive', 'Detective', 'Corrective'].map(v => ({ key: v, text: v }));
const EXECUTION_METHOD_OPTIONS: IDropdownOption[] = ['Manual', 'Automated', 'IT-dependent'].map(v => ({ key: v, text: v }));

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
// Only a handful of the real columns are collected here (Control
// Description, Control Owner, Control Type, Execution Method, Function) -
// the rest (Risk ID/Statement, Frequency, Evidence, Status, Design/
// Operating Effective?, Mapping Notes) were removed from this form
// entirely 2026-09-15 at the user's request, left blank on creation.
// Control ID is likewise not a field - auto-generated server-side (see
// nextControlId). Link Key is deliberately NOT a field either - it's set
// afterward via ControlLinkPicker when the control is actually tied to a
// step, not guessed/typed at creation time.
const AddControlModal: React.FC<IAddControlModalProps> = ({ isOpen, dataService, controlStatements, riskStatements, onDismiss, onCreated }) => {
  const [controlDescription, setControlDescription] = React.useState('');
  const [controlOwner, setControlOwner] = React.useState('');
  const [controlType, setControlType] = React.useState('');
  const [executionMethod, setExecutionMethod] = React.useState('');
  // Named controlFunction, not function - "function" is a reserved word
  // and can't be a local variable/state name (same reasoning as
  // AddRiskModal's riskFunction).
  const [controlFunction, setControlFunction] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (isOpen) {
      setControlDescription('');
      setControlOwner('');
      setControlType('');
      setExecutionMethod('');
      setControlFunction('');
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
      frequency: '',
      evidence: '',
      status: '',
      designEffective: '',
      operatingEffective: '',
      function: controlFunction.trim(),
      linkKey: '',
      mappingNotes: ''
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
      <ComboBox
        label="Function"
        placeholder={functionOptions.length === 0 ? 'No functions in use yet' : 'Choose from the list...'}
        selectedKey={controlFunction || null}
        options={functionOptions}
        autoComplete="on"
        disabled={functionOptions.length === 0}
        onChange={(_e, option) => setControlFunction(option ? String(option.key) : '')}
      />

      <div className={styles.footer}>
        <DefaultButton text="Cancel" onClick={onDismiss} disabled={saving} />
        <PrimaryButton text={saving ? 'Adding...' : 'Add'} onClick={handleCreate} disabled={!canSubmit} />
      </div>
    </Modal>
  );
};

export default AddControlModal;
