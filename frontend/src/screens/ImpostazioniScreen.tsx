import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { apiGet, apiPut } from "../services/api";
import { AccentButton, FieldLabel, GlassCard, Pill, ScreenHeader, ScreenShell } from "../components/ui";

type TokenStats = {
  total_input: number;
  total_output: number;
  total_calls: number;
  cost_usd: number;
  by_model: { model: string; input: number; output: number; calls: number; cost_usd: number }[];
};

type NutritionPlan = {
  diet_type: string;
  allergies: string[];
  targets: {
    calories_kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  };
  notes: string;
};

type UserSettings = {
  checkin_time: string;
  training_reminder_time: string;
};

const TOKEN_PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
] as const;

type TokenPeriod = typeof TOKEN_PERIODS[number]["key"];

const DIET_TYPES = ["Omnivore", "Vegetariano", "Vegano", "Keto", "Paleo", "Mediterranea"];

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function periodRange(p: TokenPeriod): { from: string; to: string } {
  const today = isoDate(new Date());
  if (p === "today") return { from: today, to: today };
  if (p === "week") {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return { from: isoDate(d), to: today };
  }
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return { from: isoDate(d), to: today };
}

function shortModel(model: string) {
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

export default function ImpostazioniScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dietType, setDietType] = useState("Omnivore");
  const [allergies, setAllergies] = useState("");
  const [calories, setCalories] = useState("2000");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("200");
  const [fat, setFat] = useState("70");
  const [notes, setNotes] = useState("");
  const [checkinTime, setCheckinTime] = useState("08:00");
  const [trainingTime, setTrainingTime] = useState("09:00");
  const [tokenPeriod, setTokenPeriod] = useState<TokenPeriod>("today");
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);

  const inputStyle = {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    marginBottom: 14,
  } as const;

  const loadTokenStats = useCallback(async (period: TokenPeriod) => {
    setLoadingTokens(true);
    try {
      const { from, to } = periodRange(period);
      const data = await apiGet<TokenStats>(`/tokens/stats?date_from=${from}&date_to=${to}`);
      setTokenStats(data);
    } catch {}
    setLoadingTokens(false);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [plan, settings] = await Promise.all([
          apiGet<NutritionPlan | null>("/nutrition/plan").catch(() => null),
          apiGet<UserSettings | null>("/settings").catch(() => null),
        ]);
        if (plan) {
          setDietType(plan.diet_type || "Omnivore");
          setAllergies((plan.allergies || []).join(", "));
          setCalories(String(plan.targets?.calories_kcal ?? 2000));
          setProtein(String(plan.targets?.protein_g ?? 150));
          setCarbs(String(plan.targets?.carbs_g ?? 200));
          setFat(String(plan.targets?.fat_g ?? 70));
          setNotes(plan.notes || "");
        }
        if (settings) {
          setCheckinTime(settings.checkin_time || "08:00");
          setTrainingTime(settings.training_reminder_time || "09:00");
        }
      } catch {}
      setLoading(false);
    };

    load();
    loadTokenStats("today");
  }, [loadTokenStats]);

  const saveAll = async () => {
    setSaving(true);
    try {
      await Promise.all([
        apiPut("/nutrition/plan", {
          diet_type: dietType,
          allergies: allergies.split(",").map((value) => value.trim()).filter(Boolean),
          targets: {
            calories_kcal: parseInt(calories, 10) || 2000,
            protein_g: parseInt(protein, 10) || 150,
            carbs_g: parseInt(carbs, 10) || 200,
            fat_g: parseInt(fat, 10) || 70,
          },
          notes,
        }),
        apiPut("/settings", {
          checkin_time: checkinTime,
          training_reminder_time: trainingTime,
        }),
      ]);
      Alert.alert("Salvato", "Impostazioni aggiornate");
    } catch (e: any) {
      Alert.alert("Errore", e?.message ?? "Impossibile salvare");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScreenShell scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenHeader
          title="Settings"
          subtitle="Config personale, profilo nutrizionale e controllo costi AI dentro una schermata più tecnica e leggibile."
          right={<Pill label="Version 0.2.0" tone="tertiary" />}
        />

        <GlassCard accent style={{ marginBottom: 14 }}>
          <FieldLabel text="Check-in Time" />
          <TextInput value={checkinTime} onChangeText={setCheckinTime} style={inputStyle} />

          <FieldLabel text="Training Reminder" />
          <TextInput value={trainingTime} onChangeText={setTrainingTime} style={inputStyle} />
        </GlassCard>

        <GlassCard style={{ marginBottom: 14 }}>
          <FieldLabel text="Diet Type" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {DIET_TYPES.map((diet) => (
                <Pill key={diet} label={diet} active={dietType === diet} onPress={() => setDietType(diet)} tone="secondary" />
              ))}
            </View>
          </ScrollView>

          <FieldLabel text="Allergies / Intolerances" />
          <TextInput value={allergies} onChangeText={setAllergies} style={inputStyle} />

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Calories" />
              <TextInput value={calories} onChangeText={setCalories} keyboardType="numeric" style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Protein" />
              <TextInput value={protein} onChangeText={setProtein} keyboardType="numeric" style={inputStyle} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Carbs" />
              <TextInput value={carbs} onChangeText={setCarbs} keyboardType="numeric" style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Fat" />
              <TextInput value={fat} onChangeText={setFat} keyboardType="numeric" style={inputStyle} />
            </View>
          </View>

          <FieldLabel text="Notes" />
          <TextInput value={notes} onChangeText={setNotes} multiline style={[inputStyle, { minHeight: 88 }]} />
        </GlassCard>

        <GlassCard style={{ marginBottom: 14 }}>
          <FieldLabel text="AI Token Window" />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {TOKEN_PERIODS.map((period) => (
              <Pill
                key={period.key}
                label={period.label}
                active={tokenPeriod === period.key}
                onPress={() => {
                  setTokenPeriod(period.key);
                  loadTokenStats(period.key);
                }}
                tone="tertiary"
              />
            ))}
          </View>

          {loadingTokens ? (
            <ActivityIndicator color={Colors.primary} />
          ) : tokenStats ? (
            <>
              <Text style={{ color: Colors.textPrimary, fontSize: 34, fontFamily: Fonts.headlineBold }}>
                ${tokenStats.cost_usd.toFixed(4)}
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, marginTop: 6, marginBottom: 14, fontFamily: Fonts.bodyRegular }}>
                {tokenStats.total_calls} chiamate · {(tokenStats.total_input + tokenStats.total_output).toLocaleString()} token totali
              </Text>
              <View style={{ gap: 10 }}>
                {tokenStats.by_model.length === 0 ? (
                  <Text style={{ color: Colors.textSecondary, fontFamily: Fonts.bodyRegular }}>Nessun dato nel periodo.</Text>
                ) : (
                  tokenStats.by_model.map((model) => (
                    <View key={model.model} style={{ backgroundColor: Colors.surface3, borderRadius: 14, padding: 14 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ color: Colors.textPrimary, fontFamily: Fonts.headlineBold }}>{shortModel(model.model)}</Text>
                        <Text style={{ color: Colors.primary, fontFamily: Fonts.monoMedium }}>${model.cost_usd.toFixed(4)}</Text>
                      </View>
                      <Text style={{ color: Colors.textSecondary, fontSize: 13, fontFamily: Fonts.bodyRegular }}>
                        {model.calls} calls · ↑{model.input.toLocaleString()} ↓{model.output.toLocaleString()}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}
        </GlassCard>

        <AccentButton label={saving ? "Saving..." : "Save Settings"} onPress={saveAll} disabled={saving} />
      </View>
    </ScreenShell>
  );
}
