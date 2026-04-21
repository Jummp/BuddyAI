import React, { useEffect } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { Habit, useHabitStore } from "../store/habitStore";
import { GlassCard, Pill, ScreenHeader, ScreenShell } from "../components/ui";

function HabitRow({
  habit,
  onDelete,
  onPress,
}: {
  habit: Habit;
  onDelete: () => void;
  onPress: () => void;
}) {
  const pct = habit.target > 0 ? habit.weekly_total / habit.target : 0;
  const statusTone = habit.habit_type === "limit" ? (pct > 1 ? "secondary" : "tertiary") : "primary";
  const statusLabel =
    habit.habit_type === "limit"
      ? pct > 1
        ? "Exceeded"
        : "Controlled"
      : `${Math.round(pct * 100)}%`;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={() =>
        Alert.alert("Elimina", `Eliminare "${habit.name}"?`, [
          { text: "Annulla", style: "cancel" },
          { text: "Elimina", style: "destructive", onPress: onDelete },
        ])
      }
    >
      <GlassCard accent style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.headlineBold }}>{habit.name}</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 8, fontFamily: Fonts.bodyRegular }}>
              {habit.weekly_total}/{habit.target} {habit.unit || "unit"} · {habit.habit_type}
            </Text>
            {habit.reminder_time ? (
              <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 6, fontFamily: Fonts.monoRegular }}>
                reminder // {habit.reminder_time.slice(0, 5)}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 10 }}>
            <Pill label={statusLabel} tone={statusTone as any} />
            <MaterialIcons name="north-east" size={18} color={Colors.textMuted} />
          </View>
        </View>
        <View style={{ height: 4, borderRadius: 999, backgroundColor: Colors.surface3, overflow: "hidden", marginTop: 16 }}>
          <View style={{ width: `${Math.max(0, Math.min(pct, 1)) * 100}%`, height: 4, backgroundColor: habit.habit_type === "limit" ? Colors.secondary : Colors.primary }} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

export default function HabitListScreen() {
  const navigation = useNavigation<any>();
  const { habits, loading, error, fetchHabits, deleteHabit } = useHabitStore();

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  useFocusEffect(
    React.useCallback(() => {
      fetchHabits();
    }, [fetchHabits])
  );

  return (
    <ScreenShell>
      <ScreenHeader
        title="Habits"
        subtitle="Lista operativa di abitudini e limiti, con stato settimanale leggibile e accesso diretto all'editing."
        onBack={() => navigation.goBack()}
        right={<Pill label="+ New" tone="secondary" onPress={() => navigation.navigate("HabitDetail", {})} />}
      />

      {error ? (
        <GlassCard style={{ marginBottom: 12 }}>
          <Text style={{ color: Colors.error, fontFamily: Fonts.bodyMedium }}>{error}</Text>
        </GlassCard>
      ) : null}

      <FlatList
        data={habits}
        keyExtractor={(habit) => habit.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHabits} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <HabitRow
            habit={item}
            onPress={() => navigation.navigate("HabitDetail", { habitId: item.id })}
            onDelete={async () => {
              try {
                await deleteHabit(item.id);
              } catch (e: any) {
                Alert.alert("Errore", e.message);
              }
            }}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <GlassCard accent>
              <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold, marginBottom: 10 }}>
                Nessuna habit attiva.
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 24, marginBottom: 14, fontFamily: Fonts.bodyRegular }}>
                Crea la prima habit da qui e trasformiamo questa sezione in un vero pannello di controllo invece che in una lista vuota.
              </Text>
              <Pill label="Create Habit" active onPress={() => navigation.navigate("HabitDetail", {})} />
            </GlassCard>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </ScreenShell>
  );
}
