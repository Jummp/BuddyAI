import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { apiGet } from "../services/api";
import WeekStrip, { Period } from "../components/WeekStrip";
import { Memory, useJournalStore } from "../store/journalStore";
import { Eyebrow, FieldLabel, GlassCard, Pill, ScreenHeader, ScreenShell } from "../components/ui";

function isoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, n: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function groupByDay(memories: Memory[]): { date: string; items: Memory[] }[] {
  const map = new Map<string, Memory[]>();
  for (const memory of memories) {
    if (!memory.date) continue;
    const day = memory.date.split("T")[0];
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(memory);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
}

const MACRO_CATS = [
  { key: "all", label: "All" },
  { key: "epic_adventures", label: "Epic" },
  { key: "tasks", label: "Tasks" },
  { key: "updates", label: "Updates" },
  { key: "everyday", label: "Daily" },
] as const;

type MacroCat = typeof MACRO_CATS[number]["key"];

const MACRO_ASSIGN = MACRO_CATS.filter((c) => c.key !== "all");

function MemoryCard({
  memory,
  activeTag,
  onTagPress,
  onDelete,
  onUpdateTags,
}: {
  memory: Memory;
  activeTag: string | null;
  onTagPress: (tag: string) => void;
  onDelete: () => void;
  onUpdateTags: (tags: string[]) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(memory.tags ?? []);

  useEffect(() => {
    setLocalTags(memory.tags ?? []);
  }, [memory.tags]);

  const toggleMacro = async (key: string) => {
    const next = localTags.includes(key) ? localTags.filter((tag) => tag !== key) : [...localTags, key].slice(0, 5);
    setLocalTags(next);
    try {
      await onUpdateTags(next);
    } catch {
      setLocalTags(memory.tags ?? []);
    }
  };

  const openTranscript = () => {
    setDraftTags([...localTags]);
    setEditingTags(false);
    setExpanded(true);
  };

  const addDraftTag = () => {
    const clean = newTag.trim().toLowerCase();
    if (clean && !draftTags.includes(clean) && draftTags.length < 5) {
      setDraftTags([...draftTags, clean]);
      setNewTag("");
    }
  };

  const saveTags = async () => {
    setSaving(true);
    try {
      const next = draftTags.slice(0, 5);
      await onUpdateTags(next);
      setLocalTags(next);
      setEditingTags(false);
    } catch {
      Alert.alert("Errore", "Impossibile salvare i tag.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable onPress={openTranscript} onLongPress={onDelete}>
        <GlassCard accent style={{ marginBottom: 12 }}>
          <Eyebrow text={new Date(memory.date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} tone="tertiary" />
          <Text style={{ color: Colors.textPrimary, fontSize: 18, lineHeight: 27, fontFamily: Fonts.bodyRegular }}>{memory.summary}</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {MACRO_ASSIGN.map(({ key, label }) => (
              <Pill key={key} label={label} active={localTags.includes(key)} onPress={() => toggleMacro(key)} tone="secondary" />
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {localTags
              .filter((tag) => !MACRO_ASSIGN.map((entry) => entry.key).includes(tag as any))
              .map((tag) => (
                <Pill key={tag} label={`#${tag}`} active={activeTag === tag} onPress={() => onTagPress(tag)} tone="tertiary" />
              ))}
          </View>
        </GlassCard>
      </Pressable>

      <Modal visible={expanded} transparent animationType="slide" onRequestClose={() => setExpanded(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.82)" }}>
          <View style={{ backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <View>
                <Eyebrow text={editingTags ? "Tag Editor" : "Transcript"} tone="primary" />
                <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold }}>
                  {editingTags ? "Edit tags" : "Memory details"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <Pressable onPress={() => { setEditingTags(!editingTags); setDraftTags([...localTags]); }}>
                  <Text style={{ color: Colors.primary, fontFamily: Fonts.headlineBold, fontSize: 12, letterSpacing: 1.1, textTransform: "uppercase" }}>
                    {editingTags ? "Cancel" : "Edit Tags"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setExpanded(false)}>
                  <Text style={{ color: Colors.textSecondary, fontFamily: Fonts.headlineBold, fontSize: 12, letterSpacing: 1.1, textTransform: "uppercase" }}>
                    Close
                  </Text>
                </Pressable>
              </View>
            </View>

            {editingTags ? (
              <View>
                <FieldLabel text="Current Tags" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {draftTags.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => setDraftTags(draftTags.filter((current) => current !== tag))}
                      style={{
                        backgroundColor: Colors.primary,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: Colors.textPrimaryOnAccent, fontFamily: Fonts.headlineBold, fontSize: 11, letterSpacing: 1.1 }}>
                        #{tag} ×
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {draftTags.length < 5 ? (
                  <>
                    <FieldLabel text="New Tag" />
                    <TextInput
                      value={newTag}
                      onChangeText={setNewTag}
                      placeholder="new tag"
                      placeholderTextColor={Colors.textMuted}
                      style={{
                        backgroundColor: Colors.surface,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: Colors.ghostBorder,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        color: Colors.textPrimary,
                        fontFamily: Fonts.bodyRegular,
                        marginBottom: 14,
                      }}
                    />
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Pill label="Add Tag" active onPress={addDraftTag} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Pill label={saving ? "Saving..." : "Save Tags"} active onPress={saveTags} />
                      </View>
                    </View>
                  </>
                ) : (
                  <Pill label={saving ? "Saving..." : "Save Tags"} active onPress={saveTags} />
                )}
              </View>
            ) : (
              <ScrollView>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 14, fontFamily: Fonts.bodyRegular }}>
                  {new Date(memory.date).toLocaleString("it-IT")}
                </Text>
                <Text style={{ color: Colors.textPrimary, fontSize: 15, lineHeight: 25, fontFamily: Fonts.bodyRegular }}>
                  {memory.raw_text}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function JournalScreen() {
  const { memories, loading, setFilters, fetchMemories, deleteMemory, updateTags } = useJournalStore();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [macroCat, setMacroCat] = useState<MacroCat>("all");
  const [tagSearch, setTagSearch] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const [period, setPeriod] = useState<Period>("day");
  const [summaryRange, setSummaryRange] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const activeDates = useMemo(() => Array.from(new Set(memories.filter((m) => m.date).map((m) => m.date.split("T")[0]))), [memories]);
  const allTags = useMemo(() => Array.from(new Set(memories.flatMap((memory) => memory.tags ?? []))), [memories]);
  const tagSuggestions = useMemo(
    () => (tagSearch.trim() ? allTags.filter((tag) => tag.includes(tagSearch.trim().toLowerCase())).slice(0, 6) : []),
    [allTags, tagSearch]
  );

  const loadWithPeriod = useCallback(
    async (date: string, nextPeriod: Period) => {
      setSummary(null);
      setSummaryVisible(false);
      let date_from = date;
      let date_to = date;

      if (nextPeriod === "week") {
        const monday = startOfWeek(new Date(date));
        date_from = isoDate(monday);
        date_to = isoDate(addDays(monday, 6));
      } else if (nextPeriod === "month") {
        const d = new Date(date);
        date_from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        date_to = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      }

      setSummaryRange(nextPeriod !== "day" ? { from: date_from, to: date_to } : null);
      setFilters({ date_from, date_to });
      fetchMemories();
    },
    [fetchMemories, setFilters]
  );

  useEffect(() => {
    setFilters({ date_from: null, date_to: null });
    fetchMemories();
  }, [fetchMemories, setFilters]);

  const generateSummary = async () => {
    if (!summaryRange) return;
    setLoadingSummary(true);
    try {
      const result = await apiGet<{ summary: string; count: number }>(`/memories/summary?date_from=${summaryRange.from}&date_to=${summaryRange.to}`);
      setSummary(result.summary);
      setSummaryVisible(true);
    } catch {}
    setLoadingSummary(false);
  };

  const filtered = useMemo(() => {
    let result = memories;
    if (macroCat !== "all") result = result.filter((memory) => (memory.tags ?? []).includes(macroCat));
    if (activeTag) result = result.filter((memory) => (memory.tags ?? []).includes(activeTag));
    return result;
  }, [activeTag, macroCat, memories]);

  const grouped = groupByDay(filtered);

  return (
    <ScreenShell>
      <ScreenHeader
        title="Journal"
        subtitle="Timeline memoria più compatta, con card leggibili, filtri rapidi e pannello transcript coerente col resto dell'app."
        right={<Pill label={macroCat === "all" ? "All Streams" : macroCat} tone="tertiary" />}
      />

      <FlatList
        data={grouped}
        keyExtractor={(group) => group.date}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadWithPeriod(selectedDate, period)} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" }}>
                {MACRO_CATS.map((cat) => (
                  <Pill key={cat.key} label={cat.label} active={macroCat === cat.key} onPress={() => { setMacroCat(cat.key); setActiveTag(null); }} tone="secondary" />
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable onPress={() => setCalendarOpen(!calendarOpen)} hitSlop={8}>
                  <View style={{ backgroundColor: Colors.surface3, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.ghostBorder }}>
                    <Text style={{ color: Colors.primary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 0.8, textTransform: "uppercase" }}>
                      📅 {calendarOpen ? "↑" : "↓"}
                    </Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => setSearchOpen(!searchOpen)} hitSlop={8}>
                  <View style={{ backgroundColor: Colors.surface3, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.ghostBorder }}>
                    <Text style={{ color: Colors.primary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 0.8, textTransform: "uppercase" }}>
                      🔍 {searchOpen ? "↑" : "↓"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {calendarOpen && (
              <View style={{ gap: 12, marginBottom: 12 }}>
                <WeekStrip
                  selectedDate={selectedDate}
                  activeDates={activeDates}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setActiveTag(null);
                    setTagSearch("");
                    loadWithPeriod(date, period);
                  }}
                  period={period}
                  onPeriodChange={(nextPeriod) => {
                    setPeriod(nextPeriod);
                    setActiveTag(null);
                    loadWithPeriod(selectedDate, nextPeriod);
                  }}
                  showPeriod
                />
                {summaryRange ? (
                  <GlassCard style={{ marginBottom: 0 }}>
                    {summaryVisible ? (
                      <>
                        <Eyebrow text={`Analysis / ${period}`} tone="secondary" />
                        <Text style={{ color: Colors.textPrimary, fontSize: 15, lineHeight: 24, fontFamily: Fonts.bodyRegular }}>{summary}</Text>
                      </>
                    ) : (
                      <Pressable onPress={generateSummary} disabled={loadingSummary}>
                        {loadingSummary ? (
                          <ActivityIndicator color={Colors.primary} />
                        ) : (
                          <Text style={{ color: Colors.primary, fontFamily: Fonts.headlineBold, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>
                            Generate {period} analysis
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </GlassCard>
                ) : null}
              </View>
            )}

            {searchOpen && (
              <GlassCard style={{ marginBottom: 12 }}>
                <TextInput
                  value={activeTag ? `#${activeTag}` : tagSearch}
                  onChangeText={(value) => {
                    if (activeTag) {
                      setActiveTag(null);
                      setTagSearch(value.replace(/^#/, ""));
                    } else {
                      setTagSearch(value.replace(/^#/, ""));
                    }
                  }}
                  placeholder="Search tag..."
                  placeholderTextColor={Colors.textMuted}
                  style={{
                    backgroundColor: Colors.surface,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: Colors.ghostBorder,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: activeTag ? Colors.primary : Colors.textPrimary,
                    fontFamily: Fonts.bodyRegular,
                  }}
                />
                {tagSuggestions.length > 0 ? (
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {tagSuggestions.map((tag) => (
                      <Pill key={tag} label={`#${tag}`} onPress={() => setActiveTag(tag)} tone="tertiary" />
                    ))}
                  </View>
                ) : null}
              </GlassCard>
            )}
          </>
        }
        renderItem={({ item: group }) => (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10 }}>
              {formatDate(group.date)}
            </Text>
            {group.items.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                activeTag={activeTag}
                onTagPress={(tag) => setActiveTag((current) => (current === tag ? null : tag))}
                onDelete={() => {
                  Alert.alert("Elimina memoria", "Sicuro?", [
                    { text: "Annulla", style: "cancel" },
                    { text: "Elimina", style: "destructive", onPress: () => deleteMemory(memory.id) },
                  ]);
                }}
                onUpdateTags={(tags) => updateTags(memory.id, tags)}
              />
            ))}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <GlassCard accent>
              <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold, marginBottom: 10 }}>
                Nessuna memoria nel filtro attuale.
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 24, fontFamily: Fonts.bodyRegular }}>
                Prova un altro periodo, rimuovi il filtro tag oppure aggiungi nuove memorie dalla chat.
              </Text>
            </GlassCard>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </ScreenShell>
  );
}
