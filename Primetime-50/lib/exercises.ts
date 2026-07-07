export type Exercise = {
  name: string;
  category: string;
  primaryMuscles: string[];
  equipment: string;
  difficulty: "beginner" | "intermediate";
  jointImpact: "low" | "moderate";
  contraindications: string;
  cues: string;
  regression: string;
  progression: string;
};

export const starterExercises: Exercise[] = [
  ["Sit-to-Stand", "strength", ["quads", "glutes"], "chair", "beginner", "low", "Acute knee pain", "Press feet through floor and stand tall.", "Use higher chair", "Goblet box squat"],
  ["Wall Push-Up", "strength", ["chest", "triceps"], "wall", "beginner", "low", "Shoulder pain", "Keep ribs down and elbows soft.", "Stand closer", "Incline push-up"],
  ["Supported Hip Hinge", "strength", ["hamstrings", "glutes"], "counter", "beginner", "low", "Severe low-back pain", "Push hips back with long spine.", "Reduce range", "Dumbbell Romanian deadlift"],
  ["Band Row", "strength", ["upper back"], "resistance band", "beginner", "low", "Sharp shoulder pain", "Pull elbows toward back pockets.", "Lighter band", "Cable row"],
  ["Step-Up", "strength", ["quads", "glutes"], "step", "beginner", "moderate", "Unstable balance", "Drive through whole foot.", "Lower step", "Loaded step-up"],
  ["Farmer Carry", "strength", ["core", "grip"], "dumbbells", "beginner", "low", "Grip injury", "Walk tall with quiet shoulders.", "One light weight", "Heavier carry"],
  ["Dead Bug", "core", ["core"], "mat", "beginner", "low", "Pain lying flat", "Exhale as the heel lowers.", "Bent-knee taps", "Long-lever dead bug"],
  ["Bird Dog", "core", ["core", "glutes"], "mat", "beginner", "low", "Wrist pain", "Reach long without twisting.", "Hands elevated", "Pause reps"],
  ["Heel Raise", "balance", ["calves"], "chair", "beginner", "low", "Achilles flare", "Rise smoothly and lower slowly.", "Two-hand support", "Single-leg heel raise"],
  ["Tandem Stand", "balance", ["ankles", "hips"], "none", "beginner", "low", "High fall risk", "Keep eyes forward and breathe.", "Wider stance", "Tandem walk"],
  ["Incline Push-Up", "strength", ["chest", "triceps"], "bench", "beginner", "low", "Shoulder pain", "Move as one line.", "Wall push-up", "Lower incline"],
  ["Goblet Box Squat", "strength", ["quads", "glutes"], "dumbbell", "intermediate", "moderate", "Painful knee flexion", "Sit back to box then stand.", "Sit-to-stand", "Goblet squat"],
  ["Dumbbell Romanian Deadlift", "strength", ["hamstrings", "glutes"], "dumbbells", "intermediate", "low", "Back pain with hinging", "Keep weights close to thighs.", "Supported hinge", "Single-leg RDL support"],
  ["Machine Chest Press", "strength", ["chest"], "machine", "beginner", "low", "Shoulder impingement", "Stop before shoulders roll forward.", "Wall push-up", "Heavier sets"],
  ["Lat Pulldown", "strength", ["lats", "upper back"], "machine", "beginner", "low", "Shoulder pain overhead", "Pull to upper chest.", "Band row", "Assisted pull-up"],
  ["Leg Press", "strength", ["quads", "glutes"], "machine", "beginner", "moderate", "Knee pain deep flexion", "Control depth and avoid locking knees.", "Box squat", "Single-leg leg press"],
  ["Seated Hamstring Curl", "strength", ["hamstrings"], "machine", "beginner", "low", "Hamstring strain", "Pause gently at the bottom.", "Bridge", "Heavier curl"],
  ["Glute Bridge", "strength", ["glutes"], "mat", "beginner", "low", "Pain lying flat", "Lift hips without arching ribs.", "Pillow support", "Loaded bridge"],
  ["Seated Dumbbell Press", "strength", ["shoulders"], "dumbbells", "intermediate", "moderate", "Shoulder pain overhead", "Press in a pain-free arc.", "Landmine press", "Standing press"],
  ["Band Pull-Apart", "mobility", ["upper back"], "band", "beginner", "low", "Shoulder pain", "Open chest and keep neck relaxed.", "Shorter range", "Stronger band"],
  ["Cat-Cow", "mobility", ["spine"], "mat", "beginner", "low", "Wrist pain", "Move slowly with breath.", "Forearms elevated", "Thread the needle"],
  ["Open Book Rotation", "mobility", ["thoracic spine"], "mat", "beginner", "low", "Shoulder pain", "Rotate upper back, not lower back.", "Smaller range", "Longer hold"],
  ["Hip Flexor Stretch", "mobility", ["hips"], "mat", "beginner", "low", "Knee pressure", "Tuck pelvis gently.", "Standing stretch", "Rear-foot elevated stretch"],
  ["Calf Stretch", "mobility", ["calves"], "wall", "beginner", "low", "Achilles flare", "Keep heel heavy.", "Bent-knee version", "Loaded calf mobility"],
  ["Brisk Walk", "cardio", ["heart", "legs"], "none", "beginner", "low", "Chest pain or dizziness", "Walk at talk-test pace.", "Short intervals", "Hill intervals"],
  ["Recumbent Bike", "cardio", ["heart", "legs"], "bike", "beginner", "low", "Pain with pedaling", "Smooth cadence and relaxed grip.", "Lower resistance", "Tempo intervals"],
  ["Pool Walk", "cardio", ["heart", "legs"], "pool", "beginner", "low", "Unsafe pool access", "Stride tall through water.", "Short duration", "Aqua intervals"],
  ["Resistance Band Squat", "strength", ["quads", "glutes"], "band", "beginner", "low", "Knee pain", "Keep knees tracking toes.", "Sit-to-stand", "Goblet squat"],
  ["Band Chest Press", "strength", ["chest"], "band", "beginner", "low", "Shoulder pain", "Press slightly below shoulder height.", "Wall push-up", "Heavier band"],
  ["Pallof Press", "core", ["core"], "band", "beginner", "low", "Abdominal strain", "Resist rotation and breathe.", "Closer anchor", "Longer lever"],
  ["Supported Split Squat", "strength", ["quads", "glutes"], "chair", "intermediate", "moderate", "Knee pain", "Move straight down with support.", "Step-up", "Loaded split squat"],
  ["Cable Face Pull", "strength", ["upper back"], "cable", "beginner", "low", "Shoulder pain", "Pull toward nose with elbows high.", "Band pull-apart", "Heavier cable"],
  ["Side-Lying Clamshell", "strength", ["glutes"], "mini band", "beginner", "low", "Hip pain", "Keep pelvis still.", "No band", "Side steps"],
  ["Lateral Band Walk", "strength", ["glutes"], "mini band", "beginner", "low", "Hip or knee pain", "Small steps, toes forward.", "Clamshell", "Lower band position"],
  ["Seated Row Machine", "strength", ["upper back"], "machine", "beginner", "low", "Shoulder pain", "Lead with elbows, pause tall.", "Band row", "Heavier row"],
  ["Assisted Lunge", "strength", ["quads", "glutes"], "rail", "intermediate", "moderate", "Knee pain", "Use rail and shorten range.", "Supported split squat", "Reverse lunge"],
  ["Seated March", "cardio", ["hips", "heart"], "chair", "beginner", "low", "Hip pain", "Sit tall and alternate knees.", "Slower pace", "Standing march"],
  ["Standing March", "cardio", ["hips", "heart"], "chair", "beginner", "low", "Balance risk", "Use light fingertip support.", "Seated march", "High-knee intervals"],
  ["Single-Arm Cable Press", "strength", ["chest", "core"], "cable", "intermediate", "low", "Shoulder pain", "Press without torso rotation.", "Band press", "Split stance press"],
  ["Landmine Press", "strength", ["shoulders"], "barbell", "intermediate", "low", "Shoulder pain", "Press forward and up.", "Incline press", "Two-arm landmine press"],
  ["Box Squat", "strength", ["quads", "glutes"], "box", "beginner", "low", "Knee pain", "Touch box lightly and stand.", "Sit-to-stand", "Goblet box squat"],
  ["Cable Wood Chop", "core", ["core"], "cable", "intermediate", "moderate", "Back pain twisting", "Rotate through upper back and hips.", "Pallof press", "Higher load"],
  ["Sled Push", "strength", ["legs", "heart"], "sled", "intermediate", "low", "Chest pain or dizziness", "Short pushes with steady breathing.", "Incline treadmill walk", "Longer pushes"],
  ["Incline Treadmill Walk", "cardio", ["heart", "legs"], "treadmill", "beginner", "low", "Balance risk", "Use rails only as needed.", "Flat walk", "Higher incline"],
  ["Seated Calf Raise", "strength", ["calves"], "machine", "beginner", "low", "Achilles flare", "Pause at top and bottom.", "Heel raise", "Heavier raise"],
  ["Dumbbell Floor Press", "strength", ["chest"], "dumbbells", "beginner", "low", "Shoulder pain", "Upper arms stop on floor.", "Band press", "Bench press"],
  ["Supported Dumbbell Row", "strength", ["upper back"], "dumbbell", "beginner", "low", "Back pain unsupported", "Brace one hand and row smoothly.", "Band row", "Heavier row"],
  ["Chair Yoga Flow", "mobility", ["whole body"], "chair", "beginner", "low", "Pain with positions", "Move within comfortable range.", "Shorter flow", "Standing flow"],
  ["Balance Reach", "balance", ["ankles", "hips"], "chair", "beginner", "low", "High fall risk", "Reach slowly while supported.", "Tandem stand", "Single-leg reach"],
  ["Cooldown Breathing", "recovery", ["nervous system"], "mat", "beginner", "low", "Dizziness lying down", "Long exhale, relaxed jaw.", "Seated breathing", "Longer breath sets"]
].map(([name, category, primaryMuscles, equipment, difficulty, jointImpact, contraindications, cues, regression, progression]) => ({
  name,
  category,
  primaryMuscles,
  equipment,
  difficulty,
  jointImpact,
  contraindications,
  cues,
  regression,
  progression
})) as Exercise[];

export const featuredExercises = starterExercises.slice(0, 8);
