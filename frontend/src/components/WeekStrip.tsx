import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Colors } from "../constants/colors";

export type Period = "day" | "week" | "month";

type Props = {
  selectedDate: string;           // YYYY-MM-DD
  activeDates?: string[];         // dates with data (show dot)
  onSelectDate: (date: string) => void;
  period?: Period;
  onPeriodChange?: (p: Period) => void;
  showPeriod?: boolean;
};

const DAYS_IT = ["D", "L", "M", "M", "G", "V", "S"];

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export default function WeekStrip({
  selectedDate, activeDates = [], onSelectDate,
  period = "day", onPeriodChange, showPeriod = true,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week

  const today = new Date();
  const baseMonday = startOfWeek(today);
  const weekStart = addDays(baseMonday, weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return { date: isoDate(d), label: DAYS_IT[d.getDay()], num: d.getDate() };
  });

  const activeSet = new Set(activeDates);
  const todayStr = isoDate(today);

  // Month label
  const monthLabel = weekStart.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
      {/* Month + nav arrows */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Pressable
          onPress={() => setWeekOffset((o) => o - 1)}
          style={{ padding: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Settimana precedente"
        >
          <Text style={{ color: Colors.primary, fontSize: 18 }}>‹</Text>
        </Pressable>
        <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>
          {monthLabel}
        </Text>
        <Pressable
          onPress={() => setWeekOffset((o) => Math.min(o + 1, 0))}
          style={{ padding: 6, opacity: weekOffset >= 0 ? 0.3 : 1 }}
          disabled={weekOffset >= 0}
          accessibilityRole="button"
          accessibilityLabel="Settimana successiva"
        >
          <Text style={{ color: Colors.primary, fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      {/* Day cells */}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {days.map(({ date, label, num }) => {
          const isSelected = date === selectedDate;
          const isToday = date === todayStr;
          const hasData = activeSet.has(date);
          const isFuture = date > todayStr;

          return (
            <Pressable
              key={date}
              onPress={() => !isFuture && onSelectDate(date)}
              disabled={isFuture}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 8,
                marginHorizontal: 2,
                borderRadius: 10,
                backgroundColor: isSelected ? Colors.primary : "transparent",
                opacity: isFuture ? 0.3 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={date}
            >
              <Text style={{
                color: isSelected ? Colors.black : Colors.textSecondary,
                fontSize: 11, fontWeight: "600", marginBottom: 4,
              }}>
                {label}
              </Text>
              <Text style={{
                color: isSelected ? Colors.black : isToday ? Colors.primary : Colors.textPrimary,
                fontSize: 15, fontWeight: isToday ? "700" : "500",
              }}>
                {num}
              </Text>
              {/* Data dot */}
              <View style={{
                width: 4, height: 4, borderRadius: 2, marginTop: 3,
                backgroundColor: hasData
                  ? (isSelected ? Colors.black : Colors.primary)
                  : "transparent",
              }} />
            </Pressable>
          );
        })}
      </View>

      {/* Period selector */}
      {showPeriod && onPeriodChange && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {(["day", "week", "month"] as Period[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => onPeriodChange(p)}
              style={{
                backgroundColor: period === p ? Colors.primary : Colors.surface,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 6,
              }}
              accessibilityRole="button"
            >
              <Text style={{
                color: period === p ? Colors.black : Colors.textSecondary,
                fontSize: 13, fontWeight: "600",
              }}>
                {p === "day" ? "Giorno" : p === "week" ? "Settimana" : "Mese"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
