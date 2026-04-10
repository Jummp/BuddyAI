export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
};

export type TabParamList = {
  Chat: undefined;
  Dashboard: undefined;
  Journal: undefined;
  Impostazioni: undefined;
};

export type DashboardStackParamList = {
  DashboardHome: undefined;
  TrainingDetail: undefined;
  HabitList: undefined;
  HabitDetail: { habitId?: string };
  Nutrition: undefined;
  Fridge: undefined;
  MealSuggestion: undefined;
};
