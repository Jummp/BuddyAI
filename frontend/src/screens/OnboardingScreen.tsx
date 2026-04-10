import React, { useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  useWindowDimensions,
  ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/colors";
import { registerForPushNotifications } from "../services/notifications";

type Slide = { id: string; emoji: string; title: string; body: string };

const SLIDES: Slide[] = [
  {
    id: "1",
    emoji: "🤖",
    title: "Ciao, sono PandorAI",
    body: "Il tuo companion personale per abitudini, allenamento, nutrizione e memoria. Ti supporto ogni giorno.",
  },
  {
    id: "2",
    emoji: "🎤",
    title: "Parliamo",
    body: "Parla o scrivi in italiano. Logga pasti, habit, pensieri — PandorAI capisce il linguaggio naturale.",
  },
  {
    id: "3",
    emoji: "🔔",
    title: "Resto vicino",
    body: "Ricevo check-in mattutini, reminder allenamento e alert habit. Attiva le notifiche per iniziare.",
  },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const onNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
      setActiveIndex(activeIndex + 1);
    } else {
      await registerForPushNotifications().catch(() => {});
      onDone();
    }
  };

  const renderItem = ({ item }: ListRenderItemInfo<Slide>) => (
    <View
      style={{
        width,
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 40,
      }}
    >
      <Text style={{ fontSize: 72, marginBottom: 32 }}>{item.emoji}</Text>
      <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "700", textAlign: "center", marginBottom: 16 }}>
        {item.title}
      </Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 17, textAlign: "center", lineHeight: 26 }}>
        {item.body}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.black, paddingBottom: insets.bottom + 24 }}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={{ flex: 1 }}
      />

      {/* Dots */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === activeIndex ? 20 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === activeIndex ? Colors.primary : Colors.surface2,
            }}
          />
        ))}
      </View>

      {/* CTA */}
      <Pressable
        onPress={onNext}
        style={({ pressed }) => ({
          marginHorizontal: 24,
          backgroundColor: Colors.primary,
          borderRadius: 12,
          padding: 16,
          alignItems: "center",
          opacity: pressed ? 0.8 : 1,
        })}
        accessibilityRole="button"
        accessibilityLabel={activeIndex < SLIDES.length - 1 ? "Avanti" : "Inizia"}
      >
        <Text style={{ color: Colors.black, fontWeight: "700", fontSize: 17 }}>
          {activeIndex < SLIDES.length - 1 ? "Avanti →" : "Inizia"}
        </Text>
      </Pressable>
    </View>
  );
}
