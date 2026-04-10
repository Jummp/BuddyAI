import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/colors";
import { apiGet, apiPut } from "../services/api";

type TokenStats = {
  total_input: number;
  total_output: number;
  total_calls: number;
  cost_usd: number;
  by_model: { model: string; input: number; output: number; calls: number; cost_usd: number }[];
};

const TOKEN_PERIODS = [
  { key: "today",  label: "Oggi" },
  { key: "week",   label: "Settimana" },
  { key: "month",  label: "Mese" },
] as const;
type TokenPeriod = typeof TOKEN_PERIODS[number]["key"];

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }

function periodRange(p: TokenPeriod): { from: string; to: string } {
  const today = isoDate(new Date());
  if (p === "today") return { from: today, to: today };
  if (p === "week") {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return { from: isoDate(d), to: today };
  }
  const d = new Date(); d.setDate(d.getDate() - 29);
  return { from: isoDate(d), to: today };
}

function shortModel(m: string) {
  if (m.includes("sonnet")) return "Sonnet";
  if (m.includes("haiku")) return "Haiku";
  return m;
}

const DIET_TYPES = ["Omnivore", "Vegetariano", "Vegano", "Keto", "Paleo", "Mediterranea"];

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

function Section({ title }: { title: string }) {
  return (
    <Text style={{
      color: Colors.textSecondary, fontSize: 12, fontWeight: "700",
      marginTop: 28, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1,
    }}>
      {title}
    </Text>
  );
}

function Field({
  label, value, onChange, keyboardType = "default", editable = true, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: any; editable?: boolean; hint?: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 5 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        editable={editable}
        style={{
          backgroundColor: editable ? Colors.surface : Colors.surface2,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: editable ? Colors.textPrimary : Colors.textSecondary,
          fontSize: 15,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      />
      {hint && <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 4 }}>{hint}</Text>}
    </View>
  );
}

export default function ImpostazioniScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Nutrition plan
  const [dietType, setDietType] = useState("Omnivore");
  const [allergies, setAllergies] = useState("");
  const [calories, setCalories] = useState("2000");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("200");
  const [fat, setFat] = useState("70");
  const [notes, setNotes] = useState("");

  // User settings
  const [checkinTime, setCheckinTime] = useState("08:00");
  const [trainingTime, setTrainingTime] = useState("09:00");

  // Token tracking
  const [tokenPeriod, setTokenPeriod] = useState<TokenPeriod>("today");
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);

  const loadTokenStats = useCallback(async (p: TokenPeriod) => {
    setLoadingTokens(true);
    try {
      const { from, to } = periodRange(p);
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
          apiGet<UserSettings>("/settings").catch(() => null),
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
  }, []);

  const saveAll = async () => {
    setSaving(true);
    try {
      await Promise.all([
        apiPut("/nutrition/plan", {
          diet_type: dietType,
          allergies: allergies.split(",").map((s) => s.trim()).filter(Boolean),
          targets: {
            calories_kcal: parseInt(calories) || 2000,
            protein_g: parseInt(protein) || 150,
            carbs_g: parseInt(carbs) || 200,
            fat_g: parseInt(fat) || 70,
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
      <View style={{ flex: 1, backgroundColor: Colors.black, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.black }} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
        <Text style={{ color: Colors.textPrimary, fontSize: 24, fontWeight: "700", marginBottom: 4 }}>
          Impostazioni
        </Text>

        {/* Notifiche */}
        <Section title="Notifiche" />
        <Field
          label="Check-in mattutino (HH:MM)"
          value={checkinTime}
          onChange={setCheckinTime}
          hint="Formato 08:00 — riavvia backend per applicare"
        />
        <Field
          label="Reminder allenamento (HH:MM)"
          value={trainingTime}
          onChange={setTrainingTime}
          hint="Formato 09:00 — riavvia backend per applicare"
        />

        {/* Dieta */}
        <Section title="Profilo nutrizionale" />

        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 8 }}>Tipo di dieta</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {DIET_TYPES.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDietType(d)}
                style={{
                  backgroundColor: dietType === d ? Colors.primary : Colors.surface,
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text style={{
                  color: dietType === d ? Colors.black : Colors.textSecondary,
                  fontWeight: "600", fontSize: 14,
                }}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Field
          label="Allergie / intolleranze (separate da virgola)"
          value={allergies}
          onChange={setAllergies}
        />
        <Field label="Target calorie (kcal/giorno)" value={calories} onChange={setCalories} keyboardType="numeric" />
        <Field label="Proteine target (g/giorno)" value={protein} onChange={setProtein} keyboardType="numeric" />
        <Field label="Carboidrati target (g/giorno)" value={carbs} onChange={setCarbs} keyboardType="numeric" />
        <Field label="Grassi target (g/giorno)" value={fat} onChange={setFat} keyboardType="numeric" />
        <Field label="Note aggiuntive" value={notes} onChange={setNotes} />

        {/* Token tracking */}
        <Section title="Token & Costi AI" />
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
          {TOKEN_PERIODS.map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => { setTokenPeriod(key); loadTokenStats(key); }}
              style={{
                backgroundColor: tokenPeriod === key ? Colors.primary : Colors.surface,
                borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
              }}
            >
              <Text style={{ color: tokenPeriod === key ? Colors.black : Colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loadingTokens ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />
        ) : tokenStats ? (
          <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 12 }}>
            {/* Total */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>Costo stimato</Text>
                <Text style={{ color: Colors.textPrimary, fontSize: 24, fontWeight: "800" }}>
                  ${tokenStats.cost_usd.toFixed(4)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{tokenStats.total_calls} chiamate</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
                  {(tokenStats.total_input + tokenStats.total_output).toLocaleString()} tok totali
                </Text>
              </View>
            </View>

            {/* Per model */}
            {tokenStats.by_model.map((m) => (
              <View key={m.model} style={{ backgroundColor: Colors.surface2, borderRadius: 10, padding: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: Colors.textPrimary, fontSize: 13, fontWeight: "600" }}>{shortModel(m.model)}</Text>
                  <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: "700" }}>${m.cost_usd.toFixed(4)}</Text>
                </View>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
                  {m.calls} chiamate · ↑{m.input.toLocaleString()} ↓{m.output.toLocaleString()} tok
                </Text>
              </View>
            ))}

            {tokenStats.by_model.length === 0 && (
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Nessun dato nel periodo</Text>
            )}
          </View>
        ) : null}

        {/* App info */}
        <Section title="App" />
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 }}>
          <Text style={{ color: Colors.textPrimary, fontSize: 15 }}>Versione</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 15 }}>0.2.0</Text>
        </View>

        <Pressable
          onPress={saveAll}
          disabled={saving}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            borderRadius: 14,
            padding: 16,
            alignItems: "center",
            marginTop: 24,
            opacity: pressed || saving ? 0.7 : 1,
          })}
          accessibilityRole="button"
        >
          <Text style={{ color: Colors.black, fontWeight: "700", fontSize: 16 }}>
            {saving ? "Salvo..." : "Salva impostazioni"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
