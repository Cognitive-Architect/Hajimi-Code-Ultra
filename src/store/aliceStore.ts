/**
 * Alice状态管理 (Zustand风格)
 * HAJIMI-ALICE-UI
 * 
 * 四状态：隐身/警觉/交互/辅助
 * 
 * @module src/store/aliceStore
 * @author Soyorin (PM) - B-03/09
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type AliceState = 'hidden' | 'idle' | 'alert' | 'interact' | 'assist';

export interface MLResult {
  behavior: string;
  confidence: number;
  latency: number;
  source: 'ml' | 'heuristic';
}

interface AliceStore {
  // 状态
  state: AliceState;
  position: { x: number; y: number };
  isMenuOpen: boolean;
  selectedPersona: string | null;
  
  // ML相关
  mlResult: MLResult | null;
  mlEnabled: boolean;
  
  // 配置
  theme: 'light' | 'dark';
  animationEnabled: boolean;
  soundEnabled: boolean;
  
  // Actions
  setState: (state: AliceState) => void;
  setPosition: (pos: { x: number; y: number }) => void;
  openMenu: () => void;
  closeMenu: () => void;
  selectPersona: (persona: string) => void;
  setMLResult: (result: MLResult | null) => void;
  toggleML: () => void;
  disableAlice: () => void;
  reset: () => void;
}

export const useAliceStore = create<AliceStore>()(
  subscribeWithSelector((set) => ({
    // 初始状态
    state: 'idle',
    position: { x: typeof window !== 'undefined' ? window.innerWidth - 80 : 100, y: 100 },
    isMenuOpen: false,
    selectedPersona: null,
    mlResult: null,
    mlEnabled: true,
    theme: 'light',
    animationEnabled: true,
    soundEnabled: false,
    
    // Actions
    setState: (state) => set({ state }),
    setPosition: (position) => set({ position }),
    openMenu: () => set({ isMenuOpen: true, state: 'interact' }),
    closeMenu: () => set({ isMenuOpen: false, state: 'idle' }),
    selectPersona: (persona) => set({ selectedPersona: persona, state: 'assist' }),
    setMLResult: (mlResult) => set({ mlResult }),
    toggleML: () => set((s) => ({ mlEnabled: !s.mlEnabled })),
    disableAlice: () => set({ state: 'hidden', mlEnabled: false }),
    reset: () => set({
      state: 'idle',
      isMenuOpen: false,
      selectedPersona: null,
      mlResult: null,
    }),
  }))
);

// ML置信度监听 (<0.7自动警觉)
export function initMLListener() {
  useAliceStore.subscribe(
    (state) => state.mlResult,
    (mlResult) => {
      if (!mlResult) return;
      
      const currentState = useAliceStore.getState().state;
      if (currentState === 'interact' || currentState === 'assist') return;
      
      if (mlResult.confidence < 0.7) {
        useAliceStore.getState().setState('alert');
      }
    }
  );
}

export default useAliceStore;
