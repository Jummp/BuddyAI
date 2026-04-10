import { create } from "zustand";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

type ChatStore = {
  messages: Message[];
  isStreaming: boolean;
  addUserMessage: (text: string) => string;
  startAssistantMessage: () => string;
  appendToken: (id: string, token: string) => void;
  finalizeMessage: (id: string) => void;
  setStreaming: (v: boolean) => void;
};

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isStreaming: false,

  addUserMessage: (text) => {
    const id = Date.now().toString();
    set((s) => ({
      messages: [...s.messages, { id, role: "user", content: text }],
    }));
    return id;
  },

  startAssistantMessage: () => {
    const id = (Date.now() + 1).toString();
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: "assistant", content: "", streaming: true },
      ],
    }));
    return id;
  },

  appendToken: (id, token) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + token } : m
      ),
    }));
  },

  finalizeMessage: (id) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, streaming: false } : m
      ),
    }));
  },

  setStreaming: (v) => set({ isStreaming: v }),
}));
