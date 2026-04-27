import { create } from 'zustand';
import type { ArbitrageOpportunity, TradeHistoryEntry } from '../types/market.types';

interface OpportunitiesState {
  opportunities: ArbitrageOpportunity[];
  history: TradeHistoryEntry[];
  connected: boolean;
  setConnected: (v: boolean) => void;
  setSnapshot: (ops: ArbitrageOpportunity[]) => void;
  addOpportunity: (op: ArbitrageOpportunity) => void;
  removeOpportunity: (id: string) => void;
  addHistory: (entry: TradeHistoryEntry) => void;
}

export const useOpportunitiesStore = create<OpportunitiesState>((set) => ({
  opportunities: [],
  history: [],
  connected: false,
  setConnected: (v) => set({ connected: v }),
  setSnapshot: (ops) => set({ opportunities: ops }),
  addOpportunity: (op) =>
    set((state) => {
      const existing = state.opportunities.findIndex((o) => o.id === op.id);
      if (existing >= 0) {
        const updated = [...state.opportunities];
        updated[existing] = op;
        return { opportunities: updated };
      }
      return { opportunities: [op, ...state.opportunities] };
    }),
  removeOpportunity: (id) =>
    set((state) => ({
      opportunities: state.opportunities.filter((o) => o.id !== id),
    })),
  addHistory: (entry) =>
    set((state) => ({ history: [entry, ...state.history].slice(0, 50) })),
}));
