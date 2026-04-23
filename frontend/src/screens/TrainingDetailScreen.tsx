import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { API_BASE, apiDelete, apiGet, apiPatch, apiPost } from "../services/api";
import { AccentButton, Eyebrow, FieldLabel, GlassCard, Pill, ScreenHeader, ScreenShell } from "../components/ui";

const BLOCK_KEY = "training_block";
const BLOCKS = ["A", "B", "C"] as const;
type Block = typeof BLOCKS[number];

function decodeHtmlEntities(text: string): string {
  return text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

type Exercise = {
  id: string;
  block: string;
  drill_id: string;
  exercise_name: string;
  sets: string;
  reps: string;
  rest: string;
  month_focus?: string | null;
  video: { url: string; title: string } | null;
};

type FreeTrainingLog = {
  id: string;
  date: string;
  note: string;
  created_at: string;
};

type ExerciseDraft = {
  block: Block;
  exercise_name: string;
  drill_id: string;
  sets: string;
  reps: string;
  rest: string;
  month_focus: string;
  video_url?: string;
  video_title?: string;
};

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/\s]+)/);
  return m?.[1] ?? null;
}

function toInAppUrl(url: string): string {
  const videoId = getYouTubeId(url);
  if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=https%3A%2F%2Fbuddyai.local`;
  return url;
}

function buildVideoHtml(url: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
      iframe { width: 100%; height: 100%; border: 0; background: #000; }
    </style>
  </head>
  <body>
    <iframe
      src="${url}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowfullscreen
    ></iframe>
  </body>
</html>`;
}

function emptyDraft(block: Block): ExerciseDraft {
  return { block, exercise_name: "", drill_id: "", sets: "", reps: "", rest: "", month_focus: "", video_url: "", video_title: "" };
}

function formatLogDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}`;
}

function EditorModal({
  visible,
  draft,
  saving,
  title,
  onClose,
  onChange,
  onSave,
}: {
  visible: boolean;
  draft: ExerciseDraft;
  saving: boolean;
  title: string;
  onClose: () => void;
  onChange: (patch: Partial<ExerciseDraft>) => void;
  onSave: () => void;
}) {
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
    marginBottom: 12,
  } as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.82)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View>
              <Eyebrow text="Training Editor" tone="primary" />
              <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold }}>{title}</Text>
            </View>
            <Pressable onPress={onClose}>
              <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <FieldLabel text="Block" />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {BLOCKS.map((block) => (
              <Pill key={block} label={`Block ${block}`} active={draft.block === block} onPress={() => onChange({ block })} />
            ))}
          </View>

          <FieldLabel text="Exercise Name" />
          <TextInput
            value={draft.exercise_name}
            onChangeText={(exercise_name) => onChange({ exercise_name })}
            placeholder="Romanian deadlift"
            placeholderTextColor={Colors.textMuted}
            style={inputStyle}
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Drill" />
              <TextInput value={draft.drill_id} onChangeText={(drill_id) => onChange({ drill_id })} placeholder="1.a" placeholderTextColor={Colors.textMuted} style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Sets" />
              <TextInput value={draft.sets} onChangeText={(sets) => onChange({ sets })} placeholder="4" placeholderTextColor={Colors.textMuted} style={inputStyle} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Reps" />
              <TextInput value={draft.reps} onChangeText={(reps) => onChange({ reps })} placeholder="8" placeholderTextColor={Colors.textMuted} style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Rest" />
              <TextInput value={draft.rest} onChangeText={(rest) => onChange({ rest })} placeholder="90s" placeholderTextColor={Colors.textMuted} style={inputStyle} />
            </View>
          </View>

          <FieldLabel text="Month Focus" />
          <TextInput
            value={draft.month_focus}
            onChangeText={(month_focus) => onChange({ month_focus })}
            placeholder="Strength, tempo, hinge..."
            placeholderTextColor={Colors.textMuted}
            style={inputStyle}
          />

          <FieldLabel text="Video URL (optional)" />
          <TextInput
            value={draft.video_url}
            onChangeText={(video_url) => onChange({ video_url })}
            placeholder="https://youtu.be/... or YouTube URL"
            placeholderTextColor={Colors.textMuted}
            style={inputStyle}
          />

          <FieldLabel text="Video Title (optional)" />
          <TextInput
            value={draft.video_title}
            onChangeText={(video_title) => onChange({ video_title })}
            placeholder="e.g., RDL Tutorial"
            placeholderTextColor={Colors.textMuted}
            style={inputStyle}
          />

          <AccentButton label={saving ? "Saving..." : "Save Exercise"} onPress={onSave} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}

function VideoModal({
  visible,
  title,
  url,
  onClose,
  onReplace,
}: {
  visible: boolean;
  title: string;
  url: string | null;
  onClose: () => void;
  onReplace?: () => void;
}) {
  const decodedTitle = decodeHtmlEntities(title || "Exercise video");
  const [webViewError, setWebViewError] = useState(false);

  useEffect(() => {
    setWebViewError(false);
  }, [url, visible]);

  if (Platform.OS === "web") {
    if (!visible) return null;
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Eyebrow text="Video Overlay" tone="tertiary" />
              <Text style={{ color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.headlineBold }} numberOfLines={1}>
                {decodedTitle}
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Text style={{ color: Colors.primary, fontSize: 12, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase" }}>Close</Text>
            </Pressable>
          </View>
          {url ? (
            <iframe src={url} style={{ flex: 1, border: "none", width: "100%", height: "100%" } as any} allow="autoplay; fullscreen" allowFullScreen />
          ) : null}
        </View>
      </Modal>
    );
  }

  // Lazy require — only evaluated on native, never on web
  const WebViewComponent = require("react-native-webview").WebView as React.ComponentType<any>;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Eyebrow text="Video Overlay" tone="tertiary" />
            <Text style={{ color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.headlineBold }} numberOfLines={1}>
              {decodedTitle}
            </Text>
          </View>
          <Pressable onPress={onClose}>
            <Text style={{ color: Colors.primary, fontSize: 12, fontFamily: Fonts.headlineBold, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Close
            </Text>
          </Pressable>
        </View>
        {url && !webViewError ? (
          <WebViewComponent
            source={{ html: buildVideoHtml(url), baseUrl: "https://www.youtube.com" }}
            style={{ flex: 1, backgroundColor: "#000" }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            onError={() => setWebViewError(true)}
            onHttpError={(e: any) => { if (e.nativeEvent?.statusCode >= 400) setWebViewError(true); }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
            <MaterialIcons name="play-circle-outline" size={64} color={Colors.textMuted} />
            <Text style={{ color: Colors.textSecondary, fontFamily: Fonts.bodyRegular, textAlign: "center", paddingHorizontal: 24 }}>
              {webViewError ? "Embed non disponibile per questo video." : "Video non disponibile."}
            </Text>
            {webViewError && onReplace && (
              <Pressable onPress={onReplace}>
                <Text style={{ color: Colors.tertiary, fontFamily: Fonts.headlineBold, fontSize: 13, letterSpacing: 1.1, textTransform: "uppercase" }}>
                  Sostituisci link video →
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

function ExerciseCard({
  exercise,
  onVideo,
  onEdit,
  onDelete,
}: {
  exercise: Exercise;
  onVideo: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard accent style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
      <View style={{ height: 4, backgroundColor: Colors.primary }} />
      <View style={{ padding: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Eyebrow text={`Drill ${exercise.drill_id || "n/a"}`} tone="primary" />
            <Text style={{ color: Colors.textPrimary, fontSize: 22, lineHeight: 26, fontFamily: Fonts.headlineBold }}>
              {exercise.exercise_name}
            </Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 23, marginTop: 10, fontFamily: Fonts.bodyRegular }}>
              {exercise.sets || "-"} sets · {exercise.reps || "-"} reps · rest {exercise.rest || "-"}
            </Text>
            {!!exercise.month_focus && (
              <View style={{ marginTop: 12 }}>
                <Pill label={exercise.month_focus} tone="secondary" />
              </View>
            )}
          </View>
          <View style={{ gap: 8 }}>
            <Pill
              label={exercise.video ? "Play Overlay" : "No Video"}
              tone={exercise.video ? "tertiary" : "neutral"}
              onPress={exercise.video ? onVideo : undefined}
              icon={<MaterialIcons name="play-arrow" size={14} color={exercise.video ? Colors.tertiary : Colors.textSecondary} />}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <Pressable onPress={onEdit}>
                <Text style={{ color: Colors.primary, fontSize: 11, fontFamily: Fonts.headlineBold, letterSpacing: 1.1, textTransform: "uppercase" }}>
                  Edit
                </Text>
              </Pressable>
              <Pressable onPress={onDelete}>
                <Text style={{ color: Colors.error, fontSize: 11, fontFamily: Fonts.headlineBold, letterSpacing: 1.1, textTransform: "uppercase" }}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </GlassCard>
  );
}

export default function TrainingDetailScreen() {
  const navigation = useNavigation<any>();
  const [block, setBlock] = useState<Block>("A");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [savingExercise, setSavingExercise] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft("A"));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoExercise, setVideoExercise] = useState<Exercise | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [freeLogNote, setFreeLogNote] = useState("");
  const [savingFreeLog, setSavingFreeLog] = useState(false);
  const [freeLogs, setFreeLogs] = useState<FreeTrainingLog[]>([]);
  const [loadingFreeLogs, setLoadingFreeLogs] = useState(false);

  const uploadBlockDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/csv", "application/vnd.ms-excel"],
      });
      if (result.canceled || result.assets.length === 0) return;
      const file = result.assets[0];
      setUploadingDoc(true);
      const formData = new FormData();
      formData.append("block", block);
      formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/pdf" } as any);
      const res = await fetch(`${API_BASE}/training/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload fallito");
      Alert.alert("✓", `Documento "${file.name}" caricato per Blocco ${block}`);
    } catch (e: any) {
      Alert.alert("Errore", e.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const loadTrainingStatus = useCallback(async () => {
    try {
      const today = await apiGet<{ completed: boolean }>("/training/today");
      setCompleted(today.completed);
    } catch {}
  }, []);

  const loadBlock = useCallback(async (nextBlock: Block) => {
    setLoading(true);
    try {
      const data = await apiGet<Exercise[]>(`/training/block/${nextBlock}`);
      setExercises(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e: any) {
      setExercises([]);
      setError(e?.message || "Failed to load exercises");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFreeLogs = useCallback(async () => {
    setLoadingFreeLogs(true);
    try {
      const data = await apiGet<FreeTrainingLog[]>("/training/free-logs?limit=8");
      setFreeLogs(Array.isArray(data) ? data : []);
    } catch {
      setFreeLogs([]);
    } finally {
      setLoadingFreeLogs(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const saved = await AsyncStorage.getItem(BLOCK_KEY);
      const nextBlock = (saved as Block) ?? "A";
      setBlock(nextBlock);
      await Promise.all([loadTrainingStatus(), loadBlock(nextBlock), loadFreeLogs()]);
    };
    init();
  }, [loadBlock, loadFreeLogs, loadTrainingStatus]);

  useFocusEffect(
    React.useCallback(() => {
      loadTrainingStatus();
      loadBlock(block);
      loadFreeLogs();
    }, [block, loadBlock, loadFreeLogs, loadTrainingStatus])
  );

  const onSelectBlock = async (nextBlock: Block) => {
    setBlock(nextBlock);
    await AsyncStorage.setItem(BLOCK_KEY, nextBlock);
    await loadBlock(nextBlock);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTrainingStatus(), loadBlock(block), loadFreeLogs()]);
    setRefreshing(false);
  };

  const openCreateExercise = () => {
    setEditingExerciseId(null);
    setDraft(emptyDraft(block));
    setEditorVisible(true);
  };

  const openEditExercise = (exercise: Exercise) => {
    setEditingExerciseId(exercise.id);
    setDraft({
      block: (exercise.block as Block) || block,
      exercise_name: exercise.exercise_name ?? "",
      drill_id: exercise.drill_id ?? "",
      sets: exercise.sets ?? "",
      reps: exercise.reps ?? "",
      rest: exercise.rest ?? "",
      month_focus: exercise.month_focus ?? "",
      video_url: exercise.video?.url ?? "",
      video_title: exercise.video?.title ?? "",
    });
    setEditorVisible(true);
  };

  const closeEditor = () => {
    setEditorVisible(false);
    setEditingExerciseId(null);
    setDraft(emptyDraft(block));
  };

  const saveExercise = async () => {
    if (!draft.exercise_name.trim()) {
      Alert.alert("Nome obbligatorio", "Inserisci il nome dell'esercizio.");
      return;
    }

    setSavingExercise(true);
    const payload = {
      block: draft.block,
      exercise_name: draft.exercise_name.trim(),
      drill_id: draft.drill_id.trim() || null,
      sets: draft.sets.trim() || null,
      reps: draft.reps.trim() || null,
      rest: draft.rest.trim() || null,
      month_focus: draft.month_focus.trim() || null,
    };

    try {
      if (editingExerciseId) {
        await apiPatch(`/training/exercises/${editingExerciseId}`, payload);
      } else {
        await apiPost("/training/exercises", payload);
      }

      if (draft.video_url?.trim()) {
        await apiPost("/training/video-links", {
          exercise_name: draft.exercise_name.trim(),
          url: draft.video_url.trim(),
          title: draft.video_title?.trim() || draft.exercise_name.trim(),
        });
      }

      closeEditor();
      if (draft.block !== block) {
        await onSelectBlock(draft.block);
      } else {
        await loadBlock(block);
      }
    } catch (e: any) {
      Alert.alert("Errore", e.message);
    } finally {
      setSavingExercise(false);
    }
  };

  const deleteExercise = (exercise: Exercise) => {
    Alert.alert("Elimina esercizio", `Vuoi rimuovere ${exercise.exercise_name}?`, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Elimina",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/training/exercises/${exercise.id}`);
            await loadBlock(block);
          } catch (e: any) {
            Alert.alert("Errore", e.message);
          }
        },
      },
    ]);
  };

  const openVideo = (exercise: Exercise) => {
    if (!exercise.video?.url) return;
    setVideoTitle(exercise.video.title || exercise.exercise_name);
    setVideoUrl(toInAppUrl(exercise.video.url));
    setVideoExercise(exercise);
  };

  const completeTraining = () => {
    Alert.alert("Allenamento completato?", "Segna la sessione corrente come chiusa.", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Conferma",
        onPress: async () => {
          setCompleting(true);
          try {
            await apiPost("/training/complete");
            setCompleted(true);
          } catch (e: any) {
            Alert.alert("Errore", e.message);
          } finally {
            setCompleting(false);
          }
        },
      },
    ]);
  };

  const renderFreeTrainingSection = () => (
    <GlassCard style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <View>
          <Eyebrow text="Free Training Log" tone="secondary" />
          <Text style={{ color: Colors.textPrimary, fontSize: 18, fontFamily: Fonts.headlineBold }}>
            Allenamenti liberi
          </Text>
        </View>
        <Pill label={`${freeLogs.length} recenti`} tone="neutral" />
      </View>
      <TextInput
        value={freeLogNote}
        onChangeText={setFreeLogNote}
        placeholder="50 flessioni, 3km corsa, yoga 20min..."
        placeholderTextColor={Colors.textMuted}
        multiline
        style={{
          backgroundColor: Colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.ghostBorder,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: Colors.textPrimary,
          fontSize: 14,
          fontFamily: Fonts.bodyRegular,
          minHeight: 72,
          textAlignVertical: "top",
          marginBottom: 10,
        }}
      />
      <AccentButton
        tone="secondary"
        label={savingFreeLog ? "Salvando..." : "Log Free Session"}
        disabled={!freeLogNote.trim() || savingFreeLog}
        onPress={async () => {
          setSavingFreeLog(true);
          try {
            await apiPost("/training/free-log", { note: freeLogNote.trim(), date: new Date().toISOString().split("T")[0] });
            setFreeLogNote("");
            await Promise.all([loadFreeLogs(), loadTrainingStatus()]);
            Alert.alert("✓", "Sessione libera loggata.");
          } catch (e: any) {
            Alert.alert("Errore", e.message);
          } finally {
            setSavingFreeLog(false);
          }
        }}
      />
      <View style={{ marginTop: 16, gap: 8 }}>
        {loadingFreeLogs ? (
          <ActivityIndicator color={Colors.primary} />
        ) : freeLogs.length === 0 ? (
          <Text style={{ color: Colors.textSecondary, fontSize: 14, lineHeight: 22, fontFamily: Fonts.bodyRegular }}>
            Ancora nessun allenamento libero salvato. Quando lo scrivi in chat o qui, comparirà in questa lista.
          </Text>
        ) : (
          freeLogs.map((log) => (
            <View
              key={log.id}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: Colors.ghostBorder,
                backgroundColor: Colors.surface,
                padding: 12,
                flexDirection: "row",
                gap: 12,
              }}
            >
              <View style={{ alignItems: "center", minWidth: 44 }}>
                <MaterialIcons name="directions-run" size={18} color={Colors.primary} />
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 4, fontFamily: Fonts.monoRegular }}>
                  {formatLogDate(log.date)}
                </Text>
              </View>
              <Text style={{ flex: 1, color: Colors.textSecondary, fontSize: 14, lineHeight: 21, fontFamily: Fonts.bodyRegular }}>
                {log.note}
              </Text>
            </View>
          ))
        )}
      </View>
    </GlassCard>
  );

  return (
    <ScreenShell>
      <ScreenHeader
        title="Training"
        onBack={() => navigation.goBack()}
        right={<Pill label={completed ? "Session Closed" : "Live Session"} active={completed} tone={completed ? "primary" : "tertiary"} />}
      />

      <GlassCard accent style={{ marginBottom: 16, overflow: "hidden", padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Eyebrow text={`Block ${block} / Today`} tone="primary" />
          <MaterialIcons name="fitness-center" size={18} color={Colors.primary} style={{ opacity: 0.5 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {BLOCKS.map((blockItem) => (
            <Pill key={blockItem} label={`Block ${blockItem}`} active={blockItem === block} onPress={() => onSelectBlock(blockItem)} />
          ))}
          <Pill label="+ Exercise" tone="secondary" onPress={openCreateExercise} />
          <Pill
            label={uploadingDoc ? "Uploading..." : "📎 Upload Plan"}
            tone="tertiary"
            onPress={uploadingDoc ? undefined : uploadBlockDocument}
            icon={<MaterialIcons name="upload-file" size={13} color={Colors.tertiary} />}
          />
        </View>
      </GlassCard>

      {error ? (
        <GlassCard style={{ marginBottom: 12 }}>
          <Eyebrow text="Connection Issue" tone="secondary" />
          <Text style={{ color: Colors.error, fontFamily: Fonts.bodyMedium }}>{error}</Text>
        </GlassCard>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={{ color: Colors.textSecondary, marginTop: 12, fontFamily: Fonts.bodyRegular }}>Loading exercises...</Text>
        </View>
      ) : exercises.length === 0 ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <GlassCard accent style={{ alignItems: "flex-start" }}>
            <Eyebrow text={`Block ${block} Empty`} tone="secondary" />
            <Text style={{ color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.headlineBold, marginBottom: 10 }}>
              Nessun esercizio configurato.
            </Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 24, marginBottom: 16, fontFamily: Fonts.bodyRegular }}>
              Aggiungi manualmente un esercizio e usa questa schermata come vero editor del piano, non solo come viewer.
            </Text>
            <AccentButton label="Create First Exercise" onPress={openCreateExercise} />
          </GlassCard>
          {renderFreeTrainingSection()}
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(exercise) => exercise.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
          renderItem={({ item }) => (
            <ExerciseCard exercise={item} onVideo={() => openVideo(item)} onEdit={() => openEditExercise(item)} onDelete={() => deleteExercise(item)} />
          )}
          ListFooterComponent={
            <View style={{ marginTop: 20, gap: 12 }}>
              <AccentButton
                label="+ Add Exercise"
                onPress={openCreateExercise}
                tone="secondary"
              />
              <AccentButton
                label={completing ? "Closing Session..." : completed ? "Session Completed" : "Mark As Completed"}
                onPress={completeTraining}
                disabled={completed || completing}
              />
              {renderFreeTrainingSection()}
            </View>
          }
        />
      )}

      <EditorModal
        visible={editorVisible}
        draft={draft}
        saving={savingExercise}
        title={editingExerciseId ? "Update Exercise" : "Create Exercise"}
        onClose={closeEditor}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSave={saveExercise}
      />

      <VideoModal
        visible={!!videoUrl}
        title={videoTitle}
        url={videoUrl}
        onClose={() => {
          setVideoUrl(null);
          setVideoExercise(null);
        }}
        onReplace={videoExercise ? () => {
          const exercise = videoExercise;
          setVideoUrl(null);
          setVideoExercise(null);
          openEditExercise(exercise);
        } : undefined}
      />
    </ScreenShell>
  );
}
