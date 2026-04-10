import React, { useEffect } from "react";
import { View, Text, FlatList, Pressable, Alert, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../constants/colors";
import { useHabitStore, Habit } from "../store/habitStore";

function HabitRow({ habit, onDelete, onPress }: { habit: Habit; onDelete: () => void; onPress: () => void }) {
  const pct = habit.target > 0 ? habit.weekly_total / habit.target : 0;
  let statusColor = Colors.accent;
  let statusLabel = `${Math.round(pct * 100)}%`;

  if (habit.habit_type === "limit") {
    if (pct > 1) { statusColor = Colors.error; statusLabel = "SUPERATO"; }
    else if (pct > 0.7) { statusColor = Colors.warning; statusLabel = "ATTENZIONE"; }
  } else {
    if (pct < 0.6) { statusColor = Colors.textSecondary; statusLabel = "BASSO"; }
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => Alert.alert("Elimina", `Eliminare "${habit.name}"?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: onDelete },
      ])}
      style={({ pressed }) => ({
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        opacity: pressed ? 0.8 : 1,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      })}
      accessibilityLabel={`${habit.name}: ${statusLabel}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "600" }}>
          {habit.name}
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>
          {habit.weekly_total}/{habit.target}{habit.unit} · {habit.habit_type}
        </Text>
        {habit.reminder_time && (
          <Text style={{ color: Colors.primary, fontSize: 12, marginTop: 2 }}>
            ⏰ {habit.reminder_time.slice(0, 5)}
          </Text>
        )}
      </View>
      <View style={{ backgroundColor: statusColor + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ color: statusColor, fontWeight: "700", fontSize: 13 }}>{statusLabel}</Text>
      </View>
    </Pressable>
  );
}

export default function HabitListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { habits, loading, fetchHabits, deleteHabit } = useHabitStore();

  useEffect(() => { fetchHabits(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.black }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={{ color: Colors.primary, fontSize: 18 }}>←</Text>
        </Pressable>
        <Text style={{ color: Colors.textPrimary, fontSize: 22, fontWeight: "700" }}>
          Habit & Limiti
        </Text>
        <Pressable
          onPress={() => navigation.navigate("HabitDetail", {})}
          accessibilityLabel="Nuova habit"
          accessibilityRole="button"
        >
          <Text style={{ color: Colors.primary, fontSize: 22 }}>+</Text>
        </Pressable>
      </View>

      <FlatList
        data={habits}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHabits} tintColor={Colors.primary} />}
        renderItem={({ item }) => (
          <HabitRow
            habit={item}
            onPress={() => navigation.navigate("HabitDetail", { habitId: item.id })}
            onDelete={() => deleteHabit(item.id)}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={{ color: Colors.textSecondary, textAlign: "center", marginTop: 40 }}>
              Nessuna habit. Aggiungila via chat o con il tasto +
            </Text>
          ) : null
        }
      />
    </View>
  );
}
