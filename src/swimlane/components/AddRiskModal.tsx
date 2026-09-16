import * as React from 'react';
import { Modal, PrimaryButton, DefaultButton, TextField, Dropdown, IDropdownOption } from '@fluentui/react';
import { IRiskStatement, GUARANTEED_FUNCTIONS, GUARANTEED_RISK_RESPONSES } from '../models/IRiskStatement';
import { IDataService } from '../services/IDataService';
import { APQC_CATEGORY_NAMES } from '../utils/apqcHierarchy';
import styles from './AddHierarchyShellModal.module.scss';

const CATEGORY_OPTIONS: IDropdownOption[] = Object.entries(APQC_CATEGORY_NAMES)
  .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
  .map(([id, name]) => ({ key: id, text: `${id} - ${name}` }));

export interface IAddRiskModalProps {
  isOpen: boolean;
  dataService: IDataService;
  riskStatements: IRiskStatement[];
  onDismiss: () => void;
  onCreated: (created: IRiskStatement) => void;
}

// Writes a real row into "risk register data" - CONFIRMED 2026-08-21, an
// explicit user choice despite that list otherwise being a standing
// enterprise register this app doesn't own (see the schema comment on
// IDataService.addRiskStatement). All nine real columns are editable
// here, same set getRiskStatements/RiskRegisterList already read.
//
// Risk ID is NOT a field - auto-generated server-side (see nextRiskId),
// same treatment as Control ID in AddControlModal, added 2026-09-16 at the
// user's request so it can't be mistyped, left blank, or collide with
// another row. Category is the APQC category the risk sits under (e.g.
// "9 - Manage Financial Resources"), picked from the same fixed list the
// rest of the app's hierarchy pickers use, rather than a free-typed risk
// taxonomy label - changed the same day, same request. Function and Risk
// response are pick-only too, same reasoning as Control's own Function/
// Control type fields. This standalone form (opened from the Risk
// Register tab itself, not from a step's edit panel) has no current
// process/step to prepopulate APQC process area, Process, or Risk owner
// from the way RiskLinkPicker's own "create a new risk" section can - see
// the comment there.
const AddRiskModal: React.FC<IAddRiskModalProps> = ({ isOpen, dataService, riskStatements, onDismiss, onCreated }) => {
  const [category, setCategory] = React.useState('');
  const [apqcProcessArea, setApqcProcessArea] = React.useState('');
  const [process, setProcess] = React.useState('');
  // Named riskFunction, not function - "function" is a reserved word and
  // can't be a local variable/state name, even though it's the real
  // column's display name (see IRiskStatement.function).
  const [riskFunction, setRiskFunction] = React.useState('');
  const [riskStatement, setRiskStatement] = React.useState('');
  const [rootCause, setRootCause] = React.useState('');
  const [riskResponse, setRiskResponse] = React.useState('');
  const [riskOwner, setRiskOwner] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (isOpen) {
      setCategory('');
      setApqcProcessArea('');
      setProcess('');
      setRiskFunction('');
      setRiskStatement('');
      setRootCause('');
      setRiskResponse('');
      setRiskOwner('');
      setError(undefined);
    }
  }, [isOpen]);

  const functionOptions: IDropdownOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_FUNCTIONS, ...riskStatements.map(r => r.function)].filter(Boolean))).sort().map(f => ({ key: f, text: f })),
    [riskStatements]
  );

  const riskResponseOptions: IDropdownOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_RISK_RESPONSES, ...riskStatements.map(r => r.riskResponse)].filter(Boolean))).map(r => ({ key: r, text: r })),
    [riskStatements]
  );

  const trimmedStatement = riskStatement.trim();
  const canSubmit = trimmedStatement.length > 0 && !saving;

  const handleCreate = (): void => {
    if (!canSubmit) return;
    setSaving(true);
    setError(undefined);
    const categoryOption = CATEGORY_OPTIONS.find(o => o.key === category);
    dataService.addRiskStatement({
      riskId: '', // ignored/overwritten server-side - see nextRiskId
      category: categoryOption ? String(categoryOption.text) : '',
      apqcProcessArea: apqcProcessArea.trim(),
      process: process.trim(),
      function: riskFunction.trim(),
      riskStatement: trimmedStatement,
      rootCause: rootCause.trim(),
      riskResponse: riskResponse.trim(),
      riskOwner: riskOwner.trim()
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
        <h3>Add a risk</h3>
        <p>Writes a new row into the risk register - Risk Statement is the only required field. Risk ID is assigned automatically.</p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <Dropdown
        label="Category"
        placeholder="Choose the APQC category..."
        selectedKey={category || null}
        options={CATEGORY_OPTIONS}
        onChange={(_e, option) => setCategory(option ? String(option.key) : '')}
      />
      <TextField
        label="APQC process area"
        placeholder="e.g. 9.6.1"
        value={apqcProcessArea}
        onChange={(_e, v) => setApqcProcessArea(v || '')}
      />
      <TextField
        label="Process"
        placeholder="e.g. Process accounts payable (AP)"
        value={process}
        onChange={(_e, v) => setProcess(v || '')}
      />
      <Dropdown
        label="Function"
        placeholder="Choose from the list..."
        selectedKey={riskFunction || null}
        options={functionOptions}
        onChange={(_e, option) => setRiskFunction(option ? String(option.key) : '')}
      />
      <TextField
        label="Risk statement"
        placeholder="Describe the risk"
        value={riskStatement}
        onChange={(_e, v) => setRiskStatement(v || '')}
        multiline
        rows={3}
      />
      <TextField label="Root cause" placeholder="Why this risk exists" value={rootCause} onChange={(_e, v) => setRootCause(v || '')} multiline rows={2} />
      <Dropdown
        label="Risk response"
        placeholder="Choose from the list..."
        selectedKey={riskResponse || null}
        options={riskResponseOptions}
        onChange={(_e, option) => setRiskResponse(option ? String(option.key) : '')}
      />
      <TextField
        label="Risk owner"
        placeholder="e.g. Finance Manager"
        value={riskOwner}
        onChange={(_e, v) => setRiskOwner(v || '')}
        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
      />

      <div className={styles.footer}>
        <DefaultButton text="Cancel" onClick={onDismiss} disabled={saving} />
        <PrimaryButton text={saving ? 'Adding...' : 'Add'} onClick={handleCreate} disabled={!canSubmit} />
      </div>
    </Modal>
  );
};

export default AddRiskModal;
