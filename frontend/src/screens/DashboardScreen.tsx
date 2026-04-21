import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { useHabitStore } from "../store/habitStore";
import { apiGet } from "../services/api";

function isoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
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

function SurfaceCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: Colors.ghostBorder,
        padding: 18,
        shadowColor: Colors.primary,
        shadowOpacity: 0.08,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 0 },
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function StatTile({
  eyebrow,
  title,
  value,
  accentColor,
  progress,
}: {
  eyebrow: string;
  title: string;
  value: string;
  accentColor: string;
  progress: number;
}) {
  return (
    <SurfaceCard style={{ flex: 1, backgroundColor: Colors.surface3 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
        <Text style={{ color: Colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" }}>
          {eyebrow}
        </Text>
        <Text style={{ color: accentColor, fontSize: 12, fontFamily: Fonts.monoMedium }}>{value}</Text>
      </View>
      <Text style={{ color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.headlineBold, marginBottom: 18 }}>
        {title}
      </Text>
      <View style={{ height: 4, borderRadius: 99, backgroundColor: Colors.surface2, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(0, Math.min(progress, 1)) * 100}%`, height: 4, backgroundColor: accentColor }} />
      </View>
    </SurfaceCard>
  );
}

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
  const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>("week");
  const [nutritionStats, setNutritionStats] = useState<NutritionStats | null>(null);
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const weekDays = useMemo(() => {
    const monday = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      return {
        iso: isoDate(date),
        label: date.toLocaleDateString("it-IT", { weekday: "short" }).slice(0, 3).toUpperCase(),
        num: date.getDate(),
      };
    });
  }, []);

  const loadForDate = useCallback(async (date: string) => {
    try {
      const [training, logs] = await Promise.all([
        apiGet<{ completed: boolean }>(`/training/status?date=${date}`),
        apiGet<any[]>(`/nutrition/logs?date_from=${date}&date_to=${date}`),
      ]);
      setTrainingCompleted(training.completed);
      if (logs.length > 0) {
        const kcal = Math.round(logs.reduce((sum, log) => sum + (log.nutrients?.calories_kcal ?? 0), 0));
        const prot = Math.round(logs.reduce((sum, log) => sum + (log.nutrients?.protein_g ?? 0), 0));
        const carbs = Math.round(logs.reduce((sum, log) => sum + (log.nutrients?.carbs_g ?? 0), 0));
        const fat = Math.round(logs.reduce((sum, log) => sum + (log.nutrients?.fat_g ?? 0), 0));
        setNutritionToday({ kcal, prot, carbs, fat });
      } else {
        setNutritionToday(null);
      }
    } catch {
      setNutritionToday(null);
      setTrainingCompleted(false);
    }
  }, []);

  const loadActiveDates = useCallback(async () => {
    const from = isoDate(addDays(new Date(), -30));
    try {
      const logs = await apiGet<any[]>(`/nutrition/logs?date_from=${from}&date_to=${todayStr}`);
      setActiveDates(Array.from(new Set(logs.map((log: any) => log.date))));
    } catch {
      setActiveDates([]);
    }
  }, [todayStr]);

  const loadAnalysis = useCallback(async (period: AnalysisPeriod) => {
    setAnalysisLoading(true);
    const days = PERIOD_DAYS[period];
    const from = isoDate(addDays(new Date(), -days + 1));
    try {
      const [nutritionLogs, trainingLogs] = await Promise.all([
        apiGet<any[]>(`/nutrition/logs?date_from=${from}&date_to=${todayStr}`),
        apiGet<any[]>(`/training/logs?date_from=${from}&date_to=${todayStr}`),
      ]);

      const grouped: Record<string, { kcal: number; prot: number; carbs: number; fat: number }> = {};
      for (const log of nutritionLogs) {
        const day = log.date;
        if (!grouped[day]) grouped[day] = { kcal: 0, prot: 0, carbs: 0, fat: 0 };
        grouped[day].kcal += log.nutrients?.calories_kcal ?? 0;
        grouped[day].prot += log.nutrients?.protein_g ?? 0;
        grouped[day].carbs += log.nutrients?.carbs_g ?? 0;
        grouped[day].fat += log.nutrients?.fat_g ?? 0;
      }
      const loggedDays = Object.values(grouped);
      const avg = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);
      setNutritionStats({
        avgKcal: avg(loggedDays.map((item) => item.kcal)),
        avgProt: avg(loggedDays.map((item) => item.prot)),
        avgCarbs: avg(loggedDays.map((item) => item.carbs)),
        avgFat: avg(loggedDays.map((item) => item.fat)),
        daysLogged: loggedDays.length,
        totalDays: days,
      });

      setTrainingStats({
        daysCompleted: trainingLogs.filter((log) => log.completed).length,
        totalDays: days,
      });
    } catch {
      setNutritionStats(null);
      setTrainingStats(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, [todayStr]);

  const load = useCallback(async () => {
    await Promise.all([fetchHabits(), loadForDate(selectedDate), loadActiveDates(), loadAnalysis(analysisPeriod)]);
  }, [analysisPeriod, fetchHabits, loadActiveDates, loadAnalysis, loadForDate, selectedDate]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadForDate(selectedDate);
  }, [loadForDate, selectedDate]);

  useEffect(() => {
    loadAnalysis(analysisPeriod);
  }, [analysisPeriod, loadAnalysis]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const primaryHabit = habits[0];
  const habitProgress = primaryHabit && primaryHabit.target > 0 ? primaryHabit.weekly_total / primaryHabit.target : 0;
  const trainingRatio = trainingStats ? trainingStats.daysCompleted / Math.max(trainingStats.totalDays, 1) : trainingCompleted ? 1 : 0;
  const nutritionRatio = nutritionToday ? Math.min(nutritionToday.kcal / 2400, 1) : nutritionStats ? Math.min(nutritionStats.avgKcal / 2400, 1) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{
        paddingBottom: 32,
        width: "100%",
        maxWidth: Platform.OS === "web" ? 900 : undefined,
        alignSelf: "center",
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={{ paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: 18 }}>
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: Colors.surface3,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: Colors.ghostBorder,
          }}
        >
          <Text style={{ color: Colors.primary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.6, textTransform: "uppercase" }}>
            System Status: Optimal
          </Text>
        </View>
        <Text style={{ color: Colors.textPrimary, fontSize: 44, lineHeight: 46, fontFamily: Fonts.headlineBold }}>
          Good morning,{"\n"}
          <Text style={{ color: Colors.primaryDark, fontFamily: Fonts.headlineBold }}>Jump.</Text>
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 17, lineHeight: 25, marginTop: 12, maxWidth: 420, fontFamily: Fonts.bodyRegular }}>
          Hai allenamento, log nutrizione e consistenza habits sotto controllo. Usa il pannello qui sotto per entrare in azione.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, marginBottom: 20, gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={() => navigation.navigate("Nutrition")} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ backgroundColor: Colors.surface3, borderRadius: 14, borderWidth: 1, borderColor: Colors.ghostBorder, paddingVertical: 16, paddingHorizontal: 16, alignItems: "center", shadowColor: Colors.secondary, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }}>
              <MaterialIcons name="restaurant" size={28} color={Colors.secondary} />
              <Text style={{ color: Colors.textPrimary, fontSize: 12, fontFamily: Fonts.headlineBold, marginTop: 8, letterSpacing: 1.1, textTransform: "uppercase" }}>Nutrition</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("HabitList")} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ backgroundColor: Colors.surface3, borderRadius: 14, borderWidth: 1, borderColor: Colors.ghostBorder, paddingVertical: 16, paddingHorizontal: 16, alignItems: "center", shadowColor: Colors.primary, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }}>
              <MaterialIcons name="track-changes" size={28} color={Colors.primary} />
              <Text style={{ color: Colors.textPrimary, fontSize: 12, fontFamily: Fonts.headlineBold, marginTop: 8, letterSpacing: 1.1, textTransform: "uppercase" }}>Habits</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("TrainingDetail")} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ backgroundColor: Colors.surface3, borderRadius: 14, borderWidth: 1, borderColor: Colors.ghostBorder, paddingVertical: 16, paddingHorizontal: 16, alignItems: "center", shadowColor: Colors.tertiary, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }}>
              <MaterialIcons name="fitness-center" size={28} color={Colors.tertiary} />
              <Text style={{ color: Colors.textPrimary, fontSize: 12, fontFamily: Fonts.headlineBold, marginTop: 8, letterSpacing: 1.1, textTransform: "uppercase" }}>Training</Text>
            </View>
          </Pressable>
        </View>

        <SurfaceCard>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View>
              <Text style={{ color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.headlineBold }}>Consistency Grid</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 3 }}>
                7-Day Performance Metrics
              </Text>
            </View>
            <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.monoRegular }}>{selectedDate === todayStr ? "oggi" : selectedDate}</Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {weekDays.map((day) => {
              const isSelected = day.iso === selectedDate;
              const hasData = activeDates.includes(day.iso) || day.iso === todayStr;
              return (
                <Pressable key={day.iso} onPress={() => setSelectedDate(day.iso)} style={{ alignItems: "center", flex: 1 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? Colors.primary : hasData ? "rgba(161,255,194,0.16)" : Colors.surface3,
                      borderWidth: 1,
                      borderColor: isSelected ? Colors.primary : "rgba(161,255,194,0.10)",
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: isSelected ? Colors.textPrimaryOnAccent : hasData ? Colors.primary : Colors.textMuted, fontWeight: "700" }}>
                      {hasData ? (isSelected ? "⚡" : "✓") : ""}
                    </Text>
                  </View>
                  <Text style={{ color: isSelected ? Colors.primary : Colors.textSecondary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.1, textTransform: "uppercase" }}>
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SurfaceCard>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 18 }}>
        <Pressable onPress={() => navigation.navigate("TrainingDetail")}>
          <SurfaceCard style={{ padding: 22, borderLeftWidth: 2, borderLeftColor: Colors.primary, overflow: "hidden" }}>
            <View style={{ position: "absolute", right: 12, top: 18, opacity: 0.12 }}>
              <MaterialIcons name="fitness-center" size={120} color={Colors.primary} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <View style={{ backgroundColor: Colors.surface3, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginRight: 10 }}>
                <Text style={{ color: Colors.tertiary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase" }}>
                  Today's Block
                </Text>
              </View>
              <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.monoRegular }}>08:00 — 09:30</Text>
            </View>
            <Text style={{ color: Colors.textPrimary, fontSize: 34, lineHeight: 36, fontFamily: Fonts.headlineBold, maxWidth: "82%", marginBottom: 12 }}>
              {trainingCompleted ? "Sessione completata" : "Neural Strength Induction"}
            </Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 16, lineHeight: 24, maxWidth: "84%", marginBottom: 22, fontFamily: Fonts.bodyRegular }}>
              {trainingCompleted
                ? "Hai già chiuso il blocco selezionato. Puoi rientrare per rivedere gli esercizi o modificare il piano."
                : "Focusing on posterior chain, video cues e correzioni manuali. Apri la sessione e lavora sul blocco attivo."}
            </Text>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: Colors.primary,
                borderRadius: 10,
                paddingHorizontal: 18,
                paddingVertical: 14,
                shadowColor: Colors.primary,
                shadowOpacity: 0.22,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 0 },
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text style={{ color: Colors.textPrimaryOnAccent, fontSize: 13, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase" }}>
                {trainingCompleted ? "Review Session" : "Start Session"}
              </Text>
              <MaterialIcons name="play-arrow" size={18} color={Colors.textPrimaryOnAccent} />
            </View>
          </SurfaceCard>
        </Pressable>

        <SurfaceCard>
          <View style={{ marginBottom: 14 }}>
            <Text style={{ color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.headlineBold }}>Active Habits</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 2 }}>
              Progress & Tracking
            </Text>
          </View>
          {habits.length === 0 ? (
            <Text style={{ color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.bodyRegular, textAlign: "center", paddingVertical: 12 }}>
              No habits yet. Create one in Habits area.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {habits.map((habit) => {
                const progress = habit.target > 0 ? habit.weekly_total / habit.target : 0;
                return (
                  <Pressable key={habit.id} onPress={() => navigation.navigate("HabitDetail", { id: habit.id })}>
                    <View style={{ backgroundColor: Colors.surface3, borderRadius: 12, padding: 12 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.bodyMedium }}>
                            {habit.name}
                          </Text>
                          <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.monoRegular, marginTop: 2 }}>
                            {habit.habit_type === "habit" ? "↑" : "↓"} {habit.weekly_total}/{habit.target} {habit.unit}
                          </Text>
                        </View>
                        <Text style={{ color: Colors.primary, fontSize: 13, fontFamily: Fonts.headlineBold }}>
                          {Math.round(progress * 100)}%
                        </Text>
                      </View>
                      <View style={{ height: 4, borderRadius: 99, backgroundColor: Colors.surface2, overflow: "hidden" }}>
                        <View style={{ width: `${Math.max(0, Math.min(progress, 1)) * 100}%`, height: 4, backgroundColor: Colors.primary }} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </SurfaceCard>

        <Pressable onPress={() => navigation.navigate("Nutrition")}>
          <StatTile
            eyebrow="Nutrition"
            title={nutritionToday ? `${nutritionToday.kcal} kcal` : nutritionStats ? `${nutritionStats.avgKcal} kcal` : "No logs"}
            value={nutritionToday ? `${nutritionToday.prot}g prot` : nutritionStats ? `${nutritionStats.daysLogged}/${nutritionStats.totalDays} d` : "--"}
            accentColor={Colors.secondary}
            progress={nutritionRatio}
          />
        </Pressable>

        <Pressable onPress={() => navigation.getParent()?.navigate("Journal")}>
          <SurfaceCard style={{ backgroundColor: Colors.surface3, flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: "rgba(110,155,255,0.14)",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
              }}
            >
              <Text style={{ color: Colors.tertiary, fontSize: 24 }}>✦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.textPrimary, fontSize: 20, fontFamily: Fonts.headlineBold, marginBottom: 4 }}>Daily Journaling</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 14, lineHeight: 20, fontFamily: Fonts.bodyRegular }}>
                Apri il journal e lascia una memoria veloce, oppure rivedi tag e summary del giorno.
              </Text>
            </View>
            <Text style={{ color: Colors.tertiary, fontSize: 24 }}>→</Text>
          </SurfaceCard>
        </Pressable>

        <SurfaceCard>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Text style={{ color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.headlineBold }}>Analysis Window</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", fontFamily: Fonts.monoRegular }}>
              Live Metrics
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {(Object.keys(PERIOD_LABELS) as AnalysisPeriod[]).map((period) => (
              <Pressable
                key={period}
                onPress={() => setAnalysisPeriod(period)}
                style={{
                  backgroundColor: analysisPeriod === period ? Colors.primary : Colors.surface3,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{
                    color: analysisPeriod === period ? Colors.textPrimaryOnAccent : Colors.textSecondary,
                    fontSize: 12,
                    fontFamily: Fonts.headlineBold,
                  }}
                >
                  {PERIOD_LABELS[period]}
                </Text>
              </Pressable>
            ))}
          </View>

          {analysisLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ backgroundColor: Colors.surface3, borderRadius: 14, padding: 14 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
                  Training
                </Text>
                <Text style={{ color: Colors.textPrimary, fontSize: 28, fontFamily: Fonts.headlineBold }}>
                  {trainingStats ? `${trainingStats.daysCompleted}/${trainingStats.totalDays}` : trainingCompleted ? "1/1" : "0/1"}
                </Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 2, fontFamily: Fonts.bodyRegular }}>giorni completati nel periodo</Text>
                <View style={{ height: 4, borderRadius: 99, backgroundColor: Colors.surface2, marginTop: 12, overflow: "hidden" }}>
                  <View style={{ width: `${trainingRatio * 100}%`, height: 4, backgroundColor: Colors.primary }} />
                </View>
              </View>

              <View style={{ backgroundColor: Colors.surface3, borderRadius: 14, padding: 14 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
                  Nutrition
                </Text>
                <Text style={{ color: Colors.textPrimary, fontSize: 28, fontFamily: Fonts.headlineBold }}>
                  {nutritionStats ? `${nutritionStats.avgKcal} kcal` : nutritionToday ? `${nutritionToday.kcal} kcal` : "0 kcal"}
                </Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 2, fontFamily: Fonts.bodyRegular }}>
                  {nutritionStats ? `${nutritionStats.daysLogged}/${nutritionStats.totalDays} giorni loggati` : "nessun log nel periodo"}
                </Text>
                <View style={{ height: 4, borderRadius: 99, backgroundColor: Colors.surface2, marginTop: 12, overflow: "hidden" }}>
                  <View style={{ width: `${nutritionRatio * 100}%`, height: 4, backgroundColor: Colors.secondary }} />
                </View>
              </View>
            </View>
          )}
        </SurfaceCard>
      </View>
    </ScrollView>
  );
}
