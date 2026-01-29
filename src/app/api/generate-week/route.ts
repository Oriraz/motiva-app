import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PRIMARY_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const BACKUP_MODEL = 'llama-3.1-70b-versatile';

const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type WeekdayCode = (typeof DOW_ORDER)[number];

// Minimal local types used in this route
type DetailedWorkout = {
  title: string;
  focus?: string;
  duration_min?: number;
  instructions: string[];
  notes?: string;
};

type DayPlan = {
  weekday: string;
  workouts: string[];
  kind?: 'main' | 'bonus' | 'recovery';
  detailed_workouts?: DetailedWorkout[];
};

type WeekPlan = {
  notes: string;
  days: DayPlan[];
};

// ... פונקציות עזר קיימות ...
function normalizeWeekday(label: string | null | undefined): WeekdayCode | null {
  if (!label) return null;
  const base = label.slice(0, 3).toLowerCase();
  switch (base) { case 'mon': return 'Mon'; case 'tue': return 'Tue'; case 'wed': return 'Wed'; case 'thu': return 'Thu'; case 'fri': return 'Fri'; case 'sat': return 'Sat'; case 'sun': return 'Sun'; default: return null; }
}
function getCurrentDayIndex(): number { const jsDay = new Date().getDay(); return jsDay === 0 ? 6 : jsDay - 1; }
function cleanJsonString(str: string): string { return str.replace(/```json/g, '').replace(/```/g, '').trim(); }
// ... סוף פונקציות עזר

export async function POST(req: Request) {
  let profile: any | null = null; 
  
  try {
    const body = await req.json();

    profile = body.profile ?? null;
    const lastWeek = body.lastWeek ?? null;
    const planning = body.planning ?? null;
    const changeReason = body.changeReason ?? null;
    const weekStartDateStr = body.weekStartDate ?? null;

    const apiKey = process.env.GROQ_API_KEY;
    
    // CHANGE 1: No Fallback. Immediate Error if no key.
    if (!apiKey) {
        return NextResponse.json({ error: "Server Configuration Error", details: "Missing API Key" }, { status: 500 });
    }

    // --- 1. אתחול Supabase ושליפת היסטוריה ---
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
    // ----------------------------------------------------

    // 2. קביעת הימים הזמינים
    const defaultDays: WeekdayCode[] = (profile?.default_days_available ?? []).map((d: string) => normalizeWeekday(d)).filter(Boolean);
    const planningDays: WeekdayCode[] = (planning?.days_available ?? []).map((d: string) => normalizeWeekday(d)).filter(Boolean);

    let targetDays: WeekdayCode[] = defaultDays;

    if (changeReason) {
      targetDays = defaultDays;
    } else if (planningDays.length > 0) {
      targetDays = planningDays;
    }

    // 3. סינון ימי עבר (לוגיקה מתוקנת)
    let effectiveDays = targetDays;
    let isFutureWeek = false;

    if (weekStartDateStr) {
      const startObj = new Date(weekStartDateStr);
      const today = new Date();
      // איפוס שעות להשוואה נקייה
      startObj.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      
      // בדיקה אם תאריך ההתחלה של השבוע המבוקש גדול מהתאריך של תחילת השבוע הנוכחי
      // או פשוט: אם השבוע המבוקש הוא בעתיד ביחס להיום
      if (startObj.getTime() > today.getTime()) {
        isFutureWeek = true;
      }
    }

    // אם זה השבוע הנוכחי - מסננים ימים שעברו.
    // אם זה שבוע עתידי - משאירים את כל הימים.
    if (!isFutureWeek) {
       const currentDayIdx = getCurrentDayIndex();
       const validFutureDays = targetDays.filter(d => DOW_ORDER.indexOf(d) >= currentDayIdx);
       
       if (validFutureDays.length > 0) {
         effectiveDays = validFutureDays;
       } else {
         effectiveDays = []; 
       }
    }

    // 4. בניית Context
    const fixedActivities = profile?.fixed_activities || [];
    const persistentConstraints = profile?.training_constraints || null;

    const context = {
      user_profile: {
        name: profile?.full_name || 'Friend',
        goal: profile?.goal ?? 'get_active',
        level: profile?.level ?? 'beginner',
        facilities: profile?.facilities ?? [], 
        fixed_activities: fixedActivities,
        ongoing_health_and_constraints: persistentConstraints, 
      },
      scheduling_context: {
        // CHANGE 2: Explicitly tell AI if it's a fresh start for next week
        current_day_of_week: isFutureWeek ? 'Start of Week (Monday)' : DOW_ORDER[getCurrentDayIndex()],
        valid_days_for_workouts: effectiveDays, 
        is_future_plan: isFutureWeek,
        is_adjustment: !!changeReason
      },
      user_request: {
        notes: planning?.notes || '',
        adjustment_request: changeReason || ''
      },
    };

    // --- 5. System Prompt (החזרתי את הגרסה שלך) ---
    const systemPrompt = `
You are "Motiva", an expert AI fitness coach.

TONE:
- Speak DIRECTLY to ${profile?.full_name || 'the user'}. Use "You".
- Be friendly and concise.

RECENT PERFORMANCE HISTORY (Use this for Progressive Overload):
${performanceHistory}

LOGIC:
1. **Adjustment Mode**: If "adjustment_request" is present, you have flexibility to move workouts to any of the "valid_days_for_workouts".
2. **Valid Days**: Only schedule MAIN workouts on: ${JSON.stringify(effectiveDays)}.
3. **Fixed Activities**: Schedule these EXACTLY on their days: ${JSON.stringify(fixedActivities)}.
4. **Health**: Respect "ongoing_health_and_constraints".
5. **Progressive Overload**: Look at the "Recent Performance History" above. If a user previously lifted 60kg, prescribe 62.5kg or increase reps. Do NOT regress unless requested.

SCIENCE & BEST PRACTICES:
- **Cool Down**: Do NOT recommend static stretching immediately after strength training. Current sport science favors "Active Recovery" (e.g., 5-10 mins of light walking or cycling) to flush metabolic waste.
- **Warm Up**: Recommend dynamic movements (e.g., arm circles, leg swings, light cardio) rather than static holds.
- **Instructions**: Be specific. For exercises, write "3 sets of 8-12 reps" or "3 sets to failure".
- **Mobility**: Split mobility routines into specific steps (e.g., "1. Cat-Cow", "2. Pigeon Pose").

JSON FORMAT REQUIRED:
{
  "notes": "Short message to the user.",
  "days": [
    {
      "weekday": "Mon",
      "kind": "main" | "bonus" | "recovery",
      "workouts": ["Summary line"],
      "detailed_workouts": [
        {
          "title": "Workout Title",
          "focus": "strength" | "cardio" | "mobility" | "mixed" | "recovery",
          "duration_min": 30,
          "instructions": ["Step 1"],
          "notes": "Tip"
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

    // --- קריאה ל-Groq (עם טיפול שגיאות חדש) ---
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
        // CHANGE 3: Specific VPN Error
        console.error("Groq Network Error:", err);
        return NextResponse.json({ 
            error: "Connection Failed", 
            details: "Could not connect to AI service. VPN might be blocking the connection." 
        }, { status: 503 });
    }

    if (!resp.ok) {
        const errText = await resp.text();
        console.error("Groq API Error:", resp.status, errText);
        return NextResponse.json({ error: "AI Error", details: `Provider returned ${resp.status}` }, { status: 503 });
    }

    const jsonResponse = await resp.json();
    let content = jsonResponse.choices?.[0]?.message?.content;
    
    // CHANGE 4: JSON Error
    if (!content) {
        return NextResponse.json({ error: "Empty Response", details: "AI returned no content." }, { status: 500 });
    }

    let parsed: WeekPlan;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) content = jsonMatch[0];
      parsed = JSON.parse(content);
    } catch (err) { 
        return NextResponse.json({ error: "Format Error", details: "AI returned invalid JSON." }, { status: 500 });
    }

    if (!parsed.days || !Array.isArray(parsed.days)) {
        return NextResponse.json({ error: "Structure Error", details: "Missing days array." }, { status: 500 });
    }

    // Normalize
    const daysByName: Record<string, DayPlan> = {};
    parsed.days.forEach(d => { if (d.weekday) daysByName[d.weekday] = d; });
    
    const normalizedDays: DayPlan[] = DOW_ORDER.map((wd) => {
      const existing = daysByName[wd];
      if (existing) return existing;
      return { weekday: wd, workouts: [], kind: 'recovery', detailed_workouts: [] };
    });

    return NextResponse.json({ notes: parsed.notes || 'Here is your plan.', days: normalizedDays, fallbackUsed: false }, { status: 200 });

  } catch (err) { 
      console.error("Critical API Error:", err);
      return NextResponse.json({ error: "Server Error", details: "Unknown internal error" }, { status: 500 });
  }
}

// ... formatRecentHistory נשאר אותו דבר ...
function formatRecentHistory(logs: any[]): string {
  if (!logs || logs.length === 0) return "No previous workout history available.";
  const exerciseHistory: Record<string, string> = {};
  logs.forEach((log) => {
    if (!log.details || !Array.isArray(log.details)) return;
    log.details.forEach((block: any) => {
      if (block.type === 'exercise' && block.sets && block.sets.length > 0) {
        const completedSets = block.sets.filter((s: any) => s.completed);
        if (completedSets.length > 0) {
          const lastSet = completedSets[completedSets.length - 1];
          const weightStr = lastSet.is_bodyweight ? "Bodyweight" : `${lastSet.weight}kg`;
          const performance = `${weightStr} x ${lastSet.reps} reps`;
          if (!exerciseHistory[block.name]) {
            exerciseHistory[block.name] = `Last performed on ${log.workout_date}: ${performance}`;
          }
        }
      }
    });
  });
  const summary = Object.entries(exerciseHistory).map(([name, perf]) => `- ${name}: ${perf}`).join('\n');
  return summary || "No significant lifts recorded recently.";
}