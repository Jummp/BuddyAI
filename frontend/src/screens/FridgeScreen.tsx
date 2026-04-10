import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../constants/colors";
import { apiGet, apiPost, apiDelete } from "../services/api";

type FridgeItem = { id: string; name: string; quantity: number; unit: string; updated_at: string };

const UNITS = ["g", "kg", "ml", "L", "pz", "tazze"];

export default function FridgeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("g");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await apiGet<FridgeItem[]>("/nutrition/fridge");
      setItems(data);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openAdd = () => {
    setNewName("");
    setNewQty("1");
    setNewUnit("g");
    setShowModal(true);
  };

  const saveItem = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/nutrition/fridge", {
        name: newName.trim(),
        quantity: parseFloat(newQty) || 1,
        unit: newUnit,
      });
      setShowModal(false);
      await load();
    } catch {
      Alert.alert("Errore", "Impossibile salvare l'elemento");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = (item: FridgeItem) => {
    Alert.alert("Rimuovi", `Rimuovere "${item.name}"?`, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Rimuovi",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/nutrition/fridge/${item.id}`);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          } catch {
            Alert.alert("Errore", "Impossibile rimuovere");
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.black }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => navigation.goBack()} style={{ marginRight: 12 }} accessibilityRole="button">
            <Text style={{ color: Colors.primary, fontSize: 18 }}>←</Text>
          </Pressable>
          <Text style={{ color: Colors.textPrimary, fontSize: 22, fontWeight: "700" }}>Frigo</Text>
        </View>
        <Pressable
          onPress={openAdd}
          style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Aggiungi ingrediente"
        >
          <Text style={{ color: Colors.black, fontWeight: "700", fontSize: 15 }}>+ Aggiungi</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "500" }}>{item.name}</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{item.quantity} {item.unit}</Text>
            </View>
            <Pressable
              onPress={() => onRemove(item)}
              style={{ padding: 8 }}
              accessibilityLabel={`Rimuovi ${item.name}`}
              accessibilityRole="button"
            >
              <Text style={{ color: Colors.error, fontSize: 20 }}>−</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !refreshing ? (
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 16 }}>Frigo vuoto</Text>
              <Pressable
                onPress={openAdd}
                style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                accessibilityRole="button"
              >
                <Text style={{ color: Colors.black, fontWeight: "700" }}>+ Aggiungi ingrediente</Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {/* Add Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={{ backgroundColor: Colors.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: "700", marginBottom: 20 }}>
              Aggiungi ingrediente
            </Text>

            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Nome</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="es. Pollo, Mozzarella..."
              placeholderTextColor={Colors.textSecondary}
              autoFocus
              style={{ backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: Colors.textPrimary, fontSize: 16, marginBottom: 16 }}
            />

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Quantità</Text>
                <TextInput
                  value={newQty}
                  onChangeText={setNewQty}
                  keyboardType="numeric"
                  style={{ backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: Colors.textPrimary, fontSize: 16 }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Unità</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {UNITS.map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => setNewUnit(u)}
                      style={{ backgroundColor: newUnit === u ? Colors.primary : Colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                    >
                      <Text style={{ color: newUnit === u ? Colors.black : Colors.textSecondary, fontWeight: "600", fontSize: 13 }}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setShowModal(false)}
                style={{ flex: 1, borderRadius: 12, padding: 14, backgroundColor: Colors.surface, alignItems: "center" }}
              >
                <Text style={{ color: Colors.textSecondary, fontWeight: "600" }}>Annulla</Text>
              </Pressable>
              <Pressable
                onPress={saveItem}
                disabled={saving || !newName.trim()}
                style={{ flex: 2, borderRadius: 12, padding: 14, backgroundColor: !newName.trim() ? Colors.surface : Colors.primary, alignItems: "center" }}
              >
                <Text style={{ color: Colors.black, fontWeight: "700" }}>{saving ? "Salvo..." : "Salva"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
