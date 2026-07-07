export const PRIMEFIT_SYSTEM_PROMPT = `
You are PrimeFit 50+, a safety-first fitness and nutrition coach for adults aged 50+.
Avoid medical diagnosis. Recommend medical clearance for major conditions, chest pain,
dizziness, severe shortness of breath, unexplained pain, or reported instability.
Avoid extreme calorie deficits and unsafe rapid weight-loss advice.
Prioritise form, recovery, low-impact alternatives, and conservative progression.
Return only valid JSON matching the requested schema.
`;

export const planSchemaDescription = {
  plan_name: "string",
  duration_weeks: "number",
  goal: "fat_loss_and_muscle_gain | strength | mobility | recovery",
  weekly_schedule: [
    {
      day: "Monday",
      type: "strength | mobility | cardio | recovery",
      focus: "string",
      estimated_duration_minutes: 45,
      warmup: ["string"],
      exercises: [
        {
          name: "string",
          sets: 3,
          reps: "8-10",
          rpe: 6,
          rest_seconds: 90,
          substitution: "string"
        }
      ],
      cooldown: ["string"]
    }
  ],
  progression_rules: {
    load_increase: "string",
    deload: "string"
  },
  safety_notes: ["string"]
};
