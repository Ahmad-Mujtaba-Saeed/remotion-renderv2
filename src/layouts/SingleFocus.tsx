import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Scene } from '../types';
import { SlotRenderer } from '../components/SlotRenderer';

/** single_focus: one full-frame slot (slot_main) over the ambient background. */
export const SingleFocus: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_main'];
  // A text card is inset so the living background frames it; media goes full-bleed.
  const isText = slot?.content_type === 'text_block';

  if (isText) {
    return (
      <AbsoluteFill style={{ padding: '7%' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden' }}>
          <SlotRenderer slot={slot} />
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <SlotRenderer slot={slot} />
    </AbsoluteFill>
  );
};
