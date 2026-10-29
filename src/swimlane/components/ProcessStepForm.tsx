import * as React from 'react';
import { TextField, Dropdown, IDropdownOption, ComboBox, IComboBoxOption, Checkbox, DefaultButton } from '@fluentui/react';
import { IEmployee } from '../models/IEmployee';
import { IRiskStatement, IRiskLink } from '../models/IRiskStatement';
import { IControlStatement } from '../models/IControlStatement';
import { IProcessStep, ShapeType, getShapeType } from '../models/IProcessStep';
import { IDataService } from '../services/IDataService';
import { compareProcessStepIds } from '../utils/columns';
import EmployeePicker from './EmployeePicker';
import RiskLinkPicker from './RiskLinkPicker';
import ControlLinkPicker from './ControlLinkPicker';
import OptionalLinkField from './OptionalLinkField';

// The full set of fields a process step actually has - shared by the
// "Add a step" card and the shape edit panel so a step created here has
// every field a step edited there does, and the two forms can never
// silently drift out of sync with each other.
export interface IProcessStepFormValue {
  action: string;
  actionDescription: string;
  actionType: string;
  shapeOverride: string;
  responsibleJobTitle: string;
  // Which section (Process Step ID, e.g. "9.6.1.2") the step sits in -
  // pickable in the form since 2026-10-29 (user request: moving a step to
  // another section was "impossible" without dragging it across the
  // canvas). '' means "not chosen", and the add flow falls back to its
  // usual default (see handleAddStep in SwimlaneStudio.tsx).
  sectionId: string;
  dependsOnStepIds: string[];
  // Branch label (e.g. "Yes"/"No") for a picked dependency that's a
  // Decision, keyed by that dependency's step id - added 2026-09-28 at
  // the user's request ("simpler to navigate" than the old flow: create
  // both branch steps, THEN go find the connecting arrow on the canvas or
  // dig through Outgoing connections to label it). Only ever meaningful
  // for ids that are ALSO in dependsOnStepIds and resolve to a Decision
  // step - see the "Depends on" section below. Converted to the real,
  // token-keyed edgeLabels the data model actually uses (see
  // IProcessStep.edgeLabels) at save time, since a token isn't known
  // until the dependency is resolved against the full step list.
  edgeLabelsByDependsOnId: { [stepId: string]: string };
  linkedRisks: IRiskLink[];
  sopLink: string;
  delegationOfAuthorityLink: string;
  notes: string;
}

// No blank "(use heuristic)" option any more - Shape became a required
// field on 2026-10-20 at the user's request, so every step names its own.
export const SHAPE_OPTIONS: IDropdownOption[] = [
  { key: 'Process Step', text: 'Process (rounded rectangle)' },
  { key: 'Decision', text: 'Decision (diamond)' },
  { key: 'Approval', text: 'Approval (circle)' },
  { key: 'Document', text: 'Document (artifact)' }
];

const SHAPE_OVERRIDE_BY_TYPE: Record<ShapeType, string> = {
  process: 'Process Step', decision: 'Decision', approval: 'Approval', document: 'Document'
};

export const shapeTypeToOverride = (shapeType: ShapeType): string => SHAPE_OVERRIDE_BY_TYPE[shapeType];

// The one definition of "required" every save button gates on - and what
// MissingFieldsNote spells out, since a greyed-out button with no reason
// read as the button having vanished (confirmed real user report,
// 2026-10-20). Responsible in particular stays blank if a title is typed
// but never clicked in the dropdown (see EmployeePicker).
export const missingRequiredFields = (value: IProcessStepFormValue): string[] => [
  !value.actionDescription.trim() && 'Action description',
  !value.shapeOverride && 'Shape',
  !value.responsibleJobTitle.trim() && 'Responsible (pick it from the dropdown list)'
].filter((f): f is string => !!f);

export const MissingFieldsNote: React.FC<{ value: IProcessStepFormValue }> = ({ value }) => {
  const missing = missingRequiredFields(value);
  if (missing.length === 0) return null;
  return <p style={{ color: '#a4262c', margin: '4px 0 0' }}>To continue, fill in: {missing.join(', ')}</p>;
};

// Both Action and Action Type are free text in the real data (there's no
// closed, confirmed list of every value a real export might use) - these
// are just the ones seen so far, offered as suggestions via a freeform
// combo box rather than a closed dropdown, so an unfamiliar existing
// value still displays correctly instead of showing blank.
const ACTION_TYPE_SUGGESTIONS: IComboBoxOption[] = [
  'Execute (Within Limits)', 'Execute (Non Threshold)', 'Approve (Within Thresholds)',
  'Approve (Non Threshold)', 'Endorse / Recommend', 'Automated'
].map(v => ({ key: v, text: v }));

const ACTION_SUGGESTIONS: IComboBoxOption[] = [
  'Send', 'Receive', 'Forward', 'Review', 'Create', 'Submit', 'Approve', 'Automated', 'Issue', 'Reconcile', 'Recommend'
].map(v => ({ key: v, text: v }));

export interface IProcessStepFormProps {
  value: IProcessStepFormValue;
  onChange: (value: IProcessStepFormValue) => void;
  employees: IEmployee[];
  dependsOnOptions: IDropdownOption[];
  // The real steps dependsOnOptions was built from - used only to look up
  // a picked dependency's actual shape (is it a Decision?) and its own
  // action description, for the inline branch-label fields below.
  dependsOnSteps: IProcessStep[];
  riskStatements: IRiskStatement[];
  controlStatements: IControlStatement[];
  // The step's own Process Step ID - see ControlLinkPicker for why
  // linking needs this directly rather than going through `value` the way
  // linkedRisks does (Control linking writes straight to Control
  // Register, there's no step-side array to hold it in).
  processStepId: string;
  // This Process ID's own name - see ControlLinkPicker for why the
  // inline "create a new control" section needs it.
  processDescription: string;
  dataService: IDataService;
  onControlLinked: (updated: IControlStatement) => void;
  onControlCreated: (created: IControlStatement) => void;
  // Fires after a brand-new risk is created via RiskLinkPicker's own
  // inline "create" section - see the prop comment there.
  onRiskCreated: (created: IRiskStatement) => void;
  // Off for NewProcessModal, which asks for a brand-new Process Step ID
  // itself instead of picking an existing section.
  showSection?: boolean;
}

const ProcessStepForm: React.FC<IProcessStepFormProps> = ({
  value, onChange, employees, dependsOnOptions, dependsOnSteps, riskStatements, controlStatements, processStepId, processDescription,
  dataService, onControlLinked, onControlCreated, onRiskCreated, showSection
}) => {
  const set = <K extends keyof IProcessStepFormValue>(key: K, v: IProcessStepFormValue[K]): void => {
    onChange({ ...value, [key]: v });
  };

  const dependsOnStepsById = React.useMemo(() => new Map(dependsOnSteps.map(s => [s.id, s])), [dependsOnSteps]);
  // dependsOnSteps is the whole swimlane (this Process ID + region) in
  // both forms, so it already holds every section the step could sit in.
  // Named the same way the section tabs name them (first step wins).
  const sectionOptions: IDropdownOption[] = React.useMemo(() => {
    const ids = Array.from(new Set(dependsOnSteps.map(s => s.processStepId))).sort(compareProcessStepIds);
    return ids.map(id => {
      const name = dependsOnSteps.find(s => s.processStepId === id)?.processStepName;
      return { key: id, text: name ? `${id} — ${name}` : id };
    });
  }, [dependsOnSteps]);
  // Only Decision dependencies need a branch label - confirmed design rule
  // (see findUnlabeledDecisionEdges) is every OUTGOING edge from a
  // Decision needs one, which is exactly "this new/edited step depends on
  // a Decision" from here.
  const decisionDependencyIds = value.dependsOnStepIds.filter(id => {
    const step = dependsOnStepsById.get(id);
    return !!step && getShapeType(step) === 'decision';
  });

  // Split into essentials vs. "More details" at the user's request
  // (2026-10-20 - "a lot of things to do but I don't think all are
  // necessary"). Only the fields the diagram itself can't be drawn
  // without stay up top: the box text, its shape, its lane, and its
  // arrows (plus branch labels, which only appear when actually needed).
  // Everything else is supporting or governance detail usually added on a
  // second pass. Always starts closed, even when those fields hold values
  // - the user explicitly wanted it "closed until prompted".
  const [showMore, setShowMore] = React.useState(false);

  return (
    <>
      <TextField
        label="Action description"
        required
        multiline
        value={value.actionDescription}
        onChange={(_e, v) => set('actionDescription', v || '')}
      />
      <Dropdown
        label="Shape"
        required
        placeholder="Choose a shape..."
        // Only a key the picker actually offers - anything else shows as
        // unchosen (placeholder) rather than silently blank.
        selectedKey={SHAPE_OPTIONS.some(o => o.key === value.shapeOverride) ? value.shapeOverride : null}
        options={SHAPE_OPTIONS}
        onChange={(_e, option) => option && set('shapeOverride', String(option.key))}
      />
      <EmployeePicker
        employees={employees}
        value={value.responsibleJobTitle}
        onChange={jobTitle => set('responsibleJobTitle', jobTitle)}
      />
      {/* Nothing to choose between until the swimlane has a section. */}
      {showSection && sectionOptions.length > 0 && (
        <Dropdown
          label="Section"
          selectedKey={value.sectionId || null}
          options={sectionOptions}
          onChange={(_e, option) => option && set('sectionId', String(option.key))}
        />
      )}
      <Checkbox
        label="This step depends on nothing"
        // Derived from the selection itself rather than tracked as its
        // own separate boolean - there's no state to fall out of sync
        // with, and picking anything in the dropdown below immediately
        // (and correctly) unchecks it again on its own, with no extra
        // wiring needed. Checking it is a one-click "clear all" instead
        // of hunting through the list below to deselect each one by hand
        // - unchecking it directly is a no-op, since there's nothing a
        // plain uncheck could sensibly restore.
        checked={value.dependsOnStepIds.length === 0}
        onChange={(_e, checked) => { if (checked) set('dependsOnStepIds', []); }}
      />
      <Dropdown
        label="Depends on"
        placeholder="Which step(s) does this follow?"
        multiSelect
        selectedKeys={value.dependsOnStepIds}
        options={dependsOnOptions}
        onChange={(_e, option) => {
          if (!option) return;
          const ids = option.selected
            ? [...value.dependsOnStepIds, String(option.key)]
            : value.dependsOnStepIds.filter(id => id !== option.key);
          set('dependsOnStepIds', ids);
        }}
      />
      {decisionDependencyIds.map(stepId => {
        const decisionStep = dependsOnStepsById.get(stepId);
        return (
          <TextField
            key={stepId}
            label={`Branch label for "${decisionStep?.actionDescription || stepId}" (e.g. Yes/No)`}
            placeholder="Yes / No / label this branch"
            value={value.edgeLabelsByDependsOnId[stepId] || ''}
            onChange={(_e, v) => set('edgeLabelsByDependsOnId', { ...value.edgeLabelsByDependsOnId, [stepId]: v || '' })}
          />
        );
      })}
      <DefaultButton
        iconProps={{ iconName: showMore ? 'ChevronUp' : 'ChevronDown' }}
        text={showMore ? 'Hide more details' : 'More details (optional) - risks, controls, notes, links'}
        onClick={() => setShowMore(!showMore)}
        // Deliberately a full-width bordered button, not a quiet link -
        // the user asked for it to be "very visible" so nobody misses
        // that the risk/control fields exist behind it.
        styles={{ root: { width: '100%', margin: '12px 0', height: 40, fontWeight: 600, borderWidth: 2 } }}
      />
      {showMore && (
      <>
      <ComboBox
        label="Action"
        placeholder="Choose from the list, or type your own..."
        text={value.action}
        allowFreeform
        autoComplete="on"
        options={ACTION_SUGGESTIONS}
        onChange={(_e, option, _index, freeformValue) => set('action', option ? String(option.key) : (freeformValue || ''))}
      />
      <ComboBox
        label="Action type"
        placeholder="Choose from the list, or type your own..."
        text={value.actionType}
        allowFreeform
        autoComplete="on"
        options={ACTION_TYPE_SUGGESTIONS}
        onChange={(_e, option, _index, freeformValue) => set('actionType', option ? String(option.key) : (freeformValue || ''))}
      />
      <RiskLinkPicker
        riskStatements={riskStatements}
        value={value.linkedRisks}
        onChange={links => set('linkedRisks', links)}
        dataService={dataService}
        processStepId={processStepId}
        processDescription={processDescription}
        stepResponsibleJobTitle={value.responsibleJobTitle}
        onRiskCreated={onRiskCreated}
      />
      <ControlLinkPicker
        controlStatements={controlStatements}
        riskStatements={riskStatements}
        processStepId={processStepId}
        processDescription={processDescription}
        dataService={dataService}
        onLinked={onControlLinked}
        onCreated={onControlCreated}
      />
      <TextField
        label="Notes"
        placeholder="Any additional context for this step"
        value={value.notes}
        onChange={(_e, v) => set('notes', v || '')}
        multiline
        rows={2}
      />
      <OptionalLinkField
        label="SOP / guidance link"
        addButtonText="+ Add SOP / guidance link"
        placeholder="https://... (SOP, NetSuite, or other system guidance)"
        value={value.sopLink}
        onChange={v => set('sopLink', v)}
      />
      <OptionalLinkField
        label="Delegation of authority link"
        addButtonText="+ Add delegation of authority link"
        placeholder="https://..."
        value={value.delegationOfAuthorityLink}
        onChange={v => set('delegationOfAuthorityLink', v)}
      />
      </>
      )}
    </>
  );
};

export default ProcessStepForm;
