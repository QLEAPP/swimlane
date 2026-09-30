import * as React from 'react';
import { IProcessStep, flowRegionOptions } from '../models/IProcessStep';
import styles from './FlowRegionTabs.module.scss';

export interface IFlowRegionTabsProps {
  steps: IProcessStep[]; // all steps for the currently selected Process ID, UNFILTERED by region - the tab list needs to see every region present, not just the selected one
  selectedRegion: string | undefined; // one of flowRegionOptions(steps) - SwimlaneStudio keeps this always set to a real region while this component is even rendered (see anyRegionUsed there), never "All"
  onSelect: (region: string) => void;
}

// A genuinely different concept from ProcessStepTabs just below it in the
// toolbar: those narrow within ONE continuous flow, this picks between
// entirely separate swimlanes for the same Process ID (e.g. the UK AP
// process vs the US AP process) - confirmed design rule, added at a real
// user's request after Department (an unrelated per-employee grouping)
// turned out not to cover this at all. Sits above ProcessStepTabs since
// it's the bigger partition - which region you're in determines which
// Process Step ID tabs and steps even show.
//
// No "All" tab here anymore (real user request - "remove the all part
// when viewing regional workflow and leave it rather to the sections") -
// "All" only exists at the section level (ProcessStepTabs) now. Only
// rendered at all when the Process ID actually has at least one region
// tag in the first place (see anyRegionUsed in SwimlaneStudio.tsx) - a
// Process ID that's never used regions has nothing sensible to default
// to here otherwise.
const FlowRegionTabs: React.FC<IFlowRegionTabsProps> = ({ steps, selectedRegion, onSelect }) => {
  const regions = React.useMemo(() => flowRegionOptions(steps), [steps]);
  const countFor = (region: string): number => steps.filter(s => s.region === region).length;

  return (
    <div className={styles.tabs}>
      {regions.map(region => (
        <button
          type="button"
          key={region}
          className={`${styles.tab} ${selectedRegion === region ? styles.active : ''}`}
          onClick={() => onSelect(region)}
        >
          {region} <span className={styles.count}>{countFor(region)}</span>
        </button>
      ))}
    </div>
  );
};

export default FlowRegionTabs;
