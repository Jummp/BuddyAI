import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { apiDelete, apiGet, apiPatch } from "../services/api";
import { AccentButton, Eyebrow, FieldLabel, GlassCard, Pill, ScreenHeader, ScreenShell } from "../components/ui";

type NutritionLog = {
  id: string;
  date: string;
  meal_description: string;
  nutrients: {
    calories_kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    fiber_g?: number;
    iron_mg?: number;
    calcium_mg?: number;
    vitamin_d_ug?: number;
    sodium_mg?: number;
    vitamin_b12_ug?: number;
    magnesium_mg?: number;
    potassium_mg?: number;
    zinc_mg?: number;
    vitamin_c_mg?: number;
    vitamin_a_ug?: number;
    folate_ug?: number;
  };
  created_at: string;
};

type Plan = {
  targets?: {
    calories_kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  };
};

function MacroLine({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ color: Colors.textSecondary, fontSize: 12, fontFamily: Fonts.headlineBold, letterSpacing: 1.1, textTransform: "uppercase" }}>
          {label}
        </Text>
        <Text style={{ color, fontSize: 12, fontFamily: Fonts.monoMedium }}>
          {value}/{target}g
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: 999, backgroundColor: Colors.surface3, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

function EditLogModal({
  log,
  onClose,
  onSave,
}: {
  log: NutritionLog;
  onClose: () => void;
  onSave: (id: string, description: string, nutrients: NutritionLog["nutrients"]) => Promise<void>;
}) {
  const [desc, setDesc] = useState(log.meal_description);
  const [kcal, setKcal] = useState(String(Math.round(log.nutrients.calories_kcal ?? 0)));
  const [prot, setProt] = useState(String(Math.round(log.nutrients.protein_g ?? 0)));
  const [carbs, setCarbs] = useState(String(Math.round(log.nutrients.carbs_g ?? 0)));
  const [fat, setFat] = useState(String(Math.round(log.nutrients.fat_g ?? 0)));
  const [iron, setIron] = useState(String(Math.round(log.nutrients.iron_mg ?? 0)));
  const [calcium, setCalcium] = useState(String(Math.round(log.nutrients.calcium_mg ?? 0)));
  const [vitaminD, setVitaminD] = useState(String(Math.round(log.nutrients.vitamin_d_ug ?? 0)));
  const [sodium, setSodium] = useState(String(Math.round(log.nutrients.sodium_mg ?? 0)));
  const [b12, setB12] = useState(String(Math.round(log.nutrients.vitamin_b12_ug ?? 0)));
  const [magnesium, setMagnesium] = useState(String(Math.round(log.nutrients.magnesium_mg ?? 0)));
  const [potassium, setPotassium] = useState(String(Math.round(log.nutrients.potassium_mg ?? 0)));
  const [zinc, setZinc] = useState(String(Math.round(log.nutrients.zinc_mg ?? 0)));
  const [vitaminC, setVitaminC] = useState(String(Math.round(log.nutrients.vitamin_c_mg ?? 0)));
  const [vitaminA, setVitaminA] = useState(String(Math.round(log.nutrients.vitamin_a_ug ?? 0)));
  const [folate, setFolate] = useState(String(Math.round(log.nutrients.folate_ug ?? 0)));
  const [saving, setSaving] = useState(false);

  const inputStyle = {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontFamily: Fonts.bodyRegular,
    marginBottom: 12,
  } as const;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(log.id, desc.trim() || log.meal_description, {
        ...log.nutrients,
        calories_kcal: Number(kcal) || 0,
        protein_g: Number(prot) || 0,
        carbs_g: Number(carbs) || 0,
        fat_g: Number(fat) || 0,
        iron_mg: Number(iron) || 0,
        calcium_mg: Number(calcium) || 0,
        vitamin_d_ug: Number(vitaminD) || 0,
        sodium_mg: Number(sodium) || 0,
        vitamin_b12_ug: Number(b12) || 0,
        magnesium_mg: Number(magnesium) || 0,
        potassium_mg: Number(potassium) || 0,
        zinc_mg: Number(zinc) || 0,
        vitamin_c_mg: Number(vitaminC) || 0,
        vitamin_a_ug: Number(vitaminA) || 0,
        folate_ug: Number(folate) || 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.82)" }}>
        <View style={{ backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22 }}>
          <Eyebrow text="Nutrition Log Editor" tone="secondary" />
          <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold, marginBottom: 16 }}>
            Edit meal
          </Text>

          <FieldLabel text="Description" />
          <TextInput value={desc} onChangeText={setDesc} multiline style={[inputStyle, { minHeight: 72 }]} placeholderTextColor={Colors.textMuted} />

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "Kcal", value: kcal, setValue: setKcal },
              { label: "Protein (g)", value: prot, setValue: setProt },
              { label: "Carbs (g)", value: carbs, setValue: setCarbs },
              { label: "Fat (g)", value: fat, setValue: setFat },
              { label: "Iron (mg)", value: iron, setValue: setIron },
              { label: "Calcium (mg)", value: calcium, setValue: setCalcium },
              { label: "Vit D (μg)", value: vitaminD, setValue: setVitaminD },
              { label: "Sodium (mg)", value: sodium, setValue: setSodium },
              { label: "B12 (μg)", value: b12, setValue: setB12 },
              { label: "Magnesium (mg)", value: magnesium, setValue: setMagnesium },
              { label: "Potassium (mg)", value: potassium, setValue: setPotassium },
              { label: "Zinc (mg)", value: zinc, setValue: setZinc },
              { label: "Vit C (mg)", value: vitaminC, setValue: setVitaminC },
              { label: "Vit A (μg)", value: vitaminA, setValue: setVitaminA },
              { label: "Folate (μg)", value: folate, setValue: setFolate },
            ].map((field) => (
              <View key={field.label} style={{ flexBasis: "48%" }}>
                <FieldLabel text={field.label} />
                <TextInput value={field.value} onChangeText={field.setValue} keyboardType="numeric" style={inputStyle} placeholderTextColor={Colors.textMuted} />
              </View>
            ))}
          </View>

          <AccentButton label={saving ? "Saving..." : "Save Meal"} onPress={save} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

export default function NutritionScreen() {
  const navigation = useNavigation<any>();
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [editLog, setEditLog] = useState<NutritionLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(true);

  const today = new Date().toISOString().split("T")[0];

  const load = async () => {
    try {
      const [logsData, planData] = await Promise.all([
        apiGet<NutritionLog[]>(`/nutrition/logs?date_from=${today}`),
        apiGet<Plan | null>("/nutrition/plan").catch(() => null),
      ]);
      setLogs(logsData);
      setPlan(planData);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [today])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const deleteLog = (id: string) => {
    Alert.alert("Elimina pasto", "Sicuro?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/nutrition/logs/${id}`);
            setLogs((prev) => prev.filter((log) => log.id !== id));
          } catch (e: any) {
            Alert.alert("Errore", e.message);
          }
        },
      },
    ]);
  };

  const saveEdit = async (id: string, description: string, nutrients: NutritionLog["nutrients"]) => {
    try {
      const updated = await apiPatch<NutritionLog>(`/nutrition/logs/${id}`, { meal_description: description, nutrients });
      setLogs((prev) => prev.map((log) => (log.id === id ? { ...log, ...updated } : log)));
    } catch (e: any) {
      Alert.alert("Errore", e.message);
      throw e;
    }
  };

  const targets = plan?.targets ?? { calories_kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 };
  const totalKcal = Math.round(logs.reduce((sum, log) => sum + (log.nutrients.calories_kcal ?? 0), 0));
  const totalProt = Math.round(logs.reduce((sum, log) => sum + (log.nutrients.protein_g ?? 0), 0));
  const totalCarbs = Math.round(logs.reduce((sum, log) => sum + (log.nutrients.carbs_g ?? 0), 0));
  const totalFat = Math.round(logs.reduce((sum, log) => sum + (log.nutrients.fat_g ?? 0), 0));

  const getMealSuggestion = async () => {
    setLoadingSugg(true);
    setSuggestion(null);
    try {
      const data = await apiGet<{ suggestion: string }>("/nutrition/suggest");
      setSuggestion(data.suggestion || "Nessun suggerimento disponibile");
    } catch (e: any) {
      setSuggestion(e.message || "Errore nel recupero suggerimenti");
    } finally {
      setLoadingSugg(false);
    }
  };

  return (
    <ScreenShell>
      <ScreenHeader
        title="Nutrition"
        subtitle="Macro overview, meal logs e accesso al fridge in un pannello più vicino al mockup neon-terminal."
        onBack={() => navigation.goBack()}
        right={<Pill label="Fridge" tone="tertiary" onPress={() => navigation.navigate("Fridge")} icon={<MaterialIcons name="inventory-2" size={14} color={Colors.tertiary} />} />}
      />

      {error ? (
        <GlassCard style={{ marginBottom: 12 }}>
          <Text style={{ color: Colors.error, fontFamily: Fonts.bodyMedium }}>{error}</Text>
        </GlassCard>
      ) : null}

      <FlatList
        data={logs}
        keyExtractor={(log) => log.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListHeaderComponent={
          <>
            <GlassCard accent style={{ marginBottom: 14 }}>
              <Eyebrow text="Today's Intake" tone="primary" />
              <Text style={{ color: Colors.textPrimary, fontSize: 36, fontFamily: Fonts.headlineBold }}>
                {totalKcal}
                <Text style={{ color: Colors.textSecondary, fontSize: 18, fontFamily: Fonts.bodyRegular }}> / {targets.calories_kcal ?? 2000} kcal</Text>
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 18, fontFamily: Fonts.bodyRegular }}>
                Snapshot giornaliero leggibile prima dei dettagli: alto contrasto, pochi numeri, subito azione.
              </Text>
              <MacroLine label="Protein" value={totalProt} target={targets.protein_g ?? 150} color={Colors.primary} />
              <MacroLine label="Carbs" value={totalCarbs} target={targets.carbs_g ?? 200} color={Colors.secondary} />
              <MacroLine label="Fat" value={totalFat} target={targets.fat_g ?? 70} color={Colors.tertiary} />
            </GlassCard>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <AccentButton label="Log From Chat" onPress={() => navigation.navigate("Chat")} />
              </View>
              <View style={{ flex: 1 }}>
                <AccentButton label={loadingSugg ? "Thinking..." : "Meal Suggest"} onPress={getMealSuggestion} disabled={loadingSugg} tone="surface" />
              </View>
            </View>

            {suggestion ? (
              <GlassCard style={{ marginBottom: 14 }}>
                <Eyebrow text="PandorAI Suggestion" tone="secondary" />
                <Text style={{ color: Colors.textPrimary, fontSize: 15, lineHeight: 24, fontFamily: Fonts.bodyRegular }}>{suggestion}</Text>
              </GlassCard>
            ) : null}

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 10, fontFamily: Fonts.headlineBold, letterSpacing: 1.4, textTransform: "uppercase" }}>
                Meal Log / Today
              </Text>
              <Pressable onPress={() => setLogsOpen(!logsOpen)}>
                <MaterialIcons name={logsOpen ? "expand-less" : "expand-more"} size={20} color={Colors.primary} />
              </Pressable>
            </View>
          </>
        }
        scrollEnabled={logsOpen}
        scrollEventThrottle={16}
        renderItem={({ item }) => logsOpen ? (
          <Pressable onPress={() => setEditLog(item)} onLongPress={() => deleteLog(item.id)}>
            <GlassCard style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.textPrimary, fontSize: 18, lineHeight: 25, fontFamily: Fonts.bodyMedium }}>
                    {item.meal_description}
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 10, fontFamily: Fonts.monoRegular }}>
                    {new Date(item.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Pill label={`${Math.round(item.nutrients.calories_kcal ?? 0)} kcal`} tone="primary" />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                <Pill label={`P ${Math.round(item.nutrients.protein_g ?? 0)}g`} tone="primary" />
                <Pill label={`C ${Math.round(item.nutrients.carbs_g ?? 0)}g`} tone="secondary" />
                <Pill label={`F ${Math.round(item.nutrients.fat_g ?? 0)}g`} tone="tertiary" />
              </View>
            </GlassCard>
          </Pressable>
        ) : null}
        ListEmptyComponent={
          !refreshing ? (
            <GlassCard accent>
              <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold, marginBottom: 10 }}>
                Nessun pasto loggato.
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 24, marginBottom: 16, fontFamily: Fonts.bodyRegular }}>
                Usa la chat o il meal logger per popolare la giornata. Questa schermata è pronta a diventare il tuo cruscotto nutrizionale principale.
              </Text>
            </GlassCard>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      {editLog ? <EditLogModal log={editLog} onClose={() => setEditLog(null)} onSave={saveEdit} /> : null}
    </ScreenShell>
  );
}
