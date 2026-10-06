// Foundation public-schema contract, aligned with the versioned SQL migrations.
// Regenerate the complete Supabase schema with pnpm db:types once a local stack is available.
import { type Json } from "@/lib/types";

type ProfileRow = {
  id: string; user_id: string; role: "user" | "admin";
  display_name: string | null; date_of_birth: string | null; sex: string | null;
  unit_system: string; created_at: string; updated_at: string;
  height_cm: number | null; weight_kg: number | null; waist_cm: number | null;
  fitness_level: string | null; primary_goal: string | null; secondary_goal: string | null;
  training_days_per_week: number | null; preferred_session_minutes: number | null;
  training_location: string | null; onboarding_completed_at: string | null;
};
type HealthRow = { user_id: string; status: string; restrictions: string[]; notes: string; updated_at: string };
type EquipmentRow = { user_id: string; equipment_type: string };
type DraftRow = { user_id: string; draft_json: Json; updated_at: string };
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };
export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, { user_id: string } & Partial<Omit<ProfileRow, "user_id">>>;
      health_profiles: Table<HealthRow, { user_id: string; status: string } & Partial<Omit<HealthRow, "user_id" | "status">>>;
      user_equipment: Table<EquipmentRow, EquipmentRow>;
      onboarding_drafts: Table<DraftRow, { user_id: string; draft_json: Json; updated_at?: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      save_foundation_profile: { Args: { payload: Json }; Returns: undefined };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { user_role: "user" | "admin" };
    CompositeTypes: { [_ in never]: never };
  };
};
