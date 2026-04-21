import React, { useRef, useState } from "react";
import { FlatList, ListRenderItemInfo, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { registerForPushNotifications } from "../services/notifications";
import { AccentButton, GlassCard } from "../components/ui";

type Slide = {
  id: string;
  phase: string;
  title: string;
  body: string;
  command: string;
};

const SLIDES: Slide[] = [
  {
    id: "1",
    phase: "Core Link",
    title: "Companion system,\nnot generic chat.",
    body:
      "PandorAI tiene insieme memoria, allenamento, nutrizione e routine dentro un unico pannello personale con tono operativo.",
    command: "memory.online / coaching.ready",
  },
  {
    id: "2",
    phase: "Input Layer",
    title: "Parla, scrivi,\naggiorna al volo.",
    body:
      "Logga pasti, journaling, habit e richieste quotidiane in linguaggio naturale. L'interfaccia resta veloce, leggibile e sempre sotto controllo.",
    command: "voice.text.attach // synced",
  },
  {
    id: "3",
    phase: "Daily Loop",
    title: "Lascia acceso il\nsistema di supporto.",
    body:
      "Attiva notifiche e check-in per trasformare PandorAI in un layer costante, non in un'app che apri solo quando te ne ricordi.",
    command: "notifications.enable / start.sequence",
  },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const onNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
      return;
    }

    await registerForPushNotifications().catch(() => {});
    onDone();
  };

  const renderItem = ({ item }: ListRenderItemInfo<Slide>) => (
    <View
      style={{
        width,
        paddingHorizontal: 20,
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + 20,
      }}
    >
      <View style={{ width: "100%", maxWidth: 900, alignSelf: "center", flex: 1 }}>
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: Colors.surface3,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.ghostBorder,
            paddingHorizontal: 10,
            paddingVertical: 6,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: Colors.primary,
              fontSize: 10,
              fontFamily: Fonts.headlineBold,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            {item.phase}
          </Text>
        </View>

        <GlassCard accent style={{ minHeight: 520, justifyContent: "space-between", overflow: "hidden" }}>
          <View
            style={{
              position: "absolute",
              right: -20,
              top: -20,
              width: 180,
              height: 180,
              borderRadius: 999,
              backgroundColor: "rgba(161,255,194,0.06)",
            }}
          />
          <View
            style={{
              position: "absolute",
              left: -40,
              bottom: -50,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: "rgba(235,101,255,0.08)",
            }}
          />

          <View>
            <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.monoRegular, marginBottom: 20 }}>
              [ boot.sequence {item.id}/3 ]
            </Text>
            <Text
              style={{
                color: Colors.textPrimary,
                fontSize: 42,
                lineHeight: 44,
                fontFamily: Fonts.headlineBold,
                maxWidth: 560,
              }}
            >
              {item.title}
            </Text>
            <Text
              style={{
                color: Colors.textSecondary,
                fontSize: 18,
                lineHeight: 29,
                marginTop: 18,
                maxWidth: 560,
                fontFamily: Fonts.bodyRegular,
              }}
            >
              {item.body}
            </Text>
          </View>

          <View>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: Colors.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: Colors.ghostBorder,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 22,
              }}
            >
              <Text style={{ color: Colors.tertiary, fontSize: 12, fontFamily: Fonts.monoMedium }}>
                {item.command}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 22 }}>
              {SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === activeIndex ? 34 : 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: i === activeIndex ? Colors.primary : Colors.surface3,
                    borderWidth: i === activeIndex ? 0 : 1,
                    borderColor: Colors.ghostBorder,
                  }}
                />
              ))}
            </View>

            <AccentButton label={activeIndex < SLIDES.length - 1 ? "Continue Sequence" : "Enter PandorAI"} onPress={onNext} />
          </View>
        </GlassCard>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}
