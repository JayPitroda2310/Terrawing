import { installLoadTracking, overallPercent, useLoadStore } from '@/services/loading/loadProgress';
import { WordmarkLoader } from '@/ui/common/WordmarkLoader';

installLoadTracking();

/**
 * Mission loading: the wordmark loader, with progress weighted by the data actually downloaded
 * and then the world build (see loadProgress). It stays up until the world is fully loaded, its
 * shaders compiled and running (see GameLoop), so play starts smoothly.
 */
export function LoadingScreen() {
  const percent = useLoadStore(overallPercent);
  return <WordmarkLoader percent={percent} />;
}
