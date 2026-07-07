export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "user" | "admin";
export type SubscriptionTier = "free" | "pro" | "premium";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

export type Profile = {
  id: string;
  user_id: string;
  role: UserRole;
  display_name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  unit_system: "imperial" | "metric";
  created_at: string;
  updated_at: string;
};

export type WorkoutPlan = {
  id: string;
  user_id: string;
  plan_name: string;
  duration_weeks: number;
  goal: string;
  plan_json: Json;
  active: boolean;
  created_at: string;
};
