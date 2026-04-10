import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, RefreshControl,
  Alert, Modal, TextInput, ScrollView, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/colors";
import { useJournalStore, Memory } from "../store/journalStore";
import { apiGet } from "../services/api";
import WeekStrip, { Period } from "../components/WeekStrip";

function isoDate(d: Date): string { return d.toISOString().split("T")[0]; }

function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function groupByDay(memories: Memory[]): { date: string; items: Memory[] }[] {
  const map = new Map<string, Memory[]>();
  for (const m of memories) {
    if (!m.date) continue;
    const day = m.date.split("T")[0];
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(m);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
}

// Macro categories — filter by special tag
const MACRO_CATS = [
  { key: "all",             label: "Tutti",    icon: "·" },
  { key: "epic_adventures", label: "Epic",     icon: "⚡" },
  { key: "tasks",           label: "Tasks",    icon: "✓" },
  { key: "updates",         label: "Updates",  icon: "↑" },
  { key: "everyday",        label: "Daily",    icon: "◎" },
] as const;
type MacroCat = typeof MACRO_CATS[number]["key"];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? Colors.primary : Colors.surface,
        borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
        borderWidth: active ? 0 : 1, borderColor: Colors.border,
      }}
    >
      <Text style={{ color: active ? Colors.black : Colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const MACRO_ASSIGN = MACRO_CATS.filter((c) => c.key !== "all");

function MemoryCard({ m, activeTag, onTagPress, onDelete, onUpdateTags }: {
  m: Memory; activeTag: string | null;
  onTagPress: (t: string) => void;
  onDelete: () => void;
  onUpdateTags: (tags: string[]) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(m.tags ?? []);
  const tags = localTags;

  const toggleMacro = async (key: string) => {
    const next = tags.includes(key)
      ? tags.filter((t) => t !== key)
      : [...tags, key].slice(0, 5);
    setLocalTags(next);
    try { await onUpdateTags(next); } catch { setLocalTags(tags); }
  };

  const openTranscript = () => { setDraftTags([...tags]); setEditingTags(false); setExpanded(true); };

  const saveTagEdits = async () => {
    setSaving(true);
    try { await onUpdateTags(draftTags.slice(0, 5)); setEditingTags(false); }
    finally { setSaving(false); }
  };

  const addDraftTag = () => {
    const t = newTag.trim().toLowerCase();
    if (t && !draftTags.includes(t) && draftTags.length < 5) {
      setDraftTags([...draftTags, t]); setNewTag("");
    }
  };

  return (
    <>
      <Pressable
        onPress={openTranscript}
        onLongPress={onDelete}
        style={({ pressed }) => ({
          backgroundColor: Colors.surface, borderRadius: 16,
          padding: 14, marginBottom: 10, opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text selectable style={{ color: Colors.textPrimary, fontSize: 15, lineHeight: 22, marginBottom: 10 }}>
          {m.summary}
        </Text>

        {/* Macro category quick-assign */}
        <View style={{ flexDirection: "row", gap: 5, marginBottom: 8 }}>
          {MACRO_ASSIGN.map(({ key, icon, label }) => {
            const active = tags.includes(key);
            return (
              <Pressable
                key={key}
                onPress={() => toggleMacro(key)}
                style={{
                  backgroundColor: active ? Colors.primary : Colors.surface2,
                  borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4,
                  flexDirection: "row", alignItems: "center", gap: 3,
                  borderWidth: 1, borderColor: active ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{ fontSize: 10, color: active ? Colors.black : Colors.textSecondary }}>{icon}</Text>
                <Text style={{ fontSize: 10, color: active ? Colors.black : Colors.textSecondary, fontWeight: "600" }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tags.filter((t) => !MACRO_ASSIGN.map((c) => c.key).includes(t as any)).length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {tags.filter((t) => !MACRO_ASSIGN.map((c) => c.key).includes(t as any)).map((tag) => (
              <Pressable
                key={tag}
                onPress={() => onTagPress(tag)}
                style={{
                  backgroundColor: activeTag === tag ? Colors.primary : Colors.surface2,
                  borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
                  borderWidth: 1, borderColor: activeTag === tag ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{ color: activeTag === tag ? Colors.black : Colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                  #{tag}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
          {new Date(m.date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
          {"  "}
          {new Date(m.date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </Pressable>

      <Modal visible={expanded} transparent animationType="slide" onRequestClose={() => setExpanded(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: Colors.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", padding: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ color: Colors.textPrimary, fontSize: 17, fontWeight: "700" }}>
                {editingTags ? "Modifica tag" : "Transcript"}
              </Text>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <Pressable onPress={() => { setEditingTags(!editingTags); setDraftTags([...tags]); }}>
                  <Text style={{ color: Colors.primary, fontSize: 14 }}>{editingTags ? "Annulla" : "Modifica tag"}</Text>
                </Pressable>
                <Pressable onPress={() => setExpanded(false)}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>✕</Text>
                </Pressable>
              </View>
            </View>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
              {new Date(m.date).toLocaleString("it-IT")}
            </Text>
            {editingTags ? (
              <View>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 10 }}>Max 5 tag. Clicca ✕ per rimuovere.</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {draftTags.map((tag) => (
                    <View key={tag} style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.primary, borderRadius: 999, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, gap: 4 }}>
                      <Text style={{ color: Colors.black, fontWeight: "600", fontSize: 13 }}>#{tag}</Text>
                      <Pressable onPress={() => setDraftTags(draftTags.filter((t) => t !== tag))} hitSlop={8}>
                        <Text style={{ color: Colors.black, fontSize: 13, fontWeight: "700" }}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                {draftTags.length < 5 && (
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                    <TextInput
                      value={newTag} onChangeText={setNewTag}
                      placeholder="nuovo tag..." placeholderTextColor={Colors.textSecondary}
                      onSubmitEditing={addDraftTag} autoFocus
                      style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 15 }}
                    />
                    <Pressable onPress={addDraftTag} style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}>
                      <Text style={{ color: Colors.black, fontWeight: "700" }}>+</Text>
                    </Pressable>
                  </View>
                )}
                <Pressable onPress={saveTagEdits} disabled={saving} style={{ backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: "center" }}>
                  <Text style={{ color: Colors.black, fontWeight: "700" }}>{saving ? "Salvo..." : "Salva tag"}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {tags.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {tags.map((tag) => (
                      <View key={tag} style={{ backgroundColor: Colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: "600" }}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <ScrollView>
                  <Text selectable style={{ color: Colors.textPrimary, fontSize: 15, lineHeight: 24 }}>{m.raw_text}</Text>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const { memories, loading, setFilters, fetchMemories, deleteMemory, updateTags } = useJournalStore();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [macroCat, setMacroCat] = useState<MacroCat>("all");
  const [tagSearch, setTagSearch] = useState("");

  const todayStr = isoDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [period, setPeriod] = useState<Period>("day");

  // AI summary — only loaded on demand
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryRange, setSummaryRange] = useState<{ from: string; to: string } | null>(null);

  const activeDates = useMemo(
    () => Array.from(new Set(memories.filter((m) => m.date).map((m) => m.date.split("T")[0]))),
    [memories]
  );

  const allTags = useMemo(
    () => Array.from(new Set(memories.flatMap((m) => m.tags ?? []))),
    [memories]
  );

  const tagSuggestions = useMemo(
    () => tagSearch.trim()
      ? allTags.filter((t) => t.includes(tagSearch.trim().toLowerCase())).slice(0, 6)
      : [],
    [allTags, tagSearch]
  );

  const loadWithPeriod = useCallback(async (date: string, p: Period) => {
    setSummary(null);
    setSummaryVisible(false);
    let date_from = date;
    let date_to = date;

    if (p === "week") {
      const monday = startOfWeek(new Date(date));
      date_from = isoDate(monday);
      date_to = isoDate(addDays(monday, 6));
    } else if (p === "month") {
      const d = new Date(date);
      date_from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      date_to = isoDate(last);
    }

    setSummaryRange(p !== "day" ? { from: date_from, to: date_to } : null);
    setFilters({ date_from, date_to });
    fetchMemories();
  }, []);

  const generateSummary = async () => {
    if (!summaryRange) return;
    setLoadingSummary(true);
    try {
      const res = await apiGet<{ summary: string; count: number }>(
        `/memories/summary?date_from=${summaryRange.from}&date_to=${summaryRange.to}`
      );
      setSummary(res.summary);
      setSummaryVisible(true);
    } catch {}
    setLoadingSummary(false);
  };

  useEffect(() => {
    setFilters({ date_from: null, date_to: null });
    fetchMemories();
  }, []);

  const onSelectDate = (date: string) => {
    setSelectedDate(date);
    setActiveTag(null);
    setTagSearch("");
    loadWithPeriod(date, period);
  };

  const onPeriodChange = (p: Period) => {
    setPeriod(p);
    setActiveTag(null);
    loadWithPeriod(selectedDate, p);
  };

  const onSelectTag = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
    setTagSearch("");
  };

  const onDelete = (id: string) => {
    Alert.alert("Elimina memoria", "Sicuro?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMemory(id) },
    ]);
  };

  // Apply filters: macro cat first, then tag
  const filtered = useMemo(() => {
    let result = memories;
    if (macroCat !== "all") {
      result = result.filter((m) => (m.tags ?? []).includes(macroCat));
    }
    if (activeTag) {
      result = result.filter((m) => (m.tags ?? []).includes(activeTag));
    }
    return result;
  }, [memories, macroCat, activeTag]);

  const grouped = groupByDay(filtered);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.black }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ color: Colors.textPrimary, fontSize: 24, fontWeight: "700" }}>Journal</Text>
      </View>

      {/* Week strip with period selector */}
      <WeekStrip
        selectedDate={selectedDate}
        activeDates={activeDates}
        onSelectDate={onSelectDate}
        period={period}
        onPeriodChange={onPeriodChange}
        showPeriod
      />

      {/* Macro category chips */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingBottom: 10, gap: 6 }}>
        {MACRO_CATS.map(({ key, label, icon }) => {
          const active = macroCat === key;
          return (
            <Pressable
              key={key}
              onPress={() => { setMacroCat(key); setActiveTag(null); }}
              style={{
                backgroundColor: active ? Colors.primary : Colors.surface,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 11, color: active ? Colors.black : Colors.textSecondary }}>{icon}</Text>
              <Text style={{ color: active ? Colors.black : Colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* AI Summary — on demand */}
      {summaryRange && (
        <View style={{ marginHorizontal: 20, marginBottom: 10 }}>
          {!summaryVisible ? (
            <Pressable
              onPress={generateSummary}
              disabled={loadingSummary}
              style={({ pressed }) => ({
                backgroundColor: Colors.surface,
                borderRadius: 12, padding: 12,
                flexDirection: "row", alignItems: "center", gap: 8,
                opacity: pressed || loadingSummary ? 0.7 : 1,
              })}
            >
              {loadingSummary
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={{ color: Colors.primary, fontSize: 13 }}>✦</Text>
              }
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>
                {loadingSummary ? "Generando analisi..." : `Genera analisi ${period === "week" ? "settimana" : "mese"}`}
              </Text>
            </Pressable>
          ) : (
            <View style={{ backgroundColor: Colors.surface2, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.primary + "44" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: "700" }}>
                  ANALISI {period === "week" ? "SETTIMANA" : "MESE"}
                </Text>
                <Pressable onPress={() => { setSummaryVisible(false); setSummary(null); }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>✕</Text>
                </Pressable>
              </View>
              <Text selectable style={{ color: Colors.textPrimary, fontSize: 14, lineHeight: 21 }}>{summary}</Text>
            </View>
          )}
        </View>
      )}

      {/* Tag search */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          <Text style={{ color: Colors.textSecondary, fontSize: 15 }}>🔍</Text>
          <TextInput
            value={activeTag ? `#${activeTag}` : tagSearch}
            onChangeText={(v) => {
              if (activeTag) { setActiveTag(null); setTagSearch(v.replace(/^#/, "")); }
              else setTagSearch(v.replace(/^#/, ""));
            }}
            placeholder="Cerca tag..."
            placeholderTextColor={Colors.textSecondary}
            style={{ flex: 1, color: activeTag ? Colors.primary : Colors.textPrimary, fontSize: 15 }}
          />
          {(activeTag || tagSearch) && (
            <Pressable onPress={() => { setActiveTag(null); setTagSearch(""); }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>✕</Text>
            </Pressable>
          )}
        </View>
        {tagSuggestions.length > 0 && (
          <View style={{ backgroundColor: Colors.surface2, borderRadius: 12, marginTop: 4, overflow: "hidden" }}>
            {tagSuggestions.map((tag, i) => (
              <Pressable
                key={tag} onPress={() => onSelectTag(tag)}
                style={({ pressed }) => ({
                  paddingHorizontal: 14, paddingVertical: 11,
                  borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: Colors.textPrimary, fontSize: 14 }}>
                  <Text style={{ color: Colors.primary }}>#</Text>{tag}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Memories list */}
      <FlatList
        style={{ flex: 1 }}
        data={grouped}
        keyExtractor={(g) => g.date}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadWithPeriod(selectedDate, period)} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: group }) => (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {formatDate(group.date)}
            </Text>
            {group.items.map((m) => (
              <MemoryCard
                key={m.id} m={m} activeTag={activeTag}
                onTagPress={onSelectTag}
                onDelete={() => onDelete(m.id)}
                onUpdateTags={(tags) => updateTags(m.id, tags)}
              />
            ))}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={{ color: Colors.textSecondary, textAlign: "center", marginTop: 40 }}>
              {activeTag
                ? `Nessuna memoria con tag #${activeTag}`
                : macroCat !== "all"
                  ? `Nessuna memoria in "${MACRO_CATS.find(c => c.key === macroCat)?.label}"`
                  : "Nessuna memoria in questo periodo"}
            </Text>
          ) : null
        }
      />
    </View>
  );
}
