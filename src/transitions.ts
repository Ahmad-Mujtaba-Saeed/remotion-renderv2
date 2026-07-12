import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import type { TransitionPresentation } from '@remotion/transitions';
import { Theme, TransitionType } from './types';
import { zoomThrough } from './presentations/zoomThrough';
import { zoomOutIn } from './presentations/zoomOutIn';
import { whipPan } from './presentations/whipPan';
import { maskWipeCircle } from './presentations/maskWipeCircle';
import { maskWipeDiagonal } from './presentations/maskWipeDiagonal';
import { columnReveal } from './presentations/columnReveal';
import { splitSlide } from './presentations/splitSlide';
import { stackPush } from './presentations/stackPush';
import { lineSweep } from './presentations/lineSweep';
import { matchDissolve } from './presentations/matchDissolve';
import { seamColors } from './presentations/seam';

/**
 * Maps a registry transition name to a Remotion transition presentation.
 * "push_*" use slide (both scenes move together); "wipe*" reveals over the
 * top; "zoom_through" punches IN to a detail, "zoom_out_in" exhales OUT to a
 * new topic, "whip_pan" is a fast lateral throw. The §3.1 set carries the
 * relation grammar: stack_push=continues, mask_wipe_circle=elaborates,
 * split_slide=contrast, match_dissolve=callback, line_sweep=new_chapter,
 * mask_wipe_diagonal/column_reveal=crisp/analytical cuts. Unknown → fade.
 *
 * `theme` colours the accent seams/edge lines some presentations draw; the
 * seam helper falls back to ink when the accent fails contrast.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const presentationFor = (t?: TransitionType, theme?: Theme | null): TransitionPresentation<any> => {
  switch (t) {
    case 'push_left':
      return slide({ direction: 'from-right' });
    case 'push_right':
      return slide({ direction: 'from-left' });
    case 'push_up':
      return slide({ direction: 'from-bottom' });
    case 'push_down':
      return slide({ direction: 'from-top' });
    case 'wipe':
      return wipe({ direction: 'from-left' });
    case 'wipe_up':
      return wipe({ direction: 'from-bottom' });
    case 'zoom_through':
      return zoomThrough();
    case 'zoom_out_in':
      return zoomOutIn();
    case 'whip_pan':
      return whipPan();
    case 'mask_wipe_circle':
      return maskWipeCircle();
    case 'mask_wipe_diagonal':
      return maskWipeDiagonal({ edgeColor: seamColors(theme).edge });
    case 'column_reveal':
      return columnReveal();
    case 'split_slide':
      return splitSlide({ edgeColor: seamColors(theme).edge });
    case 'stack_push':
      // The dim wash always DARKENS (a recede), so it is true ink — not
      // theme.text, which is near-white on dark schemes.
      return stackPush({ edgeColor: seamColors(theme).edge, inkColor: '#17120E' });
    case 'line_sweep':
      return lineSweep({ edgeColor: seamColors(theme).edge });
    case 'match_dissolve':
      return matchDissolve();
    case 'fade':
    default:
      return fade();
  }
};
