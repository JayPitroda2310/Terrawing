import { useProgress } from '@react-three/drei';
import { WordmarkLoader } from '@/ui/common/WordmarkLoader';

/**
 * Mission loading: the wordmark loader tracking every texture and model the world loads. It stays
 * up until the world is fully loaded and running (see GameLoop), so play starts smoothly.
 */
export function LoadingScreen() {
  const progress = useProgress((s) => s.progress);
  return <WordmarkLoader percent={progress} />;
}
