import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Colors } from "../constants/colors";
import { useHabitStore } from "../store/habitStore";
import { apiPost } from "../services/api";
import { DashboardStackParamList } from "../navigation/types";

type RouteProps = RouteProp<DashboardStackParamList, "HabitDetail">;

export default function HabitDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { habitId } = route.params ?? {};

  const { habits, updateHabit } = useHabitStore();
  const existing = habits.find((h) => h.id === habitId);

  const [name, setName] = useState(existing?.name ?? "");
  const [habitType, setHabitType] = useState<"habit" | "limit">(existing?.habit_type ?? "habit");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [target, setTarget] = useState(existing?.target?.toString() ?? "");
  const [reminderTime, setReminderTime] = useState(existing?.reminder_time?.slice(0, 5) ?? "");
  const [saving, setSaving] = useState(false);

  const isNew = !habitId;

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert("Nome obbligatorio", "Inserisci un nome per la habit.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await apiPost("/habits", {
          name: name.trim(),
          habit_type: habitType,
          unit: unit.trim(),
          target: parseFloat(target) || 0,
        });
      } else {
        const fields: Record<string, any> = {};
        if (name !== existing?.name) fields.name = name.trim();
        if (unit !== existing?.unit) fields.unit = unit.trim();
        if (parseFloat(target) !== existing?.target) fields.target = parseFloat(target) || 0;
        if (reminderTime !== existing?.reminder_time?.slice(0, 5)) {
          fields.reminder_time = reminderTime || null;
        }
        if (Object.keys(fields).length > 0) {
          await updateHabit(habitId!, fields);
        }
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Errore", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.black }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => navigation.goBack()} style={{ marginRight: 12 }} accessibilityRole="button" accessibilityLabel="Torna indietro">
            <Text style={{ color: Colors.primary, fontSize: 18 }}>←</Text>
          </Pressable>
          <Text style={{ color: Colors.textPrimary, fontSize: 22, fontWeight: "700", flex: 1 }}>
            {isNew ? "Nuova Habit" : "Modifica Habit"}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {/* Nome */}
          <View>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>NOME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="es. lettura, acqua, alcol..."
              placeholderTextColor={Colors.textSecondary}
              style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.textPrimary, fontSize: 16 }}
              accessibilityLabel="Nome habit"
            />
          </View>

          {/* Tipo */}
          <View>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>TIPO</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {(["habit", "limit"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setHabitType(t)}
                  style={{
                    flex: 1,
                    backgroundColor: habitType === t ? Colors.primary : Colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    alignItems: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t === "habit" ? "Tipo habit" : "Tipo limite"}
                  accessibilityState={{ selected: habitType === t }}
                >
                  <Text style={{ color: habitType === t ? Colors.black : Colors.textSecondary, fontWeight: "600" }}>
                    {t === "habit" ? "Habit" : "Limite"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Unità */}
          <View>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>UNITÀ</Text>
            <TextInput
              value={unit}
              onChangeText={setUnit}
              placeholder="es. min, g, ml, unità..."
              placeholderTextColor={Colors.textSecondary}
              style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.textPrimary, fontSize: 16 }}
              accessibilityLabel="Unità di misura"
            />
          </View>

          {/* Target */}
          <View>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>
              TARGET SETTIMANALE
            </Text>
            <TextInput
              value={target}
              onChangeText={setTarget}
              placeholder="es. 420"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
              style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.textPrimary, fontSize: 16 }}
              accessibilityLabel="Target settimanale"
            />
          </View>

          {/* Reminder */}
          <View>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>
              REMINDER (HH:MM) — opzionale
            </Text>
            <TextInput
              value={reminderTime}
              onChangeText={setReminderTime}
              placeholder="es. 21:00"
              placeholderTextColor={Colors.textSecondary}
              style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.textPrimary, fontSize: 16 }}
              accessibilityLabel="Orario reminder"
            />
          </View>

          {/* Salva */}
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary,
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
              marginTop: 8,
              opacity: pressed || saving ? 0.7 : 1,
            })}
            accessibilityRole="button"
            accessibilityLabel="Salva habit"
          >
            {saving ? (
              <ActivityIndicator color={Colors.black} />
            ) : (
              <Text style={{ color: Colors.black, fontWeight: "700", fontSize: 16 }}>
                {isNew ? "Crea Habit" : "Salva modifiche"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
