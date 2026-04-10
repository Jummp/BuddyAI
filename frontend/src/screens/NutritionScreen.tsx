import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, Pressable, RefreshControl,
  ActivityIndicator, Modal, TextInput, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../constants/colors";
import { apiGet, apiPost, apiDelete, apiPatch } from "../services/api";

type NutritionLog = {
  id: string;
  date: string;
  meal_description: string;
  nutrients: {
    calories_kcal?: number; protein_g?: number;
    carbs_g?: number; fat_g?: number; fiber_g?: number;
  };
  created_at: string;
};

type Plan = {
  targets?: {
    calories_kcal?: number; protein_g?: number;
    carbs_g?: number; fat_g?: number;
  };
};

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: Colors.textPrimary, fontSize: 12, fontWeight: "600" }}>{value}/{target}g</Text>
      </View>
      <View style={{ height: 4, backgroundColor: Colors.surface2, borderRadius: 2 }}>
        <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
      </View>
    </View>
  );
}

function EditLogModal({ log, onClose, onSave }: {
  log: NutritionLog;
  onClose: () => void;
  onSave: (id: string, description: string, nutrients: NutritionLog["nutrients"]) => Promise<void>;
}) {
  const [desc, setDesc] = useState(log.meal_description);
  const [kcal, setKcal] = useState(String(Math.round(log.nutrients.calories_kcal ?? 0)));
  const [prot, setProt] = useState(String(Math.round(log.nutrients.protein_g ?? 0)));
  const [carbs, setCarbs] = useState(String(Math.round(log.nutrients.carbs_g ?? 0)));
  const [fat, setFat] = useState(String(Math.round(log.nutrients.fat_g ?? 0)));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(log.id, desc.trim() || log.meal_description, {
        ...log.nutrients,
        calories_kcal: Number(kcal) || 0,
        protein_g: Number(prot) || 0,
        carbs_g: Number(carbs) || 0,
        fat_g: Number(fat) || 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 15,
    marginBottom: 10,
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: Colors.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: Colors.textPrimary, fontSize: 17, fontWeight: "700" }}>Modifica pasto</Text>
            <Pressable onPress={onClose}><Text style={{ color: Colors.textSecondary, fontSize: 16 }}>✕</Text></Pressable>
          </View>

          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Descrizione</Text>
          <TextInput
            value={desc} onChangeText={setDesc}
            multiline style={[inputStyle, { minHeight: 60 }]}
            placeholderTextColor={Colors.textSecondary}
          />

          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 8 }}>Macros</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            {[
              { label: "kcal", val: kcal, set: setKcal },
              { label: "prot g", val: prot, set: setProt },
              { label: "carbs g", val: carbs, set: setCarbs },
              { label: "fat g", val: fat, set: setFat },
            ].map(({ label, val, set }) => (
              <View key={label} style={{ flex: 1 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 11, marginBottom: 4 }}>{label}</Text>
                <TextInput
                  value={val} onChangeText={set}
                  keyboardType="numeric"
                  style={{ backgroundColor: Colors.surface, borderRadius: 8, padding: 8, color: Colors.textPrimary, fontSize: 14, textAlign: "center" }}
                />
              </View>
            ))}
          </View>

          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: "center",
              opacity: pressed || saving ? 0.7 : 1,
            })}
          >
            <Text style={{ color: Colors.black, fontWeight: "700" }}>{saving ? "Salvo..." : "Salva"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function NutritionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [editLog, setEditLog] = useState<NutritionLog | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const load = async () => {
    try {
      const [logsData, planData] = await Promise.all([
        apiGet<NutritionLog[]>(`/nutrition/logs?date_from=${today}`),
        apiGet<Plan | null>("/nutrition/plan").catch(() => null),
      ]);
      setLogs(logsData);
      setPlan(planData);
    } catch {}
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const deleteLog = (id: string) => {
    Alert.alert("Elimina pasto", "Sicuro?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina", style: "destructive", onPress: async () => {
          try {
            await apiDelete(`/nutrition/logs/${id}`);
            setLogs((prev) => prev.filter((l) => l.id !== id));
          } catch {
            Alert.alert("Errore nell'eliminazione");
          }
        },
      },
    ]);
  };

  const saveEdit = async (id: string, description: string, nutrients: NutritionLog["nutrients"]) => {
    const updated = await apiPatch<NutritionLog>(`/nutrition/logs/${id}`, {
      meal_description: description,
      nutrients,
    });
    setLogs((prev) => prev.map((l) => l.id === id ? { ...l, ...updated } : l));
  };

  const targets = plan?.targets ?? { calories_kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 };
  const totalKcal = Math.round(logs.reduce((s, l) => s + (l.nutrients.calories_kcal ?? 0), 0));
  const totalProt = Math.round(logs.reduce((s, l) => s + (l.nutrients.protein_g ?? 0), 0));
  const totalCarbs = Math.round(logs.reduce((s, l) => s + (l.nutrients.carbs_g ?? 0), 0));
  const totalFat = Math.round(logs.reduce((s, l) => s + (l.nutrients.fat_g ?? 0), 0));
  const kcalPct = Math.min(totalKcal / (targets.calories_kcal ?? 2000), 1);

  const getMealSuggestion = async () => {
    setLoadingSugg(true);
    setSuggestion(null);
    try {
      const data = await apiGet<{ suggestion: string }>("/nutrition/suggest");
      setSuggestion(data.suggestion || "Nessun suggerimento disponibile");
    } catch {
      setSuggestion("Errore nel recupero suggerimenti");
    } finally {
      setLoadingSugg(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.black }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center" }}>
        <Pressable onPress={() => navigation.goBack()} style={{ marginRight: 12 }} accessibilityRole="button">
          <Text style={{ color: Colors.primary, fontSize: 18 }}>←</Text>
        </Pressable>
        <Text style={{ color: Colors.textPrimary, fontSize: 22, fontWeight: "700", flex: 1 }}>Nutrizione</Text>
        <Pressable onPress={() => navigation.navigate("Fridge")} accessibilityRole="button">
          <Text style={{ color: Colors.primary, fontSize: 22 }}>🛒</Text>
        </Pressable>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListHeaderComponent={
          <>
            {/* Kcal overview */}
            <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 4 }}>Oggi</Text>
              <Text style={{ color: Colors.textPrimary, fontSize: 24, fontWeight: "700", marginBottom: 8 }}>
                {totalKcal} <Text style={{ fontSize: 16, fontWeight: "400", color: Colors.textSecondary }}>/ {targets.calories_kcal ?? 2000} kcal</Text>
              </Text>
              <View style={{ height: 6, backgroundColor: Colors.surface2, borderRadius: 3, marginBottom: 16 }}>
                <View style={{ width: `${kcalPct * 100}%`, height: 6, backgroundColor: Colors.primary, borderRadius: 3 }} />
              </View>
              <View style={{ gap: 10 }}>
                <MacroBar label="Proteine" value={totalProt} target={targets.protein_g ?? 150} color={Colors.accent} />
                <MacroBar label="Carboidrati" value={totalCarbs} target={targets.carbs_g ?? 200} color={Colors.primary} />
                <MacroBar label="Grassi" value={totalFat} target={targets.fat_g ?? 70} color={Colors.warning} />
              </View>
            </View>

            {/* CTA */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <Pressable
                onPress={() => navigation.navigate("Chat")}
                style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.primary, borderRadius: 12, padding: 12, alignItems: "center", opacity: pressed ? 0.8 : 1 })}
                accessibilityRole="button"
              >
                <Text style={{ color: Colors.black, fontWeight: "700" }}>+ Log pasto</Text>
              </Pressable>
              <Pressable
                onPress={getMealSuggestion}
                disabled={loadingSugg}
                style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: "center", opacity: pressed || loadingSugg ? 0.7 : 1 })}
                accessibilityRole="button"
              >
                {loadingSugg
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={{ color: Colors.primary, fontWeight: "700" }}>💡 Cosa mangio?</Text>
                }
              </Pressable>
            </View>

            {suggestion && (
              <View style={{ backgroundColor: Colors.surface2, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.primary + "44" }}>
                <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>SUGGERIMENTO PASTO</Text>
                <Text selectable style={{ color: Colors.textPrimary, fontSize: 14, lineHeight: 21 }}>{suggestion}</Text>
                <Pressable onPress={() => setSuggestion(null)} style={{ alignSelf: "flex-end", marginTop: 8 }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>✕ chiudi</Text>
                </Pressable>
              </View>
            )}

            <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Pasti di oggi
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setEditLog(item)}
            onLongPress={() => deleteLog(item.id)}
            style={({ pressed }) => ({
              backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text selectable style={{ color: Colors.textPrimary, fontSize: 15, marginBottom: 4, flex: 1 }}>
                {item.meal_description}
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12, marginLeft: 8 }}>✎</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>~{Math.round(item.nutrients.calories_kcal ?? 0)} kcal</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>P {Math.round(item.nutrients.protein_g ?? 0)}g</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>C {Math.round(item.nutrients.carbs_g ?? 0)}g</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>F {Math.round(item.nutrients.fat_g ?? 0)}g</Text>
            </View>
            <Text style={{ color: Colors.textSecondary, fontSize: 11, marginTop: 4 }}>
              {new Date(item.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !refreshing ? (
            <Text style={{ color: Colors.textSecondary, textAlign: "center", marginTop: 20 }}>Nessun pasto loggato oggi</Text>
          ) : null
        }
      />

      {editLog && (
        <EditLogModal
          log={editLog}
          onClose={() => setEditLog(null)}
          onSave={saveEdit}
        />
      )}
    </View>
  );
}
