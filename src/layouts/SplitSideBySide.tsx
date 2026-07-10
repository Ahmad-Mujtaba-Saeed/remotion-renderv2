import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Scene } from '../types';
import { SlotRenderer } from '../components/SlotRenderer';
import { useTheme } from '../theme';
import { useIsPortrait } from '../responsive';

const Half: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', borderRadius: 6 }}>{children}</div>
);

/**
 * split_side_by_side: two equal columns (slot_left | slot_right) over ambient.
 * In a 9:16 portrait frame two columns would be unusably thin, so the split
 * automatically stacks vertically (left on top) instead.
 */
export const SplitSideBySide: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  const portrait = useIsPortrait();

  return (
    <AbsoluteFill
      style={{
        flexDirection: portrait ? 'column' : 'row',
        gap: 20,
        padding: '4%',
        alignItems: 'stretch',
      }}
    >
      <Half>
        <SlotRenderer slot={scene.slots['slot_left']} />
      </Half>
      <div
        style={{
          width: portrait ? undefined : 4,
          height: portrait ? 4 : undefined,
          alignSelf: 'stretch',
          background: theme.accent,
        }}
      />
      <Half>
        <SlotRenderer slot={scene.slots['slot_right']} />
      </Half>
    </AbsoluteFill>
  );
};
