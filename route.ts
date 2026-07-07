import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { PRIMEFIT_SYSTEM_PROMPT, planSchemaDescription } from "@/lib/ai/prompts";

const requestSchema = z.object({
  onboarding: z.record(z.unknown()).default({}),
  recentProgress: z.record(z.unknown()).default({})
});

const fallbackPlan = {
  plan_name: "Beginner Fat Loss and Strength Plan",
  duration_weeks: 4,
  goal: "fat_loss_and_muscle_gain",
  weekly_schedule: [
    {
      day: "Monday",
      type: "strength",
      focus: "full_body",
      estimated_duration_minutes: 45,
      warmup: ["6 minute easy walk", "Cat-cow x 8", "Sit-to-stand x 8"],
      exercises: [
        { name: "Goblet box squat", sets: 3, reps: "8", rpe: 6, rest_seconds: 90, substitution: "Sit-to-stand" },
        { name: "Band row", sets: 3, reps: "10", rpe: 6, rest_seconds: 75, substitution: "Seated row machine" },
        { name: "Dumbbell floor press", sets: 3, reps: "8", rpe: 6, rest_seconds: 90, substitution: "Wall push-up" }
      ],
      cooldown: ["Hip flexor stretch", "Cooldown breathing"]
    }
  ],
  progression_rules: {
    load_increase: "Increase load by 2.5-5% only when all sets are completed comfortably with no joint pain.",
    deload: "Reduce volume by 30-40% every 4-6 weeks or when recovery score is low."
  },
  safety_notes: ["Stop and seek medical guidance for chest pain, dizziness, severe breathlessness, or sharp pain."]
};

export async function POST(request: Request) {
  const body = requestSchema.parse(await request.json());

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(fallbackPlan);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PRIMEFIT_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate a 4-week starting workout and nutrition support plan.",
          schema: planSchemaDescription,
          onboarding: body.onboarding,
          recentProgress: body.recentProgress
        })
      }
    ]
  });

  const content = completion.choices[0]?.message.content ?? JSON.stringify(fallbackPlan);
  return NextResponse.json(JSON.parse(content));
}
