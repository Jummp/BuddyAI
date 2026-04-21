import React, { useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
import { apiDelete, apiGet, apiPost } from "../services/api";
import { AccentButton, FieldLabel, GlassCard, Pill, ScreenHeader, ScreenShell } from "../components/ui";

type FridgeItem = { id: string; name: string; quantity: number; unit: string; updated_at: string };

const UNITS = ["g", "kg", "ml", "L", "pz", "tazze"];

export default function FridgeScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("g");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await apiGet<FridgeItem[]>("/nutrition/fridge");
      setItems(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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
    } catch (e: any) {
      Alert.alert("Errore", e.message);
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
            setItems((prev) => prev.filter((current) => current.id !== item.id));
          } catch (e: any) {
            Alert.alert("Errore", e.message);
          }
        },
      },
    ]);
  };

  const inputStyle = {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontFamily: Fonts.bodyRegular,
  } as const;

  return (
    <ScreenShell>
      <ScreenHeader
        title="Fridge"
        subtitle="Inventario rapido pensato come supporto diretto ai suggerimenti pasti, con card più premium e meno utilitarie."
        onBack={() => navigation.goBack()}
        right={<Pill label="+ Add Item" tone="secondary" onPress={openAdd} />}
      />

      {error ? (
        <GlassCard style={{ marginBottom: 12 }}>
          <Text style={{ color: Colors.error, fontFamily: Fonts.bodyMedium }}>{error}</Text>
        </GlassCard>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <GlassCard accent style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textPrimary, fontSize: 22, fontFamily: Fonts.headlineBold }}>{item.name}</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 15, marginTop: 8, fontFamily: Fonts.bodyRegular }}>
                  {item.quantity} {item.unit}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 10 }}>
                <Pill label="Stored" tone="tertiary" />
                <Pressable onPress={() => onRemove(item)}>
                  <MaterialIcons name="remove-circle-outline" size={22} color={Colors.error} />
                </Pressable>
              </View>
            </View>
          </GlassCard>
        )}
        ListEmptyComponent={
          !refreshing ? (
            <GlassCard accent>
              <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold, marginBottom: 10 }}>
                Frigo vuoto.
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 24, marginBottom: 16, fontFamily: Fonts.bodyRegular }}>
                Aggiungi ingredienti per rendere i suggerimenti nutrizionali molto più contestuali.
              </Text>
              <AccentButton label="Add Ingredient" onPress={openAdd} />
            </GlassCard>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22 }}>
            <Text style={{ color: Colors.textPrimary, fontSize: 24, fontFamily: Fonts.headlineBold, marginBottom: 16 }}>Add ingredient</Text>

            <FieldLabel text="Name" />
            <TextInput value={newName} onChangeText={setNewName} placeholder="Chicken, mozzarella..." placeholderTextColor={Colors.textMuted} style={[inputStyle, { marginBottom: 14 }]} />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel text="Quantity" />
                <TextInput value={newQty} onChangeText={setNewQty} keyboardType="numeric" style={inputStyle} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel text="Unit" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {UNITS.map((unit) => (
                    <Pill key={unit} label={unit} active={newUnit === unit} onPress={() => setNewUnit(unit)} tone="tertiary" />
                  ))}
                </View>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <View style={{ flex: 1 }}>
                <AccentButton label="Cancel" onPress={() => setShowModal(false)} tone="surface" />
              </View>
              <View style={{ flex: 1 }}>
                <AccentButton label={saving ? "Saving..." : "Save Item"} onPress={saveItem} disabled={saving || !newName.trim()} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenShell>
  );
}
