/**
 * sweep-cases — one WORST-CASE payload per card template.
 *
 * The point of this file is that it is not pretty. Every case carries the
 * longest text the pipeline can actually deliver (the validator's clamps, and
 * for text_block headings/bullets there is no clamp at all beyond the prompt's
 * advice, so the model routinely overshoots), the maximum number of rows a
 * card accepts, and the awkward shapes — a heading that wraps, a label longer
 * than its box, a stacked fraction.
 *
 * A card that survives its case here survives production. A card that only
 * looks good with a six-word heading was never finished.
 */

export interface SweepCase {
  /** Card template id — also the still's filename. */
  template: string;
  slots: Record<string, unknown>;
  /** Optional per-scene style (kicker etc.). */
  style?: Record<string, unknown>;
  /** Narration, used for the sync-driven reveals; kept short deliberately. */
  narration?: string;
  /** Fraction of the scene to grab the still at (default 0.85 — everything
   *  landed). Cards whose payoff lands late override it. */
  at?: number;
}

/** A realistic string of EXACTLY n characters (never a lorem blob). */
const POOL =
  'compound interest quietly beats almost everything else you will ever try to ' +
  'measure against inflation over a working lifetime because the curve bends ' +
  'upward long after the saver has stopped paying any attention at all to it';
export const long = (n: number): string => {
  let out = '';
  while (out.length < n) out += (out ? ' ' : '') + POOL;
  out = out.slice(0, n).trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
};

/** An image request — the sweep renders placeholders, which is the point:
 *  the card's own chrome is what is under test, not the photo. */
const img = (d: string) => ({
  content_type: 'image',
  asset_request: { description: d },
  camera_move: 'slow_zoom_in',
});

const text = (headingLen: number, bullets: number, bulletLen = 60) => ({
  content_type: 'text_block',
  heading: long(headingLen),
  bullets: Array.from({ length: bullets }, (_, i) => `${i + 1}. ${long(bulletLen - 3)}`),
  reveal: 'sequential',
});

export const CASES: SweepCase[] = [
  // ---- text-first cards: the ones long headings hurt most -----------------
  { template: 'single_focus', slots: { slot_main: text(64, 4) }, style: { kicker: 'THE PROBLEM' } },
  { template: 'stat_spotlight', slots: { slot_stat: { content_type: 'text_block', heading: '$4.28 Billion', bullets: [long(72)] } } },
  { template: 'quote_card', slots: { slot_quote: { content_type: 'text_block', heading: long(140), bullets: ['— A Person With A Very Long Attribution, 1974'] } } },
  { template: 'chapter_cover', slots: { slot_cover: { content_type: 'text_block', heading: long(56), bullets: [long(40)] } } },
  { template: 'outro_card', slots: { slot_outro: { content_type: 'text_block', heading: long(48), bullets: [long(40)] } } },
  { template: 'big_counter', slots: { slot_counter: { content_type: 'text_block', heading: '1,284,000', bullets: [long(64)] } } },
  { template: 'split_top_bottom', slots: { slot_top: text(50, 2), slot_bottom: img('a city skyline at dusk') } },
  { template: 'split_side_by_side', slots: { slot_left: img('a hand holding a phone'), slot_right: text(52, 4) } },
  { template: 'full_bleed_with_banner', slots: { slot_background: img('an empty road at sunrise'), slot_banner: text(56, 0) } },
  { template: 'full_bleed_with_side_panel', slots: { slot_background: img('a factory floor'), slot_panel: text(48, 3, 52) } },

  // ---- structured data cards ---------------------------------------------
  {
    template: 'checklist_card',
    slots: {
      slot_checklist: {
        content_type: 'proscons',
        heading: long(58),
        pros: [long(54), long(48), long(40)],
        cons: [long(52), long(44)],
      },
    },
  },
  {
    template: 'icon_grid',
    slots: {
      slot_icons: {
        content_type: 'icons',
        heading: long(56),
        items: Array.from({ length: 9 }, (_, i) => ({ icon: 'zap', label: long(18 - (i % 4)) })),
      },
    },
  },
  {
    template: 'timeline_card',
    slots: {
      slot_timeline: {
        content_type: 'timeline_nodes',
        heading: long(56),
        nodes: Array.from({ length: 6 }, (_, i) => ({ date: `19${60 + i * 7}`, label: long(30) })),
      },
    },
  },
  {
    template: 'step_flow',
    slots: {
      slot_steps: {
        content_type: 'steps',
        heading: long(54),
        items: Array.from({ length: 5 }, () => ({ label: long(26), icon: 'settings' })),
      },
    },
  },
  {
    template: 'list_ranking',
    slots: { slot_ranking: { content_type: 'ranking', heading: long(54), items: Array.from({ length: 6 }, () => long(40)) } },
  },
  {
    template: 'progress_meter',
    slots: { slot_meter: { content_type: 'meter', heading: long(56), value_pct: 87, caption: long(60) } },
  },
  {
    template: 'animated_chart',
    slots: {
      slot_chart: {
        content_type: 'chart',
        chart_type: 'bar',
        heading: long(56),
        labels: ['Australia', 'Netherlands', 'Switzerland', 'New Zealand', 'Luxembourg'],
        values: [128, 96, 74, 51, 33],
        unit: '%',
        highlight_index: 1,
        source: long(48),
      },
    },
  },
  {
    template: 'versus_card',
    slots: {
      slot_left: img('a vinyl record'),
      slot_right: img('a streaming app'),
      slot_versus: {
        content_type: 'versus',
        left: { label: long(20), stats: [long(28), long(24), long(20)] },
        right: { label: long(18), stats: [long(26), long(22), long(18)] },
        verdict: long(56),
      },
    },
  },
  {
    template: 'map_card',
    slots: {
      slot_map: {
        content_type: 'map',
        heading: long(52),
        region: 'europe',
        pins: [{ label: long(22), lat: 51.5, lon: -0.12 }, { label: long(20), lat: 48.85, lon: 2.35 }],
        route: true,
      },
    },
  },
  {
    template: 'headline_ticker',
    slots: {
      slot_headlines: {
        content_type: 'headlines',
        heading: long(50),
        items: [
          { text: long(64), source: 'The Guardian' },
          { text: long(56), source: 'Reuters' },
          { text: long(48), source: 'Bloomberg' },
        ],
      },
    },
  },
  {
    template: 'pictogram_percent',
    slots: { slot_pictogram: { content_type: 'pictogram', heading: long(52), filled: 6.4, of: 10, label: long(48), unit: '%' } },
  },
  {
    template: 'myth_fact',
    slots: { slot_myth_fact: { content_type: 'myth_fact', heading: long(40), myth: long(140), fact: long(140) } },
    at: 0.9,
  },
  {
    template: 'quadrant_map',
    slots: {
      slot_quadrant: {
        content_type: 'quadrant',
        heading: long(56),
        x_axis: { left_label: long(18), right_label: long(18) },
        y_axis: { bottom_label: long(18), top_label: long(18) },
        // Worst case for this card is a CLUSTER: four items in one corner with
        // maximum-length labels, which is exactly the shape a real finding
        // takes ("everything safe is also low-return").
        quadrant_items: [
          { label: long(20), x: 0.06, y: 0.08 },
          { label: long(20), x: 0.12, y: 0.14 },
          { label: long(18), x: 0.18, y: 0.2 },
          { label: long(20), x: 0.24, y: 0.26 },
          { label: long(16), x: 0.94, y: 0.93 },
          { label: long(20), x: 0.97, y: 0.05 },
        ],
        zones: {
          top_left: long(16),
          top_right: long(16),
          bottom_left: long(16),
          bottom_right: long(16),
        },
        highlight_index: 4,
        caption: long(64),
      },
    },
  },
  {
    template: 'scale_comparison',
    slots: {
      slot_scale: {
        content_type: 'scale',
        heading: long(56),
        unit: 'metres',
        shape: 'square',
        // Worst case is RATIO MODE with three maximum-length labels and notes:
        // the biggest drawn full size, two markers with chips beside it.
        scale_items: [
          { label: long(24), value: 12000, scale: 1, ratio: 1, note: long(40) },
          { label: long(24), value: 30, scale: 0.0025, ratio: 400, note: long(40) },
          { label: long(22), value: 1.8, scale: 0.00015, ratio: 6667, note: long(40) },
        ],
        to_scale: false,
        highlight_index: 2,
        caption: long(64),
      },
    },
  },
  {
    template: 'evidence_card',
    slots: {
      slot_evidence: {
        content_type: 'evidence',
        // Worst case is every field at its cap: a 160-char finding wrapping to
        // the line budget against the accent rule, a 48-char source, and both
        // metadata chips at full length wrapping the attribution row.
        heading: long(60),
        finding: long(160),
        source: long(48),
        year: '2019–2023',
        sample: long(40),
        caption: long(80),
      },
    },
  },
  {
    template: 'hierarchy_card',
    slots: {
      // Worst case is the DENSEST org chart the clamp allows: four branches,
      // each at its label cap with a full caption AND its own four grandchildren
      // at their cap — the portrait sweep is where a too-tall tree overflows.
      slot_hierarchy: {
        content_type: 'hierarchy',
        heading: long(52),
        root: long(28),
        highlight_index: 2,
        caption: long(60),
        children: [
          { label: long(22), caption: long(40), children: [{ label: long(18) }, { label: long(18) }, { label: long(18) }, { label: long(18) }] },
          { label: long(22), caption: long(40), children: [{ label: long(18) }, { label: long(18) }, { label: long(18) }, { label: long(18) }] },
          { label: long(20), caption: long(40), children: [{ label: long(18) }, { label: long(18) }, { label: long(18) }, { label: long(18) }] },
          { label: long(22), caption: long(40), children: [{ label: long(18) }, { label: long(18) }, { label: long(18) }, { label: long(18) }] },
        ],
      },
    },
  },
  {
    template: 'proportion_flow',
    slots: {
      slot_proportion: {
        content_type: 'proportion',
        heading: long(56),
        source_label: long(24),
        unit: '$',
        total: 1000,
        // Worst case is a LOPSIDED split at maximum label length: one part
        // takes almost everything and the rest are slivers too thin to print a
        // percentage inside — exactly the shape a real breakdown takes.
        slices: [
          { label: long(24), value: 880, share: 0.88, note: long(40) },
          { label: long(24), value: 70, share: 0.07, note: long(40) },
          { label: long(22), value: 30, share: 0.03, note: long(40) },
          { label: long(24), value: 12, share: 0.012, note: long(40) },
          { label: long(20), value: 8, share: 0.008, note: long(40) },
        ],
        highlight_index: 3,
        caption: long(64),
      },
    },
  },
  {
    template: 'spectrum_card',
    slots: {
      slot_spectrum: {
        content_type: 'spectrum',
        heading: long(56),
        axis: { left_label: long(18), right_label: long(18) },
        spectrum_items: [
          { label: long(20), position: 0.08 },
          { label: long(18), position: 0.34 },
          { label: long(16), position: 0.42 },
          { label: long(20), position: 0.78 },
          { label: long(14), position: 0.94 },
        ],
        highlight_index: 3,
        caption: long(64),
      },
    },
  },
  {
    template: 'venn_card',
    slots: {
      slot_venn: {
        content_type: 'venn',
        heading: long(54),
        sets: [
          { label: long(20), caption: long(32) },
          { label: long(18), caption: long(30) },
          { label: long(16), caption: long(28) },
        ],
        overlap_label: long(28),
        caption: long(60),
      },
    },
  },
  {
    template: 'cycle_diagram',
    slots: {
      slot_cycle: {
        content_type: 'cycle',
        heading: long(54),
        items: Array.from({ length: 6 }, () => ({ label: long(26), icon: 'droplet' })),
        caption: long(50),
      },
    },
  },
  {
    template: 'decision_tree',
    slots: {
      slot_decision: {
        content_type: 'decision',
        question: long(64),
        heading: long(50),
        caption: long(70),
        branches: [
          {
            label: long(14),
            question: long(48),
            branches: [{ label: long(12), outcome: long(36) }, { label: long(10), outcome: long(34) }],
          },
          { label: long(13), outcome: long(40) },
        ],
      },
    },
  },
  {
    template: 'receipt_card',
    slots: {
      slot_receipt: {
        content_type: 'receipt',
        heading: long(50),
        unit: '$',
        rows: Array.from({ length: 8 }, (_, i) => ({ label: long(28), value: (i + 1) * 1234.5 * (i === 6 ? -1 : 1) })),
        total_label: long(20),
        caption: long(70),
      },
    },
  },
  {
    template: 'term_card',
    slots: {
      slot_term: {
        content_type: 'term',
        term: 'Antidisestablishmentarian',
        phonetic: '/ˌæn.ti.dɪs.ɪˌstæb.lɪʃ.mənˈteər.i.ən/',
        part_of_speech: 'adjective',
        definition: long(120),
        heading: long(50),
        caption: long(72),
      },
    },
  },
  {
    template: 'practice_card',
    slots: {
      slot_practice: {
        content_type: 'practice',
        prompt: 'frac{x^2 - 9}{x - 3} + 4x = 8',
        answer: 'x = 5 (the other root is rejected)',
        hint: long(70),
        heading: long(56),
        caption: long(72),
      },
    },
    at: 0.92,
  },
  {
    template: 'common_mistake',
    slots: {
      slot_mistake: {
        content_type: 'mistake',
        wrong: 'sqrt{a^2 + b^2} = a + b for every a and b',
        correct: 'sqrt{a^2 + b^2} stays exactly as it is written',
        why: long(100),
        heading: long(56),
        caption: long(72),
      },
    },
    at: 0.92,
  },

  // ---- media cards: the chrome is what is under test ----------------------
  { template: 'before_after', slots: { slot_before: img('a derelict shopfront'), slot_after: img('the same shop, restored') } },
  { template: 'quote_portrait', slots: { slot_portrait: img('a portrait, shoulders up'), slot_quote: { content_type: 'text_block', heading: long(120), bullets: ['— Someone With A Long Name'] } } },
  { template: 'phone_mockup', slots: { slot_screen: { ...img('an app feed'), frame: 'phone' } } },
  { template: 'photo_stack', slots: { slot_photo_1: img('a street scene'), slot_photo_2: img('a market stall'), slot_photo_3: img('a train platform'), slot_photo_4: img('a rooftop') } },
  {
    template: 'labeled_diagram',
    slots: {
      slot_diagram: {
        ...img('one clean centred object on a plain background'),
        heading: long(52),
        callout_suggestions: [long(18), long(16), long(14), long(12)],
      },
    },
  },

  // ---- technical cards ----------------------------------------------------
  {
    template: 'formula_anatomy',
    slots: {
      slot_formula: {
        content_type: 'formula',
        heading: long(52),
        formula: 'x = frac{-b pm sqrt{b^2 - 4*a*c}}{2*a}',
        slices: [
          { match: 'b^2 - 4*a*c', label: long(48) },
          { match: '2*a', label: long(44) },
          { match: 'pm', label: long(40) },
        ],
      },
    },
  },
  {
    template: 'math_steps',
    slots: {
      slot_math: {
        content_type: 'math_steps',
        heading: long(56),
        steps: [
          { expr: 'frac{3x + 12}{4} = 2x - 9', note: 'the starting line' },
          { expr: '3x + 12 = 8x - 36', note: 'multiply both sides by 4' },
          { expr: '48 = 5x', note: 'collect the terms' },
          { expr: 'x = 9.6', note: 'divide by five' },
        ],
        rule: { name: long(40), formula: 'a*(b + c) = a*b + a*c', why: long(120) },
      },
    },
  },
  {
    template: 'geometry_diagram',
    slots: {
      slot_geometry: {
        content_type: 'geometry',
        heading: long(54),
        shape: 'right_triangle',
        side_labels: [long(14), long(12), long(10)],
        angle_marks: [{ at: 1, label: '90°', right: true }],
        caption: long(64),
      },
    },
  },
  {
    template: 'function_plot',
    slots: {
      slot_plot: {
        content_type: 'function_plot',
        heading: long(54),
        expression: 'x^2 - 4',
        x_min: -5,
        x_max: 5,
        marks: [{ x: -2, label: long(16) }, { x: 2, label: long(14) }],
        caption: long(64),
      },
    },
  },
  {
    template: 'scenario_diagram',
    slots: {
      slot_scenario: {
        content_type: 'scenario',
        heading: long(40),
        layout: 'arc',
        entities: [
          { label: long(16), icon: 'rocket', value: 'h0 = 3 m' },
          { label: long(14), icon: 'mountain', value: 'h max = ?' },
          { label: long(12), icon: 'flag', value: 'h = 0' },
        ],
        connectors: [{ label: long(18), style: 'arrow' }, { label: long(16), style: 'arrow' }],
        question: 'h max = ?  t = ?',
      },
    },
  },
];
