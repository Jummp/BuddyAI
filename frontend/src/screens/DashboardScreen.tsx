import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../constants/colors";
import { useHabitStore } from "../store/habitStore";
import { apiGet } from "../services/api";
import WeekStrip from "../components/WeekStrip";

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateLabel(iso: string): string {
  const today = isoDate(new Date());
  if (iso === today) return "Oggi";
  const yesterday = isoDate(new Date(Date.now() - 86400000));
  if (iso === yesterday) return "Ieri";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}

type AnalysisPeriod = "week" | "2weeks" | "month" | "2months";

const PERIOD_LABELS: Record<AnalysisPeriod, string> = {
  week: "Sett",
  "2weeks": "2 Sett",
  month: "Mese",
  "2months": "2 Mesi",
};

const PERIOD_DAYS: Record<AnalysisPeriod, number> = {
  week: 7,
  "2weeks": 14,
  month: 30,
  "2months": 60,
};

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: Colors.surface2,
      borderRadius: 12,
      padding: 10,
      alignItems: "center",
    }}>
      <Text style={{ color: Colors.textSecondary, fontSize: 11, marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{value}</Text>
      {sub ? <Text style={{ color: Colors.textSecondary, fontSize: 11, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.min(pct, 1);
  return (
    <View style={{ height: 4, backgroundColor: Colors.surface2, borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
      <View style={{ width: `${Math.round(clamped * 100)}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function HabitChip({ habit }: { habit: any }) {
  const pct = habit.target > 0 ? habit.weekly_total / habit.target : 0;
  let color = Colors.accent;
  let label = `${Math.round(pct * 100)}%`;

  if (habit.habit_type === "limit") {
    if (pct > 1) { color = Colors.error; label = "SUPERATO"; }
    else if (pct > 0.7) { color = Colors.warning; label = "ATTENZIONE"; }
    else { color = Colors.accent; }
  } else {
    if (pct < 0.6) { color = Colors.textSecondary; label = "BASSO"; }
  }

  return (
    <View style={{
      backgroundColor: Colors.surface,
      borderRadius: 12, padding: 12, marginRight: 8, minWidth: 90,
      borderWidth: 1, borderColor: color, alignItems: "center",
    }}>
      <Text style={{ color: Colors.textPrimary, fontWeight: "600", fontSize: 13 }}>{habit.name}</Text>
      <Text style={{ color, fontSize: 12, marginTop: 4 }}>{label}</Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>
        {habit.weekly_total}/{habit.target}{habit.unit}
      </Text>
    </View>
  );
}

type NutritionStats = {
  avgKcal: number;
  avgProt: number;
  avgCarbs: number;
  avgFat: number;
  daysLogged: number;
  totalDays: number;
};

type TrainingStats = {
  daysCompleted: number;
  totalDays: number;
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { habits, fetchHabits } = useHabitStore();

  const todayStr = isoDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [trainingCompleted, setTrainingCompleted] = useState(false);
  const [nutritionToday, setNutritionToday] = useState<any>(null);
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Analysis state
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("week");
  const [nutritionStats, setNutritionStats] = useState<NutritionStats | null>(null);
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const loadForDate = useCallback(async (date: string) => {
    try {
      const [t, logs] = await Promise.all([
        apiGet<{ completed: boolean }>(`/training/status?date=${date}`),
        apiGet<any[]>(`/nutrition/logs?date_from=${date}&date_to=${date}`),
      ]);
      setTrainingCompleted(t.completed);
      if (logs.length > 0) {
        const kcal = Math.round(logs.reduce((s, l) => s + (l.nutrients?.calories_kcal ?? 0), 0));
        const prot = Math.round(logs.reduce((s, l) => s + (l.nutrients?.protein_g ?? 0), 0));
        const carbs = Math.round(logs.reduce((s, l) => s + (l.nutrients?.carbs_g ?? 0), 0));
        const fat = Math.round(logs.reduce((s, l) => s + (l.nutrients?.fat_g ?? 0), 0));
        setNutritionToday({ kcal, prot, carbs, fat });
      } else {
        setNutritionToday(null);
      }
    } catch {}
  }, []);

  const loadActiveDates = useCallback(async () => {
    const from = isoDate(new Date(Date.now() - 30 * 86400000));
    try {
      const logs = await apiGet<any[]>(`/nutrition/logs?date_from=${from}&date_to=${todayStr}`);
      const dates = Array.from(new Set(logs.map((l: any) => l.date)));
      setActiveDates(dates);
    } catch {}
  }, []);

  const loadAnalysis = useCallback(async (period: AnalysisPeriod) => {
    setAnalysisLoading(true);
    const days = PERIOD_DAYS[period];
    const from = isoDate(addDays(new Date(), -days + 1));
    const to = todayStr;
    try {
      const [nutLogs, trainLogs] = await Promise.all([
        apiGet<any[]>(`/nutrition/logs?date_from=${from}&date_to=${to}`),
        apiGet<any[]>(`/training/logs?date_from=${from}&date_to=${to}`),
      ]);

      // Nutrition stats — group by day, then average
      const byDay: Record<string, { kcal: number; prot: number; carbs: number; fat: number }> = {};
      for (const l of nutLogs) {
        const day = l.date;
        if (!byDay[day]) byDay[day] = { kcal: 0, prot: 0, carbs: 0, fat: 0 };
        byDay[day].kcal += l.nutrients?.calories_kcal ?? 0;
        byDay[day].prot += l.nutrients?.protein_g ?? 0;
        byDay[day].carbs += l.nutrients?.carbs_g ?? 0;
        byDay[day].fat += l.nutrients?.fat_g ?? 0;
      }
      const loggedDays = Object.values(byDay);
      const daysLogged = loggedDays.length;
      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      setNutritionStats({
        avgKcal: avg(loggedDays.map((d) => d.kcal)),
        avgProt: avg(loggedDays.map((d) => d.prot)),
        avgCarbs: avg(loggedDays.map((d) => d.carbs)),
        avgFat: avg(loggedDays.map((d) => d.fat)),
        daysLogged,
        totalDays: days,
      });

      // Training stats
      const completed = trainLogs.filter((l) => l.completed).length;
      setTrainingStats({ daysCompleted: completed, totalDays: days });
    } catch {
      setNutritionStats(null);
      setTrainingStats(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([fetchHabits(), loadForDate(selectedDate), loadActiveDates(), loadAnalysis(analysisPeriod)]);
  }, [selectedDate, analysisPeriod]);

  useEffect(() => { load(); }, []);
  useEffect(() => { loadForDate(selectedDate); }, [selectedDate]);
  useEffect(() => { loadAnalysis(analysisPeriod); }, [analysisPeriod]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const oggi = new Date();
  const GIORNI = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];

  const trainPct = trainingStats ? trainingStats.daysCompleted / trainingStats.totalDays : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.black }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 }}>
        <Text style={{ color: Colors.textPrimary, fontSize: 24, fontWeight: "700" }}>
          Buongiorno, Jump
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 2 }}>
          {GIORNI[oggi.getDay()]} {oggi.getDate()} {MESI[oggi.getMonth()]}
        </Text>
      </View>

      {/* Week strip */}
      <WeekStrip
        selectedDate={selectedDate}
        activeDates={activeDates}
        onSelectDate={setSelectedDate}
        showPeriod={false}
      />

      {/* Date label */}
      {selectedDate !== todayStr && (
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: "600" }}>
            {formatDateLabel(selectedDate)}
          </Text>
        </View>
      )}

      {/* Training card */}
      <Pressable
        onPress={() => navigation.navigate("TrainingDetail")}
        style={({ pressed }) => ({
          marginHorizontal: 20,
          backgroundColor: Colors.surface,
          borderRadius: 16, padding: 16, marginBottom: 16,
          borderWidth: 1,
          borderColor: trainingCompleted ? Colors.accent : Colors.primary,
          opacity: pressed ? 0.8 : 1,
        })}
        accessibilityRole="button"
      >
        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 4 }}>
          🏋 Allenamento {formatDateLabel(selectedDate).toLowerCase()}
        </Text>
        <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: "600" }}>
          {trainingCompleted ? "✓ Completato" : "Apri il blocco →"}
        </Text>
      </Pressable>

      {/* Habits */}
      <View style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 10 }}>
          <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "600" }}>Habit settimana</Text>
          <Pressable onPress={() => navigation.navigate("HabitList")} accessibilityRole="button">
            <Text style={{ color: Colors.primary, fontSize: 14 }}>Vedi tutte →</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
          {habits.length === 0
            ? <Text style={{ color: Colors.textSecondary }}>Nessuna habit configurata</Text>
            : habits.map((h) => <HabitChip key={h.id} habit={h} />)
          }
        </ScrollView>
      </View>

      {/* Nutrition */}
      <Pressable
        onPress={() => navigation.navigate("Nutrition")}
        style={({ pressed }) => ({
          marginHorizontal: 20,
          backgroundColor: Colors.surface,
          borderRadius: 16, padding: 16,
          opacity: pressed ? 0.8 : 1,
        })}
        accessibilityRole="button"
      >
        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 8 }}>
          🥗 Nutrizione {formatDateLabel(selectedDate).toLowerCase()}
        </Text>
        {nutritionToday ? (
          <>
            <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
              {nutritionToday.kcal} kcal
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { label: "Proteine", val: nutritionToday.prot, unit: "g" },
                { label: "Carbs", val: nutritionToday.carbs, unit: "g" },
                { label: "Grassi", val: nutritionToday.fat, unit: "g" },
              ].map(({ label, val, unit }) => (
                <View key={label} style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, padding: 8, alignItems: "center" }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>{label}</Text>
                  <Text style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{val}{unit}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={{ color: Colors.textSecondary }}>Nessun pasto loggato</Text>
        )}
      </Pressable>

      {/* ── ANALISI ── */}
      <View style={{ marginHorizontal: 20, marginTop: 24 }}>
        <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: 12 }}>
          Analisi periodo
        </Text>

        {/* Period pills */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {(Object.keys(PERIOD_LABELS) as AnalysisPeriod[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setAnalysisPeriod(p)}
              style={{
                backgroundColor: analysisPeriod === p ? Colors.primary : Colors.surface,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 6,
              }}
              accessibilityRole="button"
            >
              <Text style={{
                color: analysisPeriod === p ? Colors.black : Colors.textSecondary,
                fontSize: 13, fontWeight: "600",
              }}>
                {PERIOD_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </View>

        {analysisLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <>
            {/* Allenamento recap */}
            <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 10 }}>🏋 Allenamento</Text>
              {trainingStats ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "800" }}>
                      {trainingStats.daysCompleted}
                    </Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>
                      / {trainingStats.totalDays} giorni
                    </Text>
                    <Text style={{ color: trainPct >= 0.7 ? Colors.accent : trainPct >= 0.4 ? Colors.warning : Colors.error, fontSize: 14, fontWeight: "700", marginLeft: "auto" }}>
                      {Math.round(trainPct * 100)}%
                    </Text>
                  </View>
                  <MiniBar pct={trainPct} color={trainPct >= 0.7 ? Colors.accent : trainPct >= 0.4 ? Colors.warning : Colors.error} />
                </>
              ) : (
                <Text style={{ color: Colors.textSecondary }}>Nessun dato</Text>
              )}
            </View>

            {/* Nutrizione recap */}
            <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16 }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 10 }}>
                🥗 Nutrizione media/giorno
                {nutritionStats ? (
                  <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
                    {" "}({nutritionStats.daysLogged}/{nutritionStats.totalDays} giorni loggati)
                  </Text>
                ) : null}
              </Text>
              {nutritionStats && nutritionStats.daysLogged > 0 ? (
                <>
                  <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "800", marginBottom: 10 }}>
                    {nutritionStats.avgKcal} <Text style={{ fontSize: 14, fontWeight: "400", color: Colors.textSecondary }}>kcal</Text>
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <StatBox label="Proteine" value={`${nutritionStats.avgProt}g`} />
                    <StatBox label="Carbs" value={`${nutritionStats.avgCarbs}g`} />
                    <StatBox label="Grassi" value={`${nutritionStats.avgFat}g`} />
                  </View>
                </>
              ) : (
                <Text style={{ color: Colors.textSecondary }}>Nessun dato nel periodo</Text>
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
