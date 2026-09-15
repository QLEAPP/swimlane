import * as React from 'react';
import { Modal, PrimaryButton, DefaultButton, TextField, ComboBox, IComboBoxOption } from '@fluentui/react';
import { IControlStatement } from '../models/IControlStatement';
import { IRiskStatement, GUARANTEED_FUNCTIONS } from '../models/IRiskStatement';
import { IDataService } from '../services/IDataService';
import styles from './AddHierarchyShellModal.module.scss';

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
// guessed/typed at creation time.
const AddControlModal: React.FC<IAddControlModalProps> = ({ isOpen, dataService, controlStatements, riskStatements, onDismiss, onCreated }) => {
  const [controlId, setControlId] = React.useState('');
  const [riskId, setRiskId] = React.useState('');
  const [riskStatement, setRiskStatement] = React.useState('');
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
      setControlId('');
      setRiskId('');
      setRiskStatement('');
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
      controlId: controlId.trim(),
      riskId: riskId.trim(),
      riskStatement: riskStatement.trim(),
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

      <TextField label="Control ID" placeholder="e.g. CTL-042" value={controlId} onChange={(_e, v) => setControlId(v || '')} />
      <TextField label="Risk ID" placeholder="e.g. OP-014" value={riskId} onChange={(_e, v) => setRiskId(v || '')} />
      <TextField label="Risk statement" placeholder="The risk this control addresses" value={riskStatement} onChange={(_e, v) => setRiskStatement(v || '')} multiline rows={2} />
      <TextField
        label="Control description"
        placeholder="Describe the control"
        value={controlDescription}
        onChange={(_e, v) => setControlDescription(v || '')}
        multiline
        rows={3}
      />
      <TextField label="Control owner" placeholder="e.g. Finance Manager" value={controlOwner} onChange={(_e, v) => setControlOwner(v || '')} />
      <TextField label="Control type" placeholder="e.g. Preventive" value={controlType} onChange={(_e, v) => setControlType(v || '')} />
      <TextField label="Execution method" placeholder="e.g. Automated" value={executionMethod} onChange={(_e, v) => setExecutionMethod(v || '')} />
      <TextField label="Frequency" placeholder="e.g. Monthly" value={frequency} onChange={(_e, v) => setFrequency(v || '')} />
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
