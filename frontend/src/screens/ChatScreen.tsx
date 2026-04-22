import React, { useMemo, useRef, useState } from "react";
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  Text,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Image,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { useChatStore, Message } from "../store/chatStore";
import { API_BASE, apiPost } from "../services/api";

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");
}

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

function nowLabel(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Attachment = {
  uri: string;
  name: string;
  type: string;
  isImage: boolean;
};

type DisplayMessage = Message & {
  metaLabel: string;
  chips?: string[];
  kind?: "placeholder" | "live";
};

function MetaRow({ label, accent }: { label: string; accent?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
      <Text
        style={{
          color: accent ?? Colors.textMuted,
          fontSize: 10,
          fontFamily: Fonts.headlineBold,
          letterSpacing: 1.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Chip({ text, color = Colors.tertiary }: { text: string; color?: string }) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface3,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginRight: 6,
        marginTop: 8,
      }}
    >
      <Text
        style={{
          color,
          fontSize: 10,
          fontFamily: Fonts.monoMedium,
          letterSpacing: 0.9,
          textTransform: "uppercase",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function MessageCard({ item }: { item: DisplayMessage }) {
  const isAssistant = item.role === "assistant";
  const bubbleStyle = isAssistant
    ? {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: "rgba(161,255,194,0.18)",
        borderRadius: 14,
      }
    : {
        backgroundColor: "rgba(161,255,194,0.08)",
        borderRightWidth: 2,
        borderRightColor: Colors.primary,
        borderRadius: 14,
      };

  return (
    <View
      style={{
        alignSelf: isAssistant ? "flex-start" : "flex-end",
        width: "100%",
        maxWidth: isAssistant ? "88%" : "82%",
        marginBottom: 18,
      }}
      >
        <MetaRow
          label={
            isAssistant
              ? item.kind === "placeholder"
              ? "PandorAI // online"
              : "PandorAI // executing"
            : `${item.metaLabel} // sent`
        }
        accent={isAssistant ? "rgba(161,255,194,0.62)" : Colors.textMuted}
      />
      <View
        style={{
          padding: 16,
          shadowColor: isAssistant ? Colors.primary : Colors.primaryDark,
          shadowOpacity: isAssistant ? 0.14 : 0.12,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 0 },
          ...bubbleStyle,
        }}
      >
        <Text
          selectable
          style={{
            color: Colors.textPrimary,
            fontSize: 16,
            lineHeight: 24,
            fontFamily: isAssistant ? Fonts.bodyRegular : Fonts.bodyMedium,
          }}
        >
          {isAssistant ? stripMd(item.content) : item.content}
          {item.streaming ? "▌" : ""}
        </Text>
        {!!item.chips?.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            {item.chips.map((chip) => (
              <Chip key={chip} text={chip} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timestampsRef = useRef<Record<string, string>>({});
  const {
    messages,
    isStreaming,
    addUserMessage,
    startAssistantMessage,
    appendToken,
    finalizeMessage,
    setStreaming,
  } = useChatStore();
  const listRef = useRef<FlatList>(null);

  const displayMessages = useMemo<DisplayMessage[]>(() => {
    const intro: DisplayMessage = {
      id: "intro",
      role: "assistant",
      content:
        "Sistema inizializzato. Memoria attiva, coaching pronto, flusso cloud stabile. Dimmi cosa vuoi fare oggi.",
      metaLabel: "PandorAI // online",
      chips: ["#memory_active", "#cloud_run_ok"],
      kind: "placeholder",
    };

    const mapped = messages.map((message) => ({
      ...message,
      metaLabel: timestampsRef.current[message.id] ?? nowLabel(),
      kind: "live" as const,
    }));

    return [intro, ...mapped];
  }, [messages]);

  const isTransientError = (error: unknown) => {
    const message = String(error ?? "").toLowerCase();
    return (
      message.includes("network request failed") ||
      message.includes("failed to fetch") ||
      message.includes("richiesta scaduta") ||
      message.includes("timeout")
    );
  };

  const processStream = async (raw: string, aiId: string) => {
    const lines = raw.split("\n\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "token") appendToken(aiId, event.content);
        if (event.type === "done") break;
      } catch {}
    }
  };

  const send = async (text: string) => {
    if ((!text.trim() && !attachment) || isStreaming) return;
    const currentAttachment = attachment;
    setInput("");
    setAttachment(null);

    const userLabel = currentAttachment
      ? `${text.trim() ? `${text.trim()} ` : ""}[${currentAttachment.name}]`
      : text;
    const userId = addUserMessage(userLabel);
    timestampsRef.current[userId] = nowLabel();
    setStreaming(true);
    const aiId = startAssistantMessage();
    timestampsRef.current[aiId] = nowLabel();

    try {
      let res: Response;
      if (currentAttachment) {
        const formData = new FormData();
        if (text.trim()) formData.append("text", text.trim());
        formData.append("file", {
          uri: currentAttachment.uri,
          name: currentAttachment.name,
          type: currentAttachment.type,
        } as any);
        res = await fetch(`${API_BASE}/chat/upload`, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`upload ${res.status}`);
        const raw = await res.text();
        await processStream(raw, aiId);
      } else {
        const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let data;
        try {
          data = await apiPost<{ content: string }>(
            "/chat/mobile",
            {
              text,
              client_message_id: clientMessageId,
            },
            { retry: true, timeoutMs: 45000 }
          );
        } catch (error) {
          if (!isTransientError(error)) throw error;
          data = await apiPost<{ content: string }>(
            "/chat/mobile",
            {
              text,
              client_message_id: clientMessageId,
            },
            { retry: true, timeoutMs: 45000 }
          );
        }
        appendToken(aiId, data.content ?? "");
      }
    } catch (error) {
      appendToken(aiId, `\n[${String(error || "Errore di connessione")}]`);
    } finally {
      finalizeMessage(aiId);
      setStreaming(false);
    }
    listRef.current?.scrollToEnd({ animated: true });
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      if (!recordingRef.current) return;
      setTranscribing(true);
      try {
        await recordingRef.current.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        if (!uri) return;
        const formData = new FormData();
        formData.append("audio", { uri, name: "audio.m4a", type: "audio/m4a" } as any);
        const res = await fetch(`${API_BASE}/voice/transcribe`, { method: "POST", body: formData });
        if (res.ok) {
          const { text } = await res.json();
          if (text) setInput(text);
        }
      } catch (e) {
        Alert.alert("Errore trascrizione", String(e));
      } finally {
        setTranscribing(false);
      }
    } else {
      try {
        if (recordingRef.current) {
          try {
            await recordingRef.current.stopAndUnloadAsync();
          } catch {}
          recordingRef.current = null;
        }
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permesso microfono negato");
          return;
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        recordingRef.current = recording;
        setIsRecording(true);
      } catch (e) {
        Alert.alert("Errore microfono", String(e));
      }
    }
  };

  const [scanningFridge, setScanningFridge] = useState(false);

  const scanToFridge = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permesso negato", "Servono i permessi per accedere alla galleria.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setScanningFridge(true);
      const formData = new FormData();
      const ext = asset.uri.split(".").pop() ?? "jpg";
      formData.append("file", { uri: asset.uri, name: `scan.${ext}`, type: `image/${ext}` } as any);
      const res = await fetch(`${API_BASE}/chat/fridge-scan`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Scan fallito");
      const data = await res.json();
      const names = data.added.map((i: any) => `• ${i.name} (${i.quantity} ${i.unit})`).join("\n");
      Alert.alert("✓ Aggiunti al Frigo", names || "Nessun ingrediente trovato");
    } catch (e: any) {
      Alert.alert("Errore", e.message);
    } finally {
      setScanningFridge(false);
    }
  };

  const pickAttachment = () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,.pdf,.doc,.docx";
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event: any) => {
            setAttachment({
              uri: event.target.result,
              name: file.name,
              type: file.type || "application/octet-stream",
              isImage: file.type.startsWith("image/"),
            });
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      return;
    }

    const options = ["Foto dalla galleria", "Scatta foto", "Documento", "Annulla"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3 }, (idx) => handleAttachmentChoice(idx));
    } else {
      Alert.alert("Allega file", "", [
        { text: "Foto dalla galleria", onPress: () => handleAttachmentChoice(0) },
        { text: "Scatta foto", onPress: () => handleAttachmentChoice(1) },
        { text: "Documento", onPress: () => handleAttachmentChoice(2) },
        { text: "Annulla", style: "cancel" },
      ]);
    }
  };

  const handleAttachmentChoice = async (idx: number) => {
    try {
      if (idx === 0) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permesso negato", "Servono i permessi per accedere alla galleria.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          const ext = asset.uri.split(".").pop() ?? "jpg";
          setAttachment({
            uri: asset.uri,
            name: `photo.${ext}`,
            type: asset.mimeType ?? `image/${ext}`,
            isImage: true,
          });
        }
      } else if (idx === 1) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permesso negato", "Servono i permessi per usare la fotocamera.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          const ext = asset.uri.split(".").pop() ?? "jpg";
          setAttachment({
            uri: asset.uri,
            name: `photo.${ext}`,
            type: asset.mimeType ?? `image/${ext}`,
            isImage: true,
          });
        }
      } else if (idx === 2) {
        try {
          const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setAttachment({
              uri: asset.uri,
              name: asset.name,
              type: asset.mimeType ?? "application/octet-stream",
              isImage: false,
            });
          }
        } catch (err) {
          Alert.alert("Errore", "Impossibile selezionare il documento.");
        }
      }
    } catch (err) {
      Alert.alert("Errore", "Qualcosa è andato storto.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
    >
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: Colors.ghostBorder,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: Colors.background,
          shadowColor: Colors.primary,
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              backgroundColor: Colors.surface3,
              marginRight: 10,
              borderWidth: 1,
              borderColor: "rgba(161,255,194,0.22)",
              shadowColor: Colors.primary,
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="psychology" size={16} color={Colors.primary} />
          </View>
          <Text style={{ color: Colors.primary, fontSize: 22, fontFamily: Fonts.headlineBold }}>PandorAI</Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: Colors.surface3,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "rgba(81,65,102,0.25)",
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: Colors.primary, marginRight: 8 }} />
          <Text
            style={{
              color: Colors.primary,
              fontSize: 10,
              fontFamily: Fonts.headlineBold,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            Connection Stable
          </Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 22,
          paddingBottom: 18,
          width: "100%",
          maxWidth: Platform.OS === "web" ? 820 : undefined,
          alignSelf: "center",
        }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <MessageCard item={item} />}
        ListFooterComponent={
          isStreaming ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={{ color: Colors.textSecondary, marginLeft: 8, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>
                PandorAI sta scrivendo
              </Text>
            </View>
          ) : null
        }
      />

      {attachment && (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: Colors.overlay,
            borderRadius: 14,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderWidth: 1,
            borderColor: Colors.ghostBorder,
            shadowColor: Colors.primary,
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 0 },
            width: "100%",
            maxWidth: Platform.OS === "web" ? 820 : undefined,
            alignSelf: "center",
          }}
        >
          {attachment.isImage ? <Image source={{ uri: attachment.uri }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : <Text style={{ fontSize: 26 }}>📄</Text>}
          <Text style={{ color: Colors.textPrimary, fontSize: 13, flex: 1 }} numberOfLines={1}>
            {attachment.name}
          </Text>
          <Pressable
            onPress={() => setAttachment(null)}
            hitSlop={12}
            style={{ backgroundColor: Colors.surface3, borderRadius: 8, padding: 6 }}
          >
            <MaterialIcons name="close" size={18} color={Colors.textPrimary} />
          </Pressable>
        </View>
      )}

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 10,
          backgroundColor: Colors.background,
          width: "100%",
          maxWidth: Platform.OS === "web" ? 852 : undefined,
          alignSelf: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: Colors.overlay,
            borderRadius: 16,
            padding: 10,
            borderWidth: 1,
            borderColor: Colors.ghostBorder,
            shadowColor: Colors.primary,
            shadowOpacity: 0.12,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Pressable
            onPress={pickAttachment}
            disabled={isStreaming || isRecording}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: Colors.surface3,
              borderWidth: 1,
              borderColor: "rgba(81,65,102,0.2)",
              opacity: isStreaming || isRecording ? 0.4 : pressed ? 0.7 : 1,
            })}
            accessibilityLabel="Allega file"
            accessibilityRole="button"
          >
            <MaterialIcons name="attach-file" size={24} color={Colors.primary} />
          </Pressable>

          <Pressable
            onPress={scanToFridge}
            disabled={isStreaming || isRecording || scanningFridge}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: Colors.surface3,
              borderWidth: 1,
              borderColor: "rgba(81,65,102,0.2)",
              opacity: isStreaming || isRecording || scanningFridge ? 0.4 : pressed ? 0.7 : 1,
            })}
            accessibilityLabel="Scansiona al frigo"
            accessibilityRole="button"
          >
            {scanningFridge
              ? <ActivityIndicator size="small" color={Colors.secondary} />
              : <MaterialIcons name="kitchen" size={22} color={Colors.secondary} />}
          </Pressable>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? "Registrazione in corso..." : attachment ? "Aggiungi contesto..." : "Type your command..."}
            placeholderTextColor={Colors.textMuted}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              paddingHorizontal: 8,
              paddingVertical: 8,
              color: Colors.textPrimary,
              fontSize: 15,
              maxHeight: 120,
              fontFamily: Fonts.bodyRegular,
            }}
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
            editable={!isStreaming && !isRecording}
            multiline
            blurOnSubmit
          />

          <Pressable
            onPress={toggleRecording}
            disabled={isStreaming || transcribing}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isRecording ? Colors.error : Colors.surface3,
              borderWidth: 1,
              borderColor: "rgba(81,65,102,0.2)",
              opacity: isStreaming || transcribing ? 0.4 : pressed ? 0.7 : 1,
            })}
            accessibilityLabel={isRecording ? "Ferma registrazione" : "Inizia registrazione"}
            accessibilityRole="button"
          >
            {transcribing ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="mic" size={24} color={isRecording ? Colors.background : Colors.primary} />}
          </Pressable>

          <Pressable
            onPress={() => send(input)}
            disabled={isStreaming || (!input.trim() && !attachment) || isRecording}
            style={({ pressed }) => ({
              minWidth: 76,
              height: 40,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isStreaming || (!input.trim() && !attachment) || isRecording ? Colors.surface3 : Colors.primary,
              shadowColor: Colors.primary,
              shadowOpacity: isStreaming || (!input.trim() && !attachment) || isRecording ? 0 : 0.25,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 0 },
              opacity: pressed ? 0.8 : 1,
            })}
            accessibilityLabel="Invia messaggio"
            accessibilityRole="button"
          >
            <Text
              style={{
                color: isStreaming || (!input.trim() && !attachment) || isRecording ? Colors.textSecondary : Colors.textPrimaryOnAccent,
                fontSize: 11,
                fontFamily: Fonts.headlineBold,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              Send →
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
