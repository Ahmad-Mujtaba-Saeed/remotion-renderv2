import React from 'react';
import { Slot } from '../types';
import { MediaSlot } from './MediaSlot';
import { TextBlock } from './TextBlock';
import { ExplanationBox } from './ExplanationBox';
import { VectorMotif } from './VectorMotif';

/** Maps a slot's content_type to its component (standalone use). */
export const SlotRenderer: React.FC<{ slot?: Slot; columnFrac?: number }> = ({ slot, columnFrac }) => {
  if (!slot) return <div style={{ width: '100%', height: '100%', background: 'transparent' }} />;

  switch (slot.content_type) {
    case 'text_block':
      return <TextBlock slot={slot} columnFrac={columnFrac} />;
    case 'explanation_box':
      return <ExplanationBox slot={slot} />;
    // A drawing of the beat's subject. It goes wherever a picture goes, which
    // is why it is routed here rather than being a layout of its own.
    case 'vector_motif':
      return <VectorMotif slot={slot} />;
    default:
      // image | video
      return <MediaSlot slot={slot} />;
  }
};
