import { create } from 'zustand';
import { createDefaultSave, type Progress } from '@/services/save/saveSchema';

export const useProgressStore = create<{
  progress: Progress;
  setProgress(progress: Progress): void;
}>((set) => ({
  progress: createDefaultSave().progress,
  setProgress: (progress) => set({ progress }),
}));
