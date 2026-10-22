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
  training_location: string | null; reviewed_context_revision: number; onboarding_completed_at: string | null;
};
type HealthRow = { user_id: string; status: string; restrictions: string[]; notes: string; updated_at: string };
type EquipmentRow = { user_id: string; equipment_type: string };
type DraftRow = { user_id: string; draft_json: Json; updated_at: string };
type WorkoutLogRow = { id: string; catalogue_version_id: string | null; user_id: string; workout_day_id: string | null; performed_at: string; completed: boolean; completed_at: string | null; record_mode: string | null; record_timezone: string | null; prescription_snapshot: Json | null; revision: number; created_at: string; updated_at: string; duration_minutes: number | null; perceived_effort: number | null; pain_notes: string | null };
type SetLogRow = { id: string; user_id: string; workout_log_id: string; workout_exercise_id: string | null; exercise_key: string | null; exercise_name: string | null; set_number: number; reps: number | null; weight: number | null; rpe: number | null; rest_seconds: number | null; created_at: string };
type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };
export type Database = {
  public: {
    Tables: {
      nutrition_entries: Table<{ id:string; user_id:string; kind:string; logged_on:string; timezone:string; description:string|null; protein_tenths:number|null; water_ml:number|null; revision:number; created_at:string; updated_at:string }, never>;
      workout_logs: Table<WorkoutLogRow, { user_id: string } & Partial<WorkoutLogRow>>;
      exercise_set_logs: Omit<Table<SetLogRow, { user_id: string; workout_log_id: string; set_number: number } & Partial<SetLogRow>>, "Relationships"> & { Relationships: [{ foreignKeyName: "set_log_owner"; columns: ["user_id", "workout_log_id"]; isOneToOne: false; referencedRelation: "workout_logs"; referencedColumns: ["user_id", "id"] }] };
      profiles: Table<ProfileRow, { user_id: string } & Partial<Omit<ProfileRow, "user_id">>>;
      health_profiles: Table<HealthRow, { user_id: string; status: string } & Partial<Omit<HealthRow, "user_id" | "status">>>;
      user_equipment: Table<EquipmentRow, EquipmentRow>;
      onboarding_drafts: Table<DraftRow, { user_id: string; draft_json: Json; updated_at?: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      read_nutrition_day: { Args: { payload: Json }; Returns: Json };
      mutate_nutrition_record: { Args: { payload: Json }; Returns: Json };
      reviewed_workout_availability: { Args: Record<string, never>; Returns: Json };
      start_workout_record: { Args: { payload: Json }; Returns: Json };
      save_workout_record: { Args: { payload: Json }; Returns: Json };
      complete_workout_record: { Args: { payload: Json }; Returns: Json };
      save_foundation_profile: { Args: { payload: Json }; Returns: undefined };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { user_role: "user" | "admin" };
    CompositeTypes: { [_ in never]: never };
  };
};
