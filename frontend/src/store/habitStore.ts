import { create } from "zustand";
import { apiGet, apiPatch, apiDelete, apiPost } from "../services/api";

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
  createHabit: (fields: Pick<Habit, "name" | "habit_type" | "unit" | "target">) => Promise<Habit>;
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

  createHabit: async (fields) => {
    try {
      const created = await apiPost<Habit>("/habits", fields);
      set((s) => ({ habits: [...s.habits, created], error: null }));
      return created;
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  updateHabit: async (id, fields) => {
    try {
      const updated = await apiPatch<Habit>(`/habits/${id}`, fields);
      set((s) => ({
        habits: s.habits.map((h) => (h.id === id ? { ...h, ...updated } : h)),
        error: null,
      }));
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },

  deleteHabit: async (id) => {
    try {
      await apiDelete(`/habits/${id}`);
      set((s) => ({ habits: s.habits.filter((h) => h.id !== id), error: null }));
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },
}));
