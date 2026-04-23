import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { DashboardStackParamList } from "../navigation/types";
import { useHabitStore } from "../store/habitStore";
import { AccentButton, Eyebrow, FieldLabel, GlassCard, Pill, ScreenHeader, ScreenShell } from "../components/ui";

type RouteProps = RouteProp<DashboardStackParamList, "HabitDetail">;

export default function HabitDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProps>();
  const { habitId } = route.params ?? {};
  const { habits, createHabit, updateHabit, fetchHabits, logHabit } = useHabitStore();
  const existing = habits.find((habit) => habit.id === habitId);

  const [name, setName] = useState(existing?.name ?? "");
  const [habitType, setHabitType] = useState<"habit" | "limit">(existing?.habit_type ?? "habit");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [target, setTarget] = useState(existing?.target?.toString() ?? "");
  const [reminderTime, setReminderTime] = useState(existing?.reminder_time?.slice(0, 5) ?? "");
  const [saving, setSaving] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logValue, setLogValue] = useState("1");

  const isNew = !habitId;

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
  } as const;

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert("Nome obbligatorio", "Inserisci un nome per la habit.");
      return;
    }
    if (reminderTime && !/^\d{2}:\d{2}$/.test(reminderTime)) {
      Alert.alert("Reminder non valido", "Usa il formato HH:MM.");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await createHabit({
          name: name.trim(),
          habit_type: habitType,
          unit: unit.trim(),
          target: parseFloat(target) || 0,
        });
      } else {
        const fields: Record<string, any> = {};
        if (name !== existing?.name) fields.name = name.trim();
        if (habitType !== existing?.habit_type) fields.habit_type = habitType;
        if (unit !== existing?.unit) fields.unit = unit.trim();
        if ((parseFloat(target) || 0) !== existing?.target) fields.target = parseFloat(target) || 0;
        if (reminderTime !== existing?.reminder_time?.slice(0, 5)) fields.reminder_time = reminderTime || null;
        if (Object.keys(fields).length > 0) {
          await updateHabit(habitId!, fields);
        }
      }
      await fetchHabits();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Errore", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenShell scroll padded={false}>
        <View style={{ paddingHorizontal: 20 }}>
          <ScreenHeader
            title={isNew ? "New Habit" : "Edit Habit"}
            subtitle="Definisci tipo, target, reminder e unità dentro un editor più vicino alla grammatica visiva del sistema."
            onBack={() => navigation.goBack()}
            right={<Pill label={isNew ? "Create Mode" : "Edit Mode"} tone="tertiary" />}
          />

          {!isNew && existing && (
            <GlassCard accent style={{ marginBottom: 16 }}>
              <Eyebrow text="Log Today" tone="primary" />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={{ color: Colors.textPrimary, fontSize: 34, fontFamily: Fonts.headlineBold }}>
                  {existing.weekly_total ?? 0}
                  <Text style={{ color: Colors.textSecondary, fontSize: 16 }}> / {existing.target}{existing.unit} sett</Text>
                </Text>
                <Pill
                  label={habitType === "limit" ? "LIMIT" : "HABIT"}
                  tone={habitType === "limit" ? "secondary" : "primary"}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <TextInput
                  value={logValue}
                  onChangeText={setLogValue}
                  keyboardType="numeric"
                  style={{
                    flex: 1,
                    backgroundColor: Colors.surface,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: Colors.ghostBorder,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: Colors.textPrimary,
                    fontSize: 18,
                    fontFamily: Fonts.headlineBold,
                    textAlign: "center",
                  }}
                />
                <Pill
                  label={unit || "unità"}
                  tone="neutral"
                />
                <Pill
                  label={logging ? "..." : "+ Log"}
                  tone="primary"
                  active
                  onPress={async () => {
                    const v = parseFloat(logValue);
                    if (!v || v <= 0) return;
                    setLogging(true);
                    try {
                      await logHabit(existing.id, v);
                      setLogValue("1");
                    } catch (e: any) {
                      Alert.alert("Errore", e.message);
                    } finally {
                      setLogging(false);
                    }
                  }}
                />
              </View>
            </GlassCard>
          )}

          <GlassCard accent style={{ marginBottom: 16 }}>
            <FieldLabel text="Name" />
            <TextInput value={name} onChangeText={setName} placeholder="Reading, water, alcohol..." placeholderTextColor={Colors.textMuted} style={inputStyle} />

            <FieldLabel text="Type" />
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <Pill label="Habit" active={habitType === "habit"} onPress={() => setHabitType("habit")} />
              <Pill label="Limit" active={habitType === "limit"} tone="secondary" onPress={() => setHabitType("limit")} />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="Unit" />
                <TextInput value={unit} onChangeText={setUnit} placeholder="min, g, ml..." placeholderTextColor={Colors.textMuted} style={inputStyle} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="Weekly Target" />
                <TextInput value={target} onChangeText={setTarget} keyboardType="numeric" placeholder="420" placeholderTextColor={Colors.textMuted} style={inputStyle} />
              </View>
            </View>

            <FieldLabel text="Reminder Time" />
            <TextInput value={reminderTime} onChangeText={setReminderTime} placeholder="21:00" placeholderTextColor={Colors.textMuted} style={inputStyle} />

            <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 22, marginBottom: 18, fontFamily: Fonts.bodyRegular }}>
              Per i limiti il target rappresenta il massimo settimanale. Per le habit rappresenta il volume desiderato.
            </Text>

            <AccentButton label={saving ? "Saving..." : isNew ? "Create Habit" : "Save Changes"} onPress={onSave} disabled={saving} />
            {saving ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} /> : null}
          </GlassCard>
        </View>
      </ScreenShell>
    </KeyboardAvoidingView>
  );
}
