import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import type { TransitionPresentation } from '@remotion/transitions';
import { TransitionType } from './types';
import { zoomThrough } from './presentations/zoomThrough';
import { zoomOutIn } from './presentations/zoomOutIn';
import { whipPan } from './presentations/whipPan';

/**
 * Maps a registry transition name to a Remotion transition presentation.
 * "push_*" use slide (both scenes move together); "wipe*" reveals over the
 * top; "zoom_through" punches IN to a detail, "zoom_out_in" exhales OUT to a
 * new topic, "whip_pan" is a fast lateral throw. Unknown falls back to fade.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const presentationFor = (t?: TransitionType): TransitionPresentation<any> => {
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
    case 'fade':
    default:
      return fade();
  }
};
