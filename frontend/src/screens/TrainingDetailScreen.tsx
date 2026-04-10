import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../constants/colors";
import { apiGet, apiPost } from "../services/api";

const BLOCK_KEY = "training_block";
const BLOCKS = ["A", "B", "C"] as const;
type Block = typeof BLOCKS[number];

type Exercise = {
  id: string;
  block: string;
  drill_id: string;
  exercise_name: string;
  sets: string;
  reps: string;
  rest: string;
  video: { url: string; title: string } | null;
};

function toInAppUrl(url: string): string {
  // YouTube watch URLs open the YT app — use embed instead to stay in-app
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`;
  return url;
}

function ExerciseCard({ ex }: { ex: Exercise }) {
  const openVideo = async () => {
    if (!ex.video?.url) return;
    await WebBrowser.openBrowserAsync(toInAppUrl(ex.video.url), {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  };

  return (
    <View style={{
      backgroundColor: Colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ color: Colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
            {ex.exercise_name}
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4 }}>
            {ex.sets} serie · {ex.reps} reps · riposo {ex.rest}
          </Text>
        </View>
        {ex.video ? (
          <Pressable
            onPress={openVideo}
            style={{ backgroundColor: Colors.primaryDark, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
            accessibilityLabel={`Guarda video ${ex.exercise_name}`}
            accessibilityRole="link"
          >
            <Text style={{ color: Colors.textPrimary, fontSize: 12, fontWeight: "700" }}>▶ Video</Text>
          </Pressable>
        ) : (
          <View style={{ backgroundColor: Colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>no video</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function TrainingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [block, setBlock] = useState<Block>("A");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBlock = useCallback(async (b: Block) => {
    setLoading(true);
    try {
      const data = await apiGet<Exercise[]>(`/training/block/${b}`);
      setExercises(data);
    } catch {
      setExercises([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const saved = await AsyncStorage.getItem(BLOCK_KEY);
      const b: Block = (saved as Block) ?? "A";
      setBlock(b);
      const today = await apiGet<{ completed: boolean }>("/training/today");
      setCompleted(today.completed);
      await loadBlock(b);
    };
    init();
  }, []);

  const onSelectBlock = async (b: Block) => {
    setBlock(b);
    await AsyncStorage.setItem(BLOCK_KEY, b);
    await loadBlock(b);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBlock(block);
    setRefreshing(false);
  };

  const onComplete = () => {
    Alert.alert("Allenamento completato?", "Segna l'allenamento di oggi come fatto.", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Fatto!",
        onPress: async () => {
          setCompleting(true);
          try {
            await apiPost("/training/complete");
            setCompleted(true);
          } catch {}
          setCompleting(false);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.black }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center" }}>
        <Pressable onPress={() => navigation.goBack()} style={{ marginRight: 12 }} accessibilityRole="button">
          <Text style={{ color: Colors.primary, fontSize: 18 }}>←</Text>
        </Pressable>
        <Text style={{ color: Colors.textPrimary, fontSize: 22, fontWeight: "700", flex: 1 }}>
          Allenamento
        </Text>
        {completed && (
          <View style={{ backgroundColor: Colors.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ color: Colors.black, fontSize: 12, fontWeight: "700" }}>✓ DONE</Text>
          </View>
        )}
      </View>

      {/* Block selector */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 16 }}>
        {BLOCKS.map((b) => (
          <Pressable
            key={b}
            onPress={() => onSelectBlock(b)}
            style={{
              flex: 1,
              backgroundColor: block === b ? Colors.primary : Colors.surface,
              borderRadius: 12,
              padding: 12,
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel={`Blocco ${b}`}
          >
            <Text style={{ color: block === b ? Colors.black : Colors.textSecondary, fontWeight: "700", fontSize: 16 }}>
              Blocco {b}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Exercise list */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item }) => <ExerciseCard ex={item} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 15 }}>
                Nessun esercizio trovato per il Blocco {block}.
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 8, textAlign: "center" }}>
                Chiedi a PandorAI di caricare il tuo programma o controlla il DB.
              </Text>
            </View>
          }
        />
      )}

      {/* Complete CTA */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 12, backgroundColor: Colors.black, borderTopWidth: 1, borderTopColor: Colors.border }}>
        <Pressable
          onPress={onComplete}
          disabled={completed || completing}
          style={({ pressed }) => ({
            backgroundColor: completed ? Colors.accent : Colors.primary,
            borderRadius: 14,
            padding: 16,
            alignItems: "center",
            opacity: pressed || completing ? 0.7 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="Segna allenamento completato"
        >
          {completing ? (
            <ActivityIndicator color={Colors.black} />
          ) : (
            <Text style={{ color: Colors.black, fontWeight: "700", fontSize: 16 }}>
              {completed ? "✓ Allenamento completato" : "Segna come completato"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
