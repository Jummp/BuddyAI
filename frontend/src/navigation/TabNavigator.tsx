import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Fonts } from "../constants/typography";
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
          backgroundColor: Colors.background,
          borderTopColor: Colors.ghostBorder,
          borderTopWidth: 1,
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          shadowColor: Colors.primary,
          shadowOpacity: 0.08,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarItemStyle: {
          marginHorizontal: 4,
          borderRadius: 10,
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarIcon: ({ color, focused }) => {
          const size = focused ? 30 : 26;
          if (route.name === "Chat") return <MaterialIcons name="chat" size={size} color={color} />;
          if (route.name === "Dashboard") return <MaterialIcons name="grid-view" size={size} color={color} />;
          if (route.name === "Journal") return <MaterialIcons name="book" size={size} color={color} />;
          return <MaterialIcons name="settings" size={size} color={color} />;
        },
        tabBarActiveBackgroundColor: Colors.surface,
      })}
    >
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Journal" component={JournalScreen} />
      <Tab.Screen name="Impostazioni" component={ImpostazioniScreen} />
    </Tab.Navigator>
  );
}
