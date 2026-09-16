import * as React from 'react';
import { Dropdown, IDropdownOption, DefaultButton, PrimaryButton, IconButton, TextField } from '@fluentui/react';
import { IRiskStatement, IRiskLink, RiskLevel, GUARANTEED_FUNCTIONS, GUARANTEED_RISK_RESPONSES } from '../models/IRiskStatement';
import { getProcessId } from '../models/IProcessStep';
import { IDataService } from '../services/IDataService';
import { getCategoryId, APQC_CATEGORY_NAMES } from '../utils/apqcHierarchy';
import styles from './RiskLinkPicker.module.scss';

const CATEGORY_OPTIONS: IDropdownOption[] = Object.entries(APQC_CATEGORY_NAMES)
  .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
  .map(([id, name]) => ({ key: id, text: `${id} - ${name}` }));

export interface IRiskLinkPickerProps {
  riskStatements: IRiskStatement[];
  value: IRiskLink[];
  onChange: (value: IRiskLink[]) => void;
  dataService: IDataService;
  // The step's own Process Step ID/description/Responsible - used only by
  // the inline "create a new risk" section below (added 2026-09-16 at the
  // user's request) to prepopulate Category/APQC process area/Process/Risk
  // owner from context that's already known, rather than asking for it
  // again. AddRiskModal (opened from the Risk Register tab directly, with
  // no current step) can't do the same - see the comment there.
  processStepId: string;
  processDescription: string;
  stepResponsibleJobTitle: string;
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
const RiskLinkPicker: React.FC<IRiskLinkPickerProps> = ({
  riskStatements, value, onChange, dataService, processStepId, processDescription, stepResponsibleJobTitle, onRiskCreated
}) => {
  const [riskFunction, setRiskFunction] = React.useState<string | undefined>(undefined);
  const [riskId, setRiskId] = React.useState<string | undefined>(undefined);
  const [severity, setSeverity] = React.useState<RiskLevel | undefined>(undefined);

  // Creating a brand-new risk right here (added at the user's request,
  // "add a risk directly from the popup" - "as well as" picking an
  // already-existing one above, same reveal-on-demand pattern as
  // ControlLinkPicker's own "+ Create a new control") rather than having
  // to leave the step, go to the Risk Register tab, add it there, then
  // come back to link it. Field-by-field rules changed 2026-09-16 at the
  // user's request:
  //  - Risk ID: not a field at all - auto-generated server-side (see
  //    nextRiskId), same as AddRiskModal now does too.
  //  - Category: the step's own APQC category, prepopulated (see
  //    handleOpenCreate) since it's already known from processStepId -
  //    still changeable via the dropdown, not locked.
  //  - APQC process area: derived straight from processStepId (see
  //    derivedApqcProcessArea below) and shown read-only - there's nothing
  //    to ask for, the step already IS that process.
  //  - Process: prepopulated from processDescription but still a plain
  //    typed field - the exact wording can differ from the swimlane's own
  //    label (see ControlLinkPicker's own process-matching comment).
  //  - Function / Risk response: pick-only dropdowns instead of free text.
  //  - Risk owner: prepopulated from the step's own Responsible value
  //    (stepResponsibleJobTitle) - "based on the role already linked in
  //    the swimlane" - still editable in case this risk's real owner is a
  //    different role than whoever executes the step.
  const [creating, setCreating] = React.useState(false);
  const [newCategory, setNewCategory] = React.useState('');
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

  // Always derived, never a separate field to fill in - see the comment
  // on the "create" section above.
  const derivedApqcProcessArea = getProcessId(processStepId);

  const handleOpenCreate = (): void => {
    setCreating(true);
    setNewCategory(getCategoryId(processStepId));
    setNewProcess(processDescription);
    setNewRiskOwner(stepResponsibleJobTitle || '');
  };

  const handleCancelCreate = (): void => {
    setCreating(false);
    setNewCategory(''); setNewProcess(''); setNewFunction('');
    setNewRiskStatement(''); setNewRootCause(''); setNewRiskResponse(''); setNewRiskOwner('');
    setNewSeverity(undefined); setCreatingError(undefined);
  };

  const risksById = React.useMemo(() => new Map(riskStatements.map(r => [r.id, r])), [riskStatements]);

  const functionOptions: IDropdownOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_FUNCTIONS, ...riskStatements.map(r => r.function)].filter(Boolean))).sort().map(f => ({ key: f, text: f })),
    [riskStatements]
  );

  // Used only by the "create a new risk" section below.
  const riskResponseOptions: IDropdownOption[] = React.useMemo(
    () => Array.from(new Set([...GUARANTEED_RISK_RESPONSES, ...riskStatements.map(r => r.riskResponse)].filter(Boolean))).map(r => ({ key: r, text: r })),
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
    const categoryOption = CATEGORY_OPTIONS.find(o => o.key === newCategory);
    dataService.addRiskStatement({
      riskId: '', // ignored/overwritten server-side - see nextRiskId
      category: categoryOption ? String(categoryOption.text) : '',
      apqcProcessArea: derivedApqcProcessArea,
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
        handleCancelCreate();
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
        <DefaultButton text="+ Create a new risk" onClick={handleOpenCreate} />
      ) : (
        <div className={styles.createBox}>
          {creatingError && <p className={styles.empty}>{creatingError}</p>}
          <p className={styles.empty}>Risk ID will be assigned automatically (RSK-XXX) - not something you type.</p>
          <Dropdown
            label="Category"
            placeholder="Choose the APQC category..."
            selectedKey={newCategory || null}
            options={CATEGORY_OPTIONS}
            onChange={(_e, option) => setNewCategory(option ? String(option.key) : '')}
          />
          <TextField label="APQC process area" value={derivedApqcProcessArea} disabled />
          <TextField label="Process" placeholder="e.g. Process accounts payable (AP)" value={newProcess} onChange={(_e, v) => setNewProcess(v || '')} />
          <Dropdown
            label="Function"
            placeholder="Choose from the list..."
            selectedKey={newFunction || null}
            options={functionOptions}
            onChange={(_e, option) => setNewFunction(option ? String(option.key) : '')}
          />
          <TextField
            label="Risk statement"
            placeholder="Describe the risk"
            value={newRiskStatement}
            onChange={(_e, v) => setNewRiskStatement(v || '')}
            multiline
            rows={3}
          />
          <TextField label="Root cause" placeholder="Why this risk exists" value={newRootCause} onChange={(_e, v) => setNewRootCause(v || '')} multiline rows={2} />
          <Dropdown
            label="Risk response"
            placeholder="Choose from the list..."
            selectedKey={newRiskResponse || null}
            options={riskResponseOptions}
            onChange={(_e, option) => setNewRiskResponse(option ? String(option.key) : '')}
          />
          <TextField
            label="Risk owner"
            placeholder="e.g. Finance Manager"
            value={newRiskOwner}
            onChange={(_e, v) => setNewRiskOwner(v || '')}
          />
          <Dropdown
            label="Severity (for this step's link)"
            placeholder="Severity"
            selectedKey={newSeverity}
            options={SEVERITY_OPTIONS}
            onChange={(_e, option) => setNewSeverity(option ? (String(option.key) as RiskLevel) : undefined)}
          />
          <div className={styles.addRow}>
            <PrimaryButton text={creatingSaving ? 'Adding...' : '+ Add risk'} onClick={handleCreate} disabled={!canCreate} />
            <DefaultButton text="Cancel" disabled={creatingSaving} onClick={handleCancelCreate} />
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskLinkPicker;
