import * as React from 'react';
import { Dropdown, IDropdownOption, DefaultButton, PrimaryButton, IconButton, TextField } from '@fluentui/react';
import { IRiskStatement, IRiskLink, RiskLevel, GUARANTEED_FUNCTIONS } from '../models/IRiskStatement';
import { IDataService } from '../services/IDataService';
import styles from './RiskLinkPicker.module.scss';

export interface IRiskLinkPickerProps {
  riskStatements: IRiskStatement[];
  value: IRiskLink[];
  onChange: (value: IRiskLink[]) => void;
  dataService: IDataService;
  // Fires after a brand-new risk is created via the inline "create"
  // section below - distinct from onChange (which only ever adds an
  // already-existing risk's id to THIS step's own linkedRisks) since this
  // is a genuinely new row in the shared Risk Register itself, the same
  // list Risk Register's own "Add a risk" writes to (see AddRiskModal) -
  // lets the caller (SwimlaneStudio) keep its riskStatements list in sync
  // everywhere else that reads it, without a full reload.
  onRiskCreated: (created: IRiskStatement) => void;
}

const SEVERITY_OPTIONS: IDropdownOption[] = [
  { key: 'High', text: 'High' },
  { key: 'Medium', text: 'Medium' },
  { key: 'Low', text: 'Low' }
];

const SEVERITY_CLASS: Record<RiskLevel, string> = {
  High: styles.badgeHigh,
  Medium: styles.badgeMedium,
  Low: styles.badgeLow
};

// Two-step picker (function, then a risk within it) plus a manually-chosen
// severity for THIS step - confirmed design rule: severity isn't derived
// from the register's own numbers, it's a judgment call made at the point
// of tying a risk to a step, so it's asked for explicitly every time
// rather than defaulted or computed. Used inside ProcessStepForm, both for
// "Add a step" and the shape edit panel.
//
// Filters by Function rather than Category (changed 2026-09-08 at the
// user's request) - Function is the grouping people actually think in
// terms of when tying a risk to a step, Category wasn't.
const RiskLinkPicker: React.FC<IRiskLinkPickerProps> = ({ riskStatements, value, onChange, dataService, onRiskCreated }) => {
  const [riskFunction, setRiskFunction] = React.useState<string | undefined>(undefined);
  const [riskId, setRiskId] = React.useState<string | undefined>(undefined);
  const [severity, setSeverity] = React.useState<RiskLevel | undefined>(undefined);

  // Creating a brand-new risk right here (added at the user's request,
  // "add a risk directly from the popup" - "as well as" picking an
  // already-existing one above, same reveal-on-demand pattern as
  // ControlLinkPicker's own "+ Create a new control") rather than having
  // to leave the step, go to the Risk Register tab, add it there, then
  // come back to link it. Every field and the "only Risk Statement is
  // required" rule below matches AddRiskModal exactly - same real
  // register, same rules, whichever door you come in through (confirmed
  // at the user's request: "this should reflect on the full list... same
  // rules as per the full list").
  const [creating, setCreating] = React.useState(false);
  const [newRiskId, setNewRiskId] = React.useState('');
  const [newCategory, setNewCategory] = React.useState('');
  const [newApqcProcessArea, setNewApqcProcessArea] = React.useState('');
  const [newProcess, setNewProcess] = React.useState('');
  const [newFunction, setNewFunction] = React.useState('');
  const [newRiskStatement, setNewRiskStatement] = React.useState('');
  const [newRootCause, setNewRootCause] = React.useState('');
  const [newRiskResponse, setNewRiskResponse] = React.useState('');
  const [newRiskOwner, setNewRiskOwner] = React.useState('');
  // Not part of AddRiskModal's own fields - needed here only because a
  // risk created from inside a step's popup is also immediately linked TO
  // that step (see handleCreate), and every link needs a severity the
  // same way the ordinary "+ Link risk" flow above does.
  const [newSeverity, setNewSeverity] = React.useState<RiskLevel | undefined>(undefined);
  const [creatingSaving, setCreatingSaving] = React.useState(false);
  const [creatingError, setCreatingError] = React.useState<string | undefined>(undefined);

  const risksById = React.useMemo(() => new Map(riskStatements.map(r => [r.id, r])), [riskStatements]);

  const functionOptions: IDropdownOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_FUNCTIONS, ...riskStatements.map(r => r.function)].filter(Boolean))).sort().map(f => ({ key: f, text: f })),
    [riskStatements]
  );

  const riskOptions: IDropdownOption[] = React.useMemo(
    () => riskStatements
      .filter(r => r.function === riskFunction)
      // Already-linked risks aren't offered again - the picker is for
      // adding new links, not editing severity of an existing one
      // (remove and re-add covers that, same as everywhere else in this
      // form re-uses "remove chip, add fresh" instead of in-place edit).
      .filter(r => !value.some(link => link.riskId === r.id))
      .map(r => ({ key: r.id, text: r.riskId ? `${r.riskId} — ${r.riskStatement}` : r.riskStatement })),
    [riskStatements, riskFunction, value]
  );

  const canAdd = !!riskFunction && !!riskId && !!severity;

  const handleAdd = (): void => {
    if (!canAdd || !riskId || !severity) return;
    onChange([...value, { riskId, severity }]);
    setRiskFunction(undefined);
    setRiskId(undefined);
    setSeverity(undefined);
  };

  const handleRemove = (targetRiskId: string): void => {
    onChange(value.filter(link => link.riskId !== targetRiskId));
  };

  const trimmedNewRiskStatement = newRiskStatement.trim();
  // Same single required-field rule as AddRiskModal (trimmedStatement.length
  // > 0) plus a severity, since this risk is also being linked to the
  // current step immediately (see handleCreate) - not part of AddRiskModal
  // itself.
  const canCreate = trimmedNewRiskStatement.length > 0 && !!newSeverity && !creatingSaving;

  const handleCreate = (): void => {
    if (!canCreate || !newSeverity) return;
    setCreatingSaving(true);
    setCreatingError(undefined);
    dataService.addRiskStatement({
      riskId: newRiskId.trim(),
      category: newCategory.trim(),
      apqcProcessArea: newApqcProcessArea.trim(),
      process: newProcess.trim(),
      function: newFunction.trim(),
      riskStatement: trimmedNewRiskStatement,
      rootCause: newRootCause.trim(),
      riskResponse: newRiskResponse.trim(),
      riskOwner: newRiskOwner.trim()
    })
      .then(created => {
        onRiskCreated(created);
        // Immediately linked to the step being worked on right now, same
        // as ControlLinkPicker's own inline "create" section - the whole
        // point of creating it here rather than from the Risk Register tab
        // is that it's already tied to this exact step, no separate
        // linking step needed afterward.
        onChange([...value, { riskId: created.id, severity: newSeverity }]);
        setNewRiskId('');
        setNewCategory('');
        setNewApqcProcessArea('');
        setNewProcess('');
        setNewFunction('');
        setNewRiskStatement('');
        setNewRootCause('');
        setNewRiskResponse('');
        setNewRiskOwner('');
        setNewSeverity(undefined);
        setCreating(false);
        setCreatingSaving(false);
      })
      .catch((err: Error) => {
        setCreatingSaving(false);
        setCreatingError(err.message);
      });
  };

  return (
    <div className={styles.picker}>
      <label className={styles.label}>Linked risks</label>

      {value.length > 0 && (
        <ul className={styles.linkedList}>
          {value.map(link => {
            const risk = risksById.get(link.riskId);
            return (
              <li key={link.riskId} className={styles.linkedRow}>
                <span className={`${styles.badge} ${SEVERITY_CLASS[link.severity]}`}>{link.severity}</span>
                <span className={styles.linkedText}>
                  {risk ? risk.riskStatement : <em>Risk no longer in the register (id {link.riskId})</em>}
                </span>
                <IconButton
                  iconProps={{ iconName: 'Cancel' }}
                  title="Remove this linked risk"
                  ariaLabel="Remove this linked risk"
                  className={styles.removeButton}
                  onClick={() => handleRemove(link.riskId)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {riskStatements.length === 0 ? (
        <p className={styles.empty}>No risks loaded from the Risk Register yet.</p>
      ) : (
        <div className={styles.addRow}>
          <Dropdown
            placeholder="Function"
            selectedKey={riskFunction}
            options={functionOptions}
            onChange={(_e, option) => { setRiskFunction(option ? String(option.key) : undefined); setRiskId(undefined); }}
            className={styles.addField}
          />
          <Dropdown
            placeholder="Risk"
            selectedKey={riskId}
            options={riskOptions}
            disabled={!riskFunction}
            onChange={(_e, option) => setRiskId(option ? String(option.key) : undefined)}
            className={styles.addField}
            // Options here are "riskId — full risk statement", often much
            // longer than the field itself is wide - "auto" sizes the
            // dropdown menu to its content instead of matching the narrow
            // field width, so options aren't clipped.
            dropdownWidth="auto"
          />
          <Dropdown
            placeholder="Severity"
            selectedKey={severity}
            options={SEVERITY_OPTIONS}
            disabled={!riskId}
            onChange={(_e, option) => setSeverity(option ? (String(option.key) as RiskLevel) : undefined)}
            className={styles.addFieldNarrow}
          />
          <DefaultButton text="+ Link risk" onClick={handleAdd} disabled={!canAdd} />
        </div>
      )}

      {!creating ? (
        <DefaultButton text="+ Create a new risk" onClick={() => setCreating(true)} />
      ) : (
        <div className={styles.createBox}>
          {creatingError && <p className={styles.empty}>{creatingError}</p>}
          <TextField label="Risk ID" placeholder="e.g. OP-042" value={newRiskId} onChange={(_e, v) => setNewRiskId(v || '')} />
          <TextField label="Category" placeholder="e.g. Operational / Financial Controls" value={newCategory} onChange={(_e, v) => setNewCategory(v || '')} />
          <TextField
            label="APQC process area"
            placeholder="e.g. Manage Financial Resources"
            value={newApqcProcessArea}
            onChange={(_e, v) => setNewApqcProcessArea(v || '')}
          />
          <TextField label="Process" placeholder="e.g. Process accounts payable (AP)" value={newProcess} onChange={(_e, v) => setNewProcess(v || '')} />
          <TextField label="Function" placeholder="e.g. Finance" value={newFunction} onChange={(_e, v) => setNewFunction(v || '')} />
          <TextField
            label="Risk statement"
            placeholder="Describe the risk"
            value={newRiskStatement}
            onChange={(_e, v) => setNewRiskStatement(v || '')}
            multiline
            rows={3}
          />
          <TextField label="Root cause" placeholder="Why this risk exists" value={newRootCause} onChange={(_e, v) => setNewRootCause(v || '')} multiline rows={2} />
          <TextField label="Risk response" placeholder="e.g. Mitigate" value={newRiskResponse} onChange={(_e, v) => setNewRiskResponse(v || '')} />
          <TextField label="Risk owner" placeholder="e.g. Finance Manager" value={newRiskOwner} onChange={(_e, v) => setNewRiskOwner(v || '')} />
          <Dropdown
            label="Severity (for this step's link)"
            placeholder="Severity"
            selectedKey={newSeverity}
            options={SEVERITY_OPTIONS}
            onChange={(_e, option) => setNewSeverity(option ? (String(option.key) as RiskLevel) : undefined)}
          />
          <div className={styles.addRow}>
            <PrimaryButton text={creatingSaving ? 'Adding...' : '+ Add risk'} onClick={handleCreate} disabled={!canCreate} />
            <DefaultButton
              text="Cancel"
              disabled={creatingSaving}
              onClick={() => {
                setCreating(false);
                setNewRiskId(''); setNewCategory(''); setNewApqcProcessArea(''); setNewProcess(''); setNewFunction('');
                setNewRiskStatement(''); setNewRootCause(''); setNewRiskResponse(''); setNewRiskOwner('');
                setNewSeverity(undefined); setCreatingError(undefined);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskLinkPicker;
