import React from 'react';
import { Slot } from '../types';
import { TextBlock } from './TextBlock';
import { ExplanationBox } from './ExplanationBox';
import { MediaSlot } from './MediaSlot';
import { GlassCard } from './GlassCard';

/**
 * Renders the content of a floating panel / banner slot.
 * - `glass` true  → the content supplies its own glass surface (side panel).
 * - `glass` false → the parent supplies the glass (banner strip), so content
 *   renders transparent.
 */
export const PanelContent: React.FC<{ slot?: Slot; glass: boolean }> = ({ slot, glass }) => {
  if (!slot) return null;

  if (slot.content_type === 'explanation_box') {
    return <ExplanationBox slot={slot} transparent={!glass} />;
  }

  if (slot.content_type === 'text_block') {
    return glass ? (
      <GlassCard style={{ padding: '7%' }}>
        <TextBlock slot={slot} transparent />
      </GlassCard>
    ) : (
      <TextBlock slot={slot} transparent />
    );
  }

  // Fallback: media inside a panel.
  return <MediaSlot slot={slot} />;
};
