import * as React from 'react';
import { DefaultButton, SearchBox } from '@fluentui/react';
import { IControlStatement } from '../models/IControlStatement';
import styles from './RiskRegisterList.module.scss';

export interface IControlRegisterListProps {
  controlStatements: IControlStatement[];
  onAddClick: () => void;
}

// Same all-column free-text filter as RiskRegisterList (see its own
// comment on matchesQuery for why - one search box beats per-column
// dropdowns once a register has enough rows to scroll through).
function matchesQuery(control: IControlStatement, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    control.controlId, control.riskId, control.riskStatement, control.controlDescription, control.controlOwner,
    control.controlType, control.executionMethod, control.frequency, control.evidence, control.status,
    control.designEffective, control.operatingEffective, control.function, control.linkKey, control.mappingNotes
  ].some(field => field.toLowerCase().includes(q));
}

// Reuses RiskRegisterList's own stylesheet rather than a near-identical
// copy - both are the same "card with a searchable table" shape, nothing
// here needs its own styling.
const ControlRegisterList: React.FC<IControlRegisterListProps> = ({ controlStatements, onAddClick }) => {
  const [query, setQuery] = React.useState('');

  if (controlStatements.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <h3 className={styles.title}>Control Register</h3>
          <DefaultButton text="+ Add control" iconProps={{ iconName: 'Shield' }} onClick={onAddClick} />
        </div>
        <p className={styles.muted}>No controls loaded yet.</p>
      </div>
    );
  }

  const filtered = controlStatements.filter(c => matchesQuery(c, query));

  return (
    <div className={styles.card}>
      <div className={styles.toolbar}>
        <h3 className={styles.title}>Control Register ({filtered.length} of {controlStatements.length})</h3>
        <div className={styles.toolbarActions}>
          <SearchBox
            placeholder="Search all columns..."
            value={query}
            onChange={(_e, v) => setQuery(v || '')}
            onClear={() => setQuery('')}
            className={styles.searchBox}
          />
          <DefaultButton text="+ Add control" iconProps={{ iconName: 'Shield' }} onClick={onAddClick} />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className={styles.muted}>No controls match "{query}".</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Control ID</th>
                <th>Risk ID</th>
                <th>Risk Statement</th>
                <th>Control Description</th>
                <th>Control Owner</th>
                <th>Control Type</th>
                <th>Execution Method</th>
                <th>Frequency</th>
                <th>Evidence</th>
                <th>Status</th>
                <th>Design Effective?</th>
                <th>Operating Effective?</th>
                <th>Function</th>
                <th>Link Key</th>
                <th>Mapping Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{c.controlId || <span className={styles.muted}>—</span>}</td>
                  <td>{c.riskId || <span className={styles.muted}>—</span>}</td>
                  <td>{c.riskStatement || <span className={styles.muted}>—</span>}</td>
                  <td>{c.controlDescription}</td>
                  <td>{c.controlOwner || <span className={styles.muted}>—</span>}</td>
                  <td>{c.controlType || <span className={styles.muted}>—</span>}</td>
                  <td>{c.executionMethod || <span className={styles.muted}>—</span>}</td>
                  <td>{c.frequency || <span className={styles.muted}>—</span>}</td>
                  <td className={styles.muted}>{c.evidence || '—'}</td>
                  <td>{c.status || <span className={styles.muted}>—</span>}</td>
                  <td>{c.designEffective || <span className={styles.muted}>—</span>}</td>
                  <td>{c.operatingEffective || <span className={styles.muted}>—</span>}</td>
                  <td>{c.function || <span className={styles.muted}>—</span>}</td>
                  <td>{c.linkKey || <span className={styles.muted}>—</span>}</td>
                  <td className={styles.muted}>{c.mappingNotes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ControlRegisterList;
