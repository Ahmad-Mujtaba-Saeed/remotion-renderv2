import React from 'react';
import { Slot } from '../types';
import { TextBlock } from './TextBlock';
import { ExplanationBox } from './ExplanationBox';
import { MediaSlot } from './MediaSlot';
import { PanelSurface } from './Surface';

/**
 * Renders the content of a docked panel / banner slot.
 * - `glass` true  → the content supplies its own surface (side panel).
 * - `glass` false → the parent supplies it (banner strip), so content renders
 *   transparent.
 */
export const PanelContent: React.FC<{
  slot?: Slot;
  glass: boolean;
  compact?: boolean;
  /** Share of the frame width this panel occupies — the text solver needs the
   *  real column, and only the layout knows how wide its panel is. */
  columnFrac?: number;
}> = ({ slot, glass, compact, columnFrac }) => {
  if (!slot) return null;

  if (slot.content_type === 'explanation_box') {
    return <ExplanationBox slot={slot} transparent={!glass} />;
  }

  if (slot.content_type === 'text_block') {
    return glass ? (
      <PanelSurface style={{ padding: '7%' }}>
        <TextBlock slot={slot} transparent compact={compact} columnFrac={columnFrac} />
      </PanelSurface>
    ) : (
      <TextBlock slot={slot} transparent compact={compact} columnFrac={columnFrac} />
    );
  }

  // Fallback: media inside a panel.
  return <MediaSlot slot={slot} />;
};
