import React from 'react';
import { Slot } from '../types';
import { MediaSlot } from './MediaSlot';
import { TextBlock } from './TextBlock';
import { ExplanationBox } from './ExplanationBox';

/** Maps a slot's content_type to its component (standalone use). */
export const SlotRenderer: React.FC<{ slot?: Slot }> = ({ slot }) => {
  if (!slot) return <div style={{ width: '100%', height: '100%', background: 'transparent' }} />;

  switch (slot.content_type) {
    case 'text_block':
      return <TextBlock slot={slot} />;
    case 'explanation_box':
      return <ExplanationBox slot={slot} />;
    default:
      // image | video
      return <MediaSlot slot={slot} />;
  }
};
