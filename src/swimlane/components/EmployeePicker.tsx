import * as React from 'react';
import { ComboBox, IComboBox, IComboBoxOption } from '@fluentui/react';
import { IEmployee, GUARANTEED_JOB_TITLES } from '../models/IEmployee';

export interface IEmployeePickerProps {
  employees: IEmployee[];
  value: string | undefined; // ResponsibleJobTitle currently on the task
  onChange: (jobTitle: string) => void;
}

// Lanes are always job titles, never a person's name - and by explicit
// user choice, employee names aren't pulled into the app at all (see
// models/IEmployee.ts), so several people holding the same title collapse
// into one option here rather than one row per person. Search-as-you-type
// (not a plain closed dropdown) so finding one title among many doesn't
// mean scanning a long list by eye - type a few letters, matches filter
// down, click the one you want. Alphabetical order, not grouped/ranked -
// an earlier version sorted "best authority-tier match" first (Execute ->
// analyst, Approve -> senior, etc.), but ties within a tier fell back to
// whatever order the underlying employee data happened to list them in,
// which read as arbitrary/scattered rather than useful. Alphabetical is
// the one order every user can predict without knowing the data.
const EmployeePicker: React.FC<IEmployeePickerProps> = ({ employees, value, onChange }) => {
  const comboRef = React.useRef<IComboBox>(null);
  const allOptions: IComboBoxOption[] = React.useMemo(() => {
    const distinctTitles = Array.from(new Set([...GUARANTEED_JOB_TITLES, ...employees.map(e => e.jobTitle)]));
    return distinctTitles.sort((a, b) => a.localeCompare(b)).map(jobTitle => ({ key: jobTitle, text: jobTitle }));
  }, [employees]);

  // What's typed right now, or undefined when not searching. Matches
  // ANYWHERE in the title, not just its start - Fluent's own autoComplete
  // only matched prefixes, so typing "EPC" found nothing for "ASPI
  // Procurement SA - EPC Contractor", and on blur it silently filled in
  // whichever title merely STARTED with the typed text (typing
  // "Procurement" and clicking away saved "Procurement Manager") -
  // confirmed real user report, 2026-10-29. Nothing is committed now
  // unless an option is actually picked.
  const [query, setQuery] = React.useState<string | undefined>(undefined);
  const matches = React.useMemo(() => {
    const q = query?.trim().toLowerCase();
    return q ? allOptions.filter(o => o.text.toLowerCase().includes(q)) : allOptions;
  }, [allOptions, query]);
  const options: IComboBoxOption[] = matches.length > 0
    ? matches
    : [{ key: '__noMatch', text: 'No matching job title', disabled: true }];

  return (
    <ComboBox
      label="Responsible"
      // Required since 2026-10-20 (user request) - it decides the step's
      // lane, and a blank one leaves the step with no real lane at all.
      required
      placeholder="Search job titles..."
      // `text`, not `selectedKey` - a step's real responsibleJobTitle is
      // often a richer 3-part string ("Title / Code - Dept / Region", see
      // formatLaneLabel in SwimlaneCanvas.tsx) than anything this list of
      // options can offer, since IEmployee only ever carries a bare job
      // title (no region field exists in the real Employees list at all -
      // see IEmployee.ts). selectedKey only displays text when it exactly
      // matches an option's key, so it showed BLANK for every step with
      // one of these richer values - not just after a drag, on every
      // single edit-panel open, which is what actually made a drag look
      // like it "didn't change the job title" in the box. `text` instead
      // just displays whatever the step's current value literally is,
      // matching how the Action/Action type fields already work.
      //
      // allowFreeform is required for that same `text` prop to actually be
      // typeable - without it, Fluent treats `text` as fully authoritative
      // on every render, so each keystroke got redrawn straight back to
      // the old value before the user could see what they'd typed, and
      // the options list never got a chance to narrow (confirmed live:
      // typing "Chief" left the field showing the old value and all
      // options unfiltered). onChange below still only ever commits a
      // REAL option's key, never freeformValue, so a job title that isn't
      // in the Employees list still can't be saved - allowFreeform only
      // unlocks live typing/filtering, not arbitrary freeform values.
      componentRef={comboRef}
      text={query ?? value}
      options={options}
      autoComplete="off"
      allowFreeform
      onInputValueChange={typed => {
        setQuery(typed);
        comboRef.current?.focus(true);
      }}
      onMenuDismissed={() => setQuery(undefined)}
      onChange={(_e, option) => {
        // Enter on typed text with exactly one match takes that match -
        // the one case where what's meant is unambiguous.
        const picked = option || (matches.length === 1 ? matches[0] : undefined);
        setQuery(undefined);
        if (picked && !picked.disabled) onChange(String(picked.key));
      }}
    />
  );
};

export default EmployeePicker;
