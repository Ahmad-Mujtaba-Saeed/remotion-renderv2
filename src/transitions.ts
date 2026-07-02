import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { TransitionType } from './types';
import { zoomThrough } from './presentations/zoomThrough';

/**
 * Maps a registry transition name to a Remotion transition presentation.
 * "push_*" use slide (both scenes move together); "wipe" reveals over the top;
 * "zoom_through" is our custom punch-in. Unknown falls back to fade.
 */
export const presentationFor = (t?: TransitionType) => {
  switch (t) {
    case 'push_left':
      return slide({ direction: 'from-right' });
    case 'push_right':
      return slide({ direction: 'from-left' });
    case 'push_up':
      return slide({ direction: 'from-bottom' });
    case 'wipe':
      return wipe({ direction: 'from-left' });
    case 'zoom_through':
      return zoomThrough();
    case 'fade':
    default:
      return fade();
  }
};
