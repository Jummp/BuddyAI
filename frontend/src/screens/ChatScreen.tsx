import React, { useRef, useState } from "react";
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  Text,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ActionSheetIOS,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Colors } from "../constants/colors";
import { useChatStore } from "../store/chatStore";
import { API_BASE } from "../services/api";

// Strip common markdown that Claude emits
function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1");
}

type Attachment = {
  uri: string;
  name: string;
  type: string; // mime type
  isImage: boolean;
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const {
    messages, isStreaming,
    addUserMessage, startAssistantMessage, appendToken, finalizeMessage, setStreaming,
  } = useChatStore();
  const listRef = useRef<FlatList>(null);

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
      ? `${text.trim() ? text.trim() + " " : ""}[${currentAttachment.name}]`
      : text;
    addUserMessage(userLabel);
    setStreaming(true);
    const aiId = startAssistantMessage();

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
      } else {
        res = await fetch(`${API_BASE}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }
      const raw = await res.text();
      await processStream(raw, aiId);
    } catch {
      appendToken(aiId, "\n[Errore di connessione]");
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
          try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
          recordingRef.current = null;
        }
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permesso microfono negato"); return; }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        recordingRef.current = recording;
        setIsRecording(true);
      } catch (e) {
        Alert.alert("Errore microfono", String(e));
      }
    }
  };

  const pickAttachment = () => {
    const options = ["Foto dalla galleria", "Scatta foto", "Documento", "Annulla"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3 },
        (idx) => handleAttachmentChoice(idx),
      );
    } else {
      // Android: show simple alert with buttons
      Alert.alert("Allega file", "", [
        { text: "Foto dalla galleria", onPress: () => handleAttachmentChoice(0) },
        { text: "Scatta foto", onPress: () => handleAttachmentChoice(1) },
        { text: "Documento", onPress: () => handleAttachmentChoice(2) },
        { text: "Annulla", style: "cancel" },
      ]);
    }
  };

  const handleAttachmentChoice = async (idx: number) => {
    if (idx === 0 || idx === 1) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted" && idx === 0) { Alert.alert("Permesso galleria negato"); return; }
      const result = idx === 0
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
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
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.black }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 12,
        backgroundColor: Colors.black,
      }}>
        <Text style={{ color: Colors.primary, fontSize: 20, fontWeight: "700" }}>PandorAI</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={{
            alignSelf: item.role === "user" ? "flex-end" : "flex-start",
            backgroundColor: item.role === "user" ? Colors.primaryDark : Colors.surface,
            borderRadius: 16,
            padding: 12,
            marginBottom: 8,
            maxWidth: "80%",
          }}>
            <Text
              selectable
              style={{ color: Colors.textPrimary, fontSize: 16, lineHeight: 22 }}
            >
              {item.role === "assistant" ? stripMd(item.content) : item.content}
              {item.streaming ? "▌" : ""}
            </Text>
          </View>
        )}
        ListFooterComponent={
          isStreaming ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={{ color: Colors.textSecondary, marginLeft: 8, fontSize: 14 }}>
                PandorAI sta scrivendo...
              </Text>
            </View>
          ) : null
        }
      />

      {/* Attachment preview */}
      {attachment && (
        <View style={{
          marginHorizontal: 16, marginBottom: 6,
          backgroundColor: Colors.surface, borderRadius: 12, padding: 10,
          flexDirection: "row", alignItems: "center", gap: 10,
        }}>
          {attachment.isImage
            ? <Image source={{ uri: attachment.uri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
            : <Text style={{ fontSize: 28 }}>📄</Text>
          }
          <Text style={{ color: Colors.textPrimary, fontSize: 13, flex: 1 }} numberOfLines={1}>
            {attachment.name}
          </Text>
          <Pressable onPress={() => setAttachment(null)} hitSlop={8}>
            <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* Input bar */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        backgroundColor: Colors.surface2,
        gap: 8,
      }}>
        {/* Attachment button */}
        <Pressable
          onPress={pickAttachment}
          disabled={isStreaming || isRecording}
          style={({ pressed }) => ({
            backgroundColor: Colors.surface,
            borderRadius: 12, padding: 12,
            opacity: (isStreaming || isRecording) ? 0.4 : pressed ? 0.7 : 1,
          })}
          accessibilityLabel="Allega file"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 18 }}>📎</Text>
        </Pressable>

        {/* Voice toggle */}
        <Pressable
          onPress={toggleRecording}
          disabled={isStreaming || transcribing}
          style={({ pressed }) => ({
            backgroundColor: isRecording ? Colors.error : Colors.surface,
            borderRadius: 12, padding: 12,
            opacity: (isStreaming || transcribing) ? 0.4 : pressed ? 0.7 : 1,
          })}
          accessibilityLabel={isRecording ? "Ferma registrazione" : "Inizia registrazione"}
          accessibilityRole="button"
        >
          {transcribing
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Text style={{ fontSize: 18 }}>{isRecording ? "⏹" : "🎤"}</Text>
          }
        </Pressable>

        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={isRecording ? "Registrazione in corso..." : attachment ? "Aggiungi un messaggio..." : "Scrivi un messaggio..."}
          placeholderTextColor={Colors.textSecondary}
          style={{
            flex: 1,
            backgroundColor: Colors.surface,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            color: Colors.textPrimary,
            fontSize: 16,
            maxHeight: 120,
            borderWidth: isRecording ? 1 : 0,
            borderColor: Colors.error,
          }}
          returnKeyType="send"
          onSubmitEditing={() => send(input)}
          editable={!isStreaming && !isRecording}
          multiline
          blurOnSubmit
        />

        <Pressable
          onPress={() => send(input)}
          disabled={isStreaming || (!input.trim() && !attachment) || isRecording}
          style={({ pressed }) => ({
            backgroundColor: (isStreaming || (!input.trim() && !attachment) || isRecording) ? Colors.surface : Colors.primary,
            borderRadius: 12, padding: 12,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityLabel="Invia messaggio"
          accessibilityRole="button"
        >
          <Text style={{ color: Colors.black, fontWeight: "700", fontSize: 16 }}>→</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
