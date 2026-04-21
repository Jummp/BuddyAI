import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { GlassCard, Pill } from "./ui";

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
    <GlassCard style={{ marginBottom: 12 }}>
      {/* Month + nav arrows */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Pressable
          onPress={() => setWeekOffset((o) => o - 1)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: Colors.surface3,
            borderWidth: 1,
            borderColor: Colors.ghostBorder,
          }}
          accessibilityRole="button"
          accessibilityLabel="Settimana precedente"
        >
          <Text style={{ color: Colors.primary, fontSize: 18, fontFamily: Fonts.headlineBold }}>‹</Text>
        </Pressable>
        <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>
          {monthLabel}
        </Text>
        <Pressable
          onPress={() => setWeekOffset((o) => Math.min(o + 1, 0))}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: Colors.surface3,
            borderWidth: 1,
            borderColor: Colors.ghostBorder,
            opacity: weekOffset >= 0 ? 0.3 : 1,
          }}
          disabled={weekOffset >= 0}
          accessibilityRole="button"
          accessibilityLabel="Settimana successiva"
        >
          <Text style={{ color: Colors.primary, fontSize: 18, fontFamily: Fonts.headlineBold }}>›</Text>
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
                paddingVertical: 10,
                marginHorizontal: 2,
                borderRadius: 14,
                backgroundColor: isSelected ? Colors.primary : Colors.surface3,
                borderWidth: 1,
                borderColor: isSelected ? Colors.primary : Colors.ghostBorder,
                opacity: isFuture ? 0.3 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={date}
            >
              <Text style={{
                color: isSelected ? Colors.black : Colors.textSecondary,
                fontSize: 10,
                fontFamily: Fonts.headlineBold,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                marginBottom: 4,
              }}>
                {label}
              </Text>
              <Text style={{
                color: isSelected ? Colors.black : isToday ? Colors.primary : Colors.textPrimary,
                fontSize: 16,
                fontFamily: isToday ? Fonts.headlineBold : Fonts.bodyMedium,
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
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {(["day", "week", "month"] as Period[]).map((p) => (
            <View
              key={p}
              accessibilityRole="none"
            >
              <Pill
                label={p === "day" ? "Giorno" : p === "week" ? "Settimana" : "Mese"}
                active={period === p}
                onPress={() => onPeriodChange(p)}
              />
            </View>
          ))}
        </View>
      )}
    </GlassCard>
  );
}
