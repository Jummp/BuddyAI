import { create } from "zustand";
import { apiGet, apiPatch, apiDelete } from "../services/api";

export type Habit = {
  id: string;
  name: string;
  habit_type: "habit" | "limit";
  unit: string;
  target: number;
  reminder_time: string | null;
  weekly_total: number;
};

type HabitStore = {
  habits: Habit[];
  loading: boolean;
  error: string | null;
  fetchHabits: () => Promise<void>;
  updateHabit: (id: string, fields: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
};

export const useHabitStore = create<HabitStore>((set) => ({
  habits: [],
  loading: false,
  error: null,

  fetchHabits: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiGet<Habit[]>("/habits");
      set({ habits: data });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: false });
    }
  },

  updateHabit: async (id, fields) => {
    const updated = await apiPatch<Habit>(`/habits/${id}`, fields);
    set((s) => ({
      habits: s.habits.map((h) => (h.id === id ? { ...h, ...updated } : h)),
    }));
  },

  deleteHabit: async (id) => {
    await apiDelete(`/habits/${id}`);
    set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }));
  },
}));
