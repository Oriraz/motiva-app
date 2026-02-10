import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PRIMARY_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const BACKUP_MODEL = 'llama-3.1-70b-versatile';

const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type WeekdayCode = (typeof DOW_ORDER)[number];

// --- Helpers ---
function normalizeWeekday(label: string | null | undefined): WeekdayCode | null {
  if (!label) return null;
  const base = label.slice(0, 3).toLowerCase();
  switch (base) { case 'mon': return 'Mon'; case 'tue': return 'Tue'; case 'wed': return 'Wed'; case 'thu': return 'Thu'; case 'fri': return 'Fri'; case 'sat': return 'Sat'; case 'sun': return 'Sun'; default: return null; }
}
function getCurrentDayIndex(): number { const jsDay = new Date().getDay(); return jsDay === 0 ? 6 : jsDay - 1; }

// --- History Formatter ---
function formatRecentHistory(logs: any[]): string {
  if (!logs || logs.length === 0) return "No previous workout history available - Start with baseline weights.";
  const exerciseHistory: Record<string, string> = {};
  logs.forEach((log) => {
    if (!log.details || !Array.isArray(log.details)) return;
    log.details.forEach((block: any) => {
      if (block.type === 'exercise' && block.sets && block.sets.length > 0) {
        const completedSets = block.sets.filter((s: any) => s.completed);
        if (completedSets.length > 0) {
          const lastSet = completedSets[completedSets.length - 1];
          const weightStr = lastSet.is_bodyweight ? "Bodyweight" : `${lastSet.weight}kg`;
          const perf = `${weightStr} x ${lastSet.reps} reps`;
          if (!exerciseHistory[block.name]) {
            exerciseHistory[block.name] = `[${log.workout_date}]: ${perf}`;
          }
        }
      }
    });
  });
  return Object.entries(exerciseHistory).map(([name, perf]) => `- ${name}: ${perf}`).join('\n') || "No lifts recorded yet.";
}

export async function POST(req: Request) {
  let profile: any | null = null; 
  
  try {
    const body = await req.json();

    profile = body.profile ?? null;
    const planning = body.planning ?? null;
    const changeReason = body.changeReason ?? null;
    const weekStartDateStr = body.weekStartDate ?? null;
    
    // Default to week 1 if not provided
    const trainingWeekNum = body.trainingWeekNumber || 1; 

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "Server Configuration Error", details: "Missing API Key" }, { status: 500 });
    }

    // --- 1. Init Supabase & Fetch History ---
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let performanceHistory = "No previous workout history available.";
    
    if (profile?.id) {
      const { data: recentLogs } = await supabase
        .from('workout_logs')
        .select('workout_date, details, status')
        .eq('user_id', profile.id)
        .eq('status', 'completed')
        .order('workout_date', { ascending: false })
        .limit(10);

      performanceHistory = formatRecentHistory(recentLogs || []);
    }

    // 2. Determine Days
    const defaultDays: WeekdayCode[] = (profile?.default_days_available ?? []).map((d: string) => normalizeWeekday(d)).filter(Boolean);
    const planningDays: WeekdayCode[] = (planning?.days_available ?? []).map((d: string) => normalizeWeekday(d)).filter(Boolean);
    let targetDays: WeekdayCode[] = (planningDays.length > 0) ? planningDays : defaultDays;
    
    let effectiveDays = targetDays;
    let isFutureWeek = false;
    let currentDayStr = 'Start of Week';

    if (weekStartDateStr) {
      const startObj = new Date(weekStartDateStr);
      const today = new Date();
      startObj.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      if (startObj.getTime() > today.getTime()) isFutureWeek = true;
    }

    if (!isFutureWeek) {
       const currentDayIdx = getCurrentDayIndex();
       currentDayStr = DOW_ORDER[currentDayIdx]; // For prompt context
       const validFutureDays = targetDays.filter(d => DOW_ORDER.indexOf(d) >= currentDayIdx);
       effectiveDays = validFutureDays.length > 0 ? validFutureDays : []; 
    }

    // 3. Build Context
    const fixedActivities = profile?.fixed_activities || [];
    const persistentConstraints = profile?.training_constraints || null;
    const userGoal = profile?.goal || 'General Fitness';
    const userLevel = profile?.level || 'beginner';
    const userFacilities = profile?.facilities || [];

    const context = {
      user_profile: {
        name: profile?.full_name || 'Friend',
        goal: userGoal,
        level: userLevel,
        current_training_week: trainingWeekNum,
        fixed_activities: fixedActivities,
        ongoing_health_constraints_and_experience: persistentConstraints, 
        facilities: userFacilities,
      },
      scheduling_context: {
        current_day: currentDayStr,
        valid_days_for_workouts: effectiveDays, 
        is_future_plan: isFutureWeek,
        is_adjustment: !!changeReason
      },
      user_request: {
        notes: planning?.notes || '',
        adjustment_request: changeReason || ''
      },
    };

    // --- 4. THE UPDATED SYSTEM PROMPT ---
    const systemPrompt = `
You are "Motiva", an expert AI fitness coach specializing in functional fitness, longevity, and progressive overload.

**CORE PHILOSOPHY:**
1.  **Consistency > Intensity:** The #1 rule is "Showing up." For beginners (Weeks 1-4), prioritize manageable habits over crushing workouts.
2.  **The "Ideal" Mix:**
    - Strength: 2-3x/week.
    - Cardio: Aiming for 3-4 hours/week total (Zone 2 mainly).
    - Mobility: 1-2x/week.
    *ADAPTATION:* If the user has limited days, prioritize: Strength > Zone 2 Cardio > Mobility.
3.  **Long-Term Vision:**
    - **Micro (This Week):** Fit the user's current life/schedule.
    - **Macro (The Journey):** Use 'current_training_week'.
      - Week 1-4: Foundation & Form. 
      - Week 5-8: Accumulation (Volume). 
      - Week 9+: Intensification.

**DYNAMIC PRIORITIZATION (GOAL ALIGNMENT):**
User may have multiple goals (e.g. "Build Muscle, Endurance"). Balance the plan to address ALL of them.
* **Muscle/Strength:** Priority = Strength (3-4x/week). Cardio = Maintenance (Zone 2).
* **Endurance/Running/Triathlon:** Priority = Cardio Volume. Strength = 2x/week (Injury prevention).
* **Longevity/Health:** Balanced mix (Strength + Cardio + Mobility).
* **Weight Loss:** High activity volume (Cardio) + Strength (to retain muscle).

**PARTIAL WEEK RULE (CRITICAL):**
If 'scheduling_context.is_future_plan' is FALSE (meaning this is the current week), **DO NOT** schedule workouts for days that have already passed (before 'current_day').
- Focus the plan ONLY on 'valid_days_for_workouts'.
- Output 'Rest' or leave empty for past days.

**EQUIPMENT LOGIC (CYCLING):**
If assigning Cycling:
- Check 'user_profile.facilities'.
- If 'bicycle' is NOT present but 'gym' or 'home_gym' IS: Specify "Stationary Bike".
- If 'bicycle' IS present: Specify "Outdoor Cycling or Stationary Bike".

**HIIT SAFETY PROTOCOL:**
- **Condition:** Do NOT schedule HIIT unless the user level is 'Advanced' OR 'current_training_week' > 8.
- **Reason:** Prevent burnout/injury.
- **Default:** Assign Zone 2 (Steady State) Cardio if in doubt.

**USER CONTEXT:**
- Name: ${profile?.full_name || 'Athlete'}
- Goal: ${userGoal}
- Level: ${userLevel}
- Current Week: ${trainingWeekNum}
- Recent Performance: 
${performanceHistory}

**HARD CONSTRAINTS (DO NOT VIOLATE):**
1.  **Valid Days:** Only schedule MAIN workouts on: ${JSON.stringify(effectiveDays)}.
2.  **Fixed Activities:** Schedule these EXACTLY on their days: ${JSON.stringify(fixedActivities)}.
3.  **Adjustment:** If "adjustment_request" is present, modify the plan to fit the new request while keeping the rest balanced.

**INSTRUCTIONS FOR WORKOUT GENERATION:**

1.  **Strength Training:**
    - Use 'Recent Performance' to apply Progressive Overload.
    - Be specific: "3 sets of 8-12 reps".

2.  **Cardio & Endurance (MANDATORY STRUCTURE):**
    - **NEVER** output generic instructions like "Swim for 20 mins".
    - **MUST** break down into segments for the timer parser to work:
      - **Warmup:** e.g., "5 min brisk walk".
      - **Main Set:** e.g., "Running: 4 x 5 mins Zone 2, 1 min walk" OR "Swimming: 10 x 50m freestyle".
      - **Cool Down:** e.g., "5 min slow walk".

3.  **Mobility:**
    - List specific movements (e.g., "World's Greatest Stretch", "Pigeon Pose").

**JSON OUTPUT FORMAT:**
Return ONLY valid JSON.
{
  "notes": "A strictly professional yet encouraging message focusing on this week's goal.",
  "days": [
    {
      "weekday": "Mon",
      "kind": "main" | "bonus" | "recovery",
      "workouts": ["Short summary string"],
      "detailed_workouts": [
        {
          "title": "Title (e.g., Upper Body Strength)",
          "focus": "strength" | "cardio" | "mobility" | "mixed" | "recovery",
          "duration_min": 45,
          "instructions": [
             "Warm up: 5 mins dynamic...",
             "Squats: 3 sets of 8 reps...",
             "Cool down: 5 mins walk..."
          ],
          "notes": "Specific cue"
        }
      ]
    }
  ]
}
    `.trim();

    const userPrompt = `
CONTEXT:
${JSON.stringify(context, null, 2)}

TASK:
Generate the plan as strict JSON.
    `.trim();

    // --- Call Groq ---
    async function callGroq(model: string) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); 
      try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.6 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return resp;
      } catch (e) { clearTimeout(timeout); throw e; }
    }

    let resp;
    try {
      console.log(`Attempting generation with ${PRIMARY_MODEL}...`);
      resp = await callGroq(PRIMARY_MODEL);
      if (!resp.ok) resp = await callGroq(BACKUP_MODEL);
    } catch (err: any) {
        console.error("Groq Network Error:", err);
        return NextResponse.json({ error: "Connection Failed", details: "Could not connect to AI service." }, { status: 503 });
    }

    if (!resp.ok) {
        return NextResponse.json({ error: "AI Error", details: `Provider returned ${resp.status}` }, { status: 503 });
    }

    const jsonResponse = await resp.json();
    let content = jsonResponse.choices?.[0]?.message?.content;
    
    if (!content) return NextResponse.json({ error: "Empty Response", details: "AI returned no content." }, { status: 500 });

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) content = jsonMatch[0];
      parsed = JSON.parse(content);
    } catch (err) { 
        return NextResponse.json({ error: "Format Error", details: "AI returned invalid JSON." }, { status: 500 });
    }

    // Normalize
    const daysByName: Record<string, any> = {};
    if (parsed.days && Array.isArray(parsed.days)) {
        parsed.days.forEach((d: any) => { if (d.weekday) daysByName[d.weekday] = d; });
    }
    
    const normalizedDays = DOW_ORDER.map((wd) => {
      const existing = daysByName[wd];
      if (existing) return existing;
      return { weekday: wd, workouts: [], kind: 'recovery', detailed_workouts: [] };
    });

    return NextResponse.json({ notes: parsed.notes || 'Here is your plan.', days: normalizedDays }, { status: 200 });

  } catch (err) { 
      console.error("Critical API Error:", err);
      return NextResponse.json({ error: "Server Error", details: "Unknown internal error" }, { status: 500 });
  }
}