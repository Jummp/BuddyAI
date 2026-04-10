import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TabNavigator from "./TabNavigator";
import OnboardingScreen from "../screens/OnboardingScreen";

const ONBOARDING_KEY = "buddyai_onboarding_done";

export default function RootNavigator() {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setShowOnboarding(val !== "1");
      setReady(true);
    });
  }, []);

  const onOnboardingDone = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  };

  if (!ready) return null;

  if (showOnboarding) {
    return <OnboardingScreen onDone={onOnboardingDone} />;
  }

  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}
