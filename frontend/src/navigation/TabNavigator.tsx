import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { TabParamList, DashboardStackParamList } from "./types";

import ChatScreen from "../screens/ChatScreen";
import DashboardScreen from "../screens/DashboardScreen";
import JournalScreen from "../screens/JournalScreen";
import ImpostazioniScreen from "../screens/ImpostazioniScreen";
import TrainingDetailScreen from "../screens/TrainingDetailScreen";
import HabitListScreen from "../screens/HabitListScreen";
import HabitDetailScreen from "../screens/HabitDetailScreen";
import NutritionScreen from "../screens/NutritionScreen";
import FridgeScreen from "../screens/FridgeScreen";

const Tab = createBottomTabNavigator<TabParamList>();
const DashStack = createNativeStackNavigator<DashboardStackParamList>();

function DashboardStack() {
  return (
    <DashStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.black } }}>
      <DashStack.Screen name="DashboardHome" component={DashboardScreen} />
      <DashStack.Screen name="TrainingDetail" component={TrainingDetailScreen} />
      <DashStack.Screen name="HabitList" component={HabitListScreen} />
      <DashStack.Screen name="HabitDetail" component={HabitDetailScreen} />
      <DashStack.Screen name="Nutrition" component={NutritionScreen} />
      <DashStack.Screen name="Fridge" component={FridgeScreen} />
    </DashStack.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface2,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
            Chat: "mic",
            Dashboard: "grid-outline",
            Journal: "book-outline",
            Impostazioni: "settings-outline",
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Chat" component={ChatScreen} options={{ tabBarLabel: "Chat" }} />
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ tabBarLabel: "Dashboard" }} />
      <Tab.Screen name="Journal" component={JournalScreen} options={{ tabBarLabel: "Journal" }} />
      <Tab.Screen name="Impostazioni" component={ImpostazioniScreen} options={{ tabBarLabel: "Impostazioni" }} />
    </Tab.Navigator>
  );
}
