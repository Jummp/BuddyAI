import { create } from "zustand";
import { apiGet, apiDelete, apiPatch } from "../services/api";

export type Memory = {
  id: string;
  date: string;
  raw_text: string;
  summary: string;
  tags: string[];
  entities: {
    events?: string[];
    people?: string[];
    emotions?: string[];
    topics?: string[];
  };
};

export type JournalFilters = {
  memory_type: string | null;
  date_from: string | null;
  date_to: string | null;
  groupBy: "day" | "week" | "topic";
};

type JournalStore = {
  memories: Memory[];
  loading: boolean;
  error: string | null;
  filters: JournalFilters;
  setFilters: (f: Partial<JournalFilters>) => void;
  fetchMemories: () => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  updateTags: (id: string, tags: string[]) => Promise<void>;
};

export const useJournalStore = create<JournalStore>((set, get) => ({
  memories: [],
  loading: false,
  error: null,
  filters: {
    memory_type: null,
    date_from: null,
    date_to: null,
    groupBy: "day",
  },

  setFilters: (f) =>
    set((s) => ({ filters: { ...s.filters, ...f } })),

  fetchMemories: async () => {
    set({ loading: true, error: null });
    const { filters } = get();
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (filters.memory_type) params.set("memory_type", filters.memory_type);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    try {
      const data = await apiGet<Memory[]>(`/memories?${params}`);
      set({ memories: data });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: false });
    }
  },

  deleteMemory: async (id) => {
    await apiDelete(`/memories/${id}`);
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
  },

  updateTags: async (id, tags) => {
    await apiPatch(`/memories/${id}/tags`, { tags });
    set((s) => ({
      memories: s.memories.map((m) => m.id === id ? { ...m, tags } : m),
    }));
  },
}));
