import { create } from "zustand";

type AppEventsStore = {
  lastDataMutationAt: number;
  markDataMutation: () => void;
};

export const useAppEventsStore = create<AppEventsStore>((set) => ({
  lastDataMutationAt: 0,
  markDataMutation: () => set({ lastDataMutationAt: Date.now() }),
}));
