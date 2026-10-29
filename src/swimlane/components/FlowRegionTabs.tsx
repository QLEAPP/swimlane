import * as React from 'react';
import { IProcessStep, NO_REGION } from '../models/IProcessStep';
import styles from './FlowRegionTabs.module.scss';

export interface IFlowRegionTabsProps {
  steps: IProcessStep[]; // all steps for the currently selected Process ID, UNFILTERED by region - only used for each tab's count
  regions: string[]; // the tabs to show, in order - see regionTabOptions in SwimlaneStudio.tsx
  selectedRegion: string | undefined; // one of regions - SwimlaneStudio keeps this always set, never "All"
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
// "All" only exists at the section level (ProcessStepTabs) now. Always
// rendered, on every Process ID (real user request, 2026-10-29: "the
// three regions and global ... I want always to show on each process").
const FlowRegionTabs: React.FC<IFlowRegionTabsProps> = ({ steps, regions, selectedRegion, onSelect }) => {
  const countFor = (region: string): number => steps.filter(s => (s.region || '') === region).length;

  return (
    <div className={styles.tabs}>
      {regions.map(region => (
        <button
          type="button"
          key={region || 'none'}
          className={`${styles.tab} ${selectedRegion === region ? styles.active : ''}`}
          onClick={() => onSelect(region)}
        >
          {region === NO_REGION ? 'No region' : region} <span className={styles.count}>{countFor(region)}</span>
        </button>
      ))}
    </div>
  );
};

export default FlowRegionTabs;
