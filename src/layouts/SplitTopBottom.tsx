import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Scene } from '../types';
import { SlotRenderer } from '../components/SlotRenderer';
import { useTheme } from '../theme';

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ flex: 1, width: '100%', overflow: 'hidden', borderRadius: 24 }}>{children}</div>
);

/** split_top_bottom: two stacked rows (slot_top / slot_bottom) over ambient. */
export const SplitTopBottom: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  return (
    <AbsoluteFill style={{ flexDirection: 'column', gap: 18, padding: '4%' }}>
      <Row>
        <SlotRenderer slot={scene.slots['slot_top']} />
      </Row>
      <div
        style={{
          height: 5,
          width: '100%',
          borderRadius: 999,
          background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
          boxShadow: `0 0 24px ${theme.accent}66`,
        }}
      />
      <Row>
        <SlotRenderer slot={scene.slots['slot_bottom']} />
      </Row>
    </AbsoluteFill>
  );
};
