import React from "react";
import { Platform, Pressable, ScrollView, Text, View, ViewStyle } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";

export function ScreenShell({
  children,
  scroll = false,
  contentStyle,
  padded = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const content = (
    <View
      style={{
        flex: scroll ? undefined : 1,
        width: "100%",
        maxWidth: Platform.OS === "web" ? 920 : undefined,
        alignSelf: "center",
        paddingHorizontal: padded ? 20 : 0,
        paddingTop: insets.top + 14,
        paddingBottom: scroll ? 40 : 0,
        ...contentStyle,
      }}
    >
      {children}
    </View>
  );

  if (scroll) {
    return <ScrollView style={{ flex: 1, backgroundColor: Colors.background }}>{content}</ScrollView>;
  }

  return <View style={{ flex: 1, backgroundColor: Colors.background }}>{content}</View>;
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={onBack ?? undefined}
            disabled={!onBack}
            hitSlop={16}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              backgroundColor: Colors.surface3,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: Colors.ghostBorder,
              paddingHorizontal: 10,
              paddingVertical: 6,
              marginBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {onBack ? (
              <MaterialIcons name="arrow-back" size={22} color={Colors.primary} />
            ) : (
              <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: Colors.primary }} />
            )}
            {!onBack && (
              <Text
                style={{
                  color: Colors.primary,
                  fontSize: 10,
                  fontFamily: Fonts.headlineBold,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                }}
              >
                PandorAI Module
              </Text>
            )}
          </Pressable>
          <Text style={{ color: Colors.textPrimary, fontSize: 34, lineHeight: 36, fontFamily: Fonts.headlineBold }}>
            {title}
          </Text>
          {!!subtitle && (
            <Text
              style={{
                color: Colors.textSecondary,
                fontSize: 15,
                lineHeight: 23,
                marginTop: 8,
                maxWidth: 520,
                fontFamily: Fonts.bodyRegular,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>
    </View>
  );
}

export function GlassCard({
  children,
  style,
  accent = false,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: "rgba(48, 26, 77, 0.72)",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: accent ? "rgba(161,255,194,0.18)" : Colors.ghostBorder,
        padding: 18,
        shadowColor: accent ? Colors.primary : Colors.secondary,
        shadowOpacity: accent ? 0.1 : 0.06,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 0 },
        ...style,
      }}
    >
      {children}
    </View>
  );
}

export function Eyebrow({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "primary" | "secondary" | "tertiary";
}) {
  const color =
    tone === "primary"
      ? Colors.primary
      : tone === "secondary"
      ? Colors.secondary
      : tone === "tertiary"
      ? Colors.tertiary
      : Colors.textSecondary;

  return (
    <Text
      style={{
        color,
        fontSize: 10,
        fontFamily: Fonts.headlineBold,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {text}
    </Text>
  );
}

export function Pill({
  label,
  active = false,
  onPress,
  tone = "primary",
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: "primary" | "secondary" | "tertiary" | "neutral";
  icon?: React.ReactNode;
}) {
  const fg =
    tone === "secondary"
      ? Colors.secondary
      : tone === "tertiary"
      ? Colors.tertiary
      : tone === "neutral"
      ? Colors.textSecondary
      : Colors.primary;

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: active ? fg : Colors.surface3,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? fg : Colors.ghostBorder,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      {icon}
      <Text
        style={{
          color: active ? Colors.textPrimaryOnAccent : fg,
          fontSize: 11,
          fontFamily: Fonts.headlineBold,
          letterSpacing: 1.1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}

export function AccentButton({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "surface";
}) {
  const backgroundColor =
    tone === "secondary" ? Colors.secondary : tone === "surface" ? Colors.surface3 : Colors.primary;
  const textColor = tone === "surface" ? Colors.textPrimary : Colors.textPrimaryOnAccent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: disabled ? Colors.surface3 : backgroundColor,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed || disabled ? 0.72 : 1,
      })}
    >
      <Text
        style={{
          color: disabled ? Colors.textMuted : textColor,
          fontSize: 12,
          fontFamily: Fonts.headlineBold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FieldLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        color: Colors.textSecondary,
        fontSize: 10,
        fontFamily: Fonts.headlineBold,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {text}
    </Text>
  );
}
