'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '../../lib/supabaseClient';
import { format } from 'date-fns';

// ---------- Types ----------
const DOW_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type WeekdayCode = (typeof DOW_ORDER)[number];
type DayKind = 'main' | 'recovery' | 'bonus';

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
  kind?: DayKind;
  detailed_workouts?: DetailedWorkout[];
};

type WeekPlan = {
  days: DayPlan[];
  notes: string;
};

type WorkoutLog = {
  id: string;
  user_id: string;
  workout_date: string;
  status: 'completed' | 'partial' | 'skipped';
  rpe?: number;
};

export type FixedActivity = {
  id: string;
  day: string;
  activity: string;
  time?: string;
};

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  week_start_dow: string | null;
  goal: string | null;
  level: string | null;
  default_days_available: string[] | null;
  fixed_activities?: FixedActivity[] | null;
};

// ---------- Helpers ----------

function normalizeWeekday(label: string | null | undefined): WeekdayCode | null {
  if (!label) return null;
  const base = label.slice(0, 3).toLowerCase();
  switch (base) { case 'sun': return 'Sun'; case 'mon': return 'Mon'; case 'tue': return 'Tue'; case 'wed': return 'Wed'; case 'thu': return 'Thu'; case 'fri': return 'Fri'; case 'sat': return 'Sat'; default: return null; }
}

function getStartOfWeek(weekStart: WeekdayCode): Date {
  const today = new Date();
  const todayIdx = today.getDay(); 
  const startIdx = DOW_ORDER.indexOf(weekStart);
  const diff = (todayIdx - startIdx + 7) % 7;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - diff);
  return start;
}

function getStartOfWeekFrom(baseDate: Date, weekStart: WeekdayCode): Date {
  const date = new Date(baseDate);
  const dayIdx = date.getDay();
  const startIdx = DOW_ORDER.indexOf(weekStart);
  const diff = (dayIdx - startIdx + 7) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

function toLocalISO(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function orderDays(days: DayPlan[], weekStart: WeekdayCode): DayPlan[] {
  const startIdx = DOW_ORDER.indexOf(weekStart);
  const getOffset = (weekday: string): number => {
    const code = normalizeWeekday(weekday) ?? 'Mon';
    const idx = DOW_ORDER.indexOf(code);
    return (idx - startIdx + 7) % 7;
  };
  return [...days].sort((a, b) => getOffset(a.weekday) - getOffset(b.weekday));
}

function dateForWeekday(startOfWeek: Date, weekStart: WeekdayCode, targetDay: WeekdayCode): Date {
  const startIdx = DOW_ORDER.indexOf(weekStart);
  const targetIdx = DOW_ORDER.indexOf(targetDay);
  const offset = (targetIdx - startIdx + 7) % 7;
  const d = new Date(startOfWeek);
  d.setDate(startOfWeek.getDate() + offset);
  return d;
}

function getFriendlyName(profile: Profile): string {
  if (profile.full_name && profile.full_name.trim().length > 0) {
    return profile.full_name.trim().split(' ')[0];
  }
  return 'Friend';
}

function formatPrimaryDays(defaultDays: string[] | null): string | null {
  if (!defaultDays || defaultDays.length === 0) return null;
  const order: WeekdayCode[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const normalized = defaultDays.map((d) => normalizeWeekday(d)).filter(Boolean) as WeekdayCode[];
  if (normalized.length === 0) return null;
  const sorted = [...normalized].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return sorted.join(' · ');
}

function kindToBadge(kind: DayKind | undefined, isFixed?: boolean): { label: string; className: string } {
  if (isFixed) {
    return { label: 'Fixed Activity', className: 'border-indigo-500 bg-indigo-500/10 text-indigo-300' };
  }
  switch (kind) {
    case 'main': return { label: 'Main Workout', className: 'border-emerald-500 bg-emerald-500/10 text-emerald-300' };
    case 'bonus': return { label: 'Bonus', className: 'border-indigo-400 bg-indigo-500/10 text-indigo-200' };
    case 'recovery': default: return { label: 'Rest', className: 'border-zinc-700 bg-zinc-800/60 text-zinc-400' };
  }
}

function inferKind(day: DayPlan): DayKind {
  if (day.kind) return day.kind;
  if (!day.workouts || day.workouts.length === 0) return 'recovery';
  return 'main';
}

// ---------- Component ----------

export default function DashboardPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Plans
  const [currentWeekPlan, setCurrentWeekPlan] = useState<WeekPlan | null>(null);
  const [nextWeekPlan, setNextWeekPlan] = useState<WeekPlan | null>(null);
  
  // UI State
  const [viewingTab, setViewingTab] = useState<'current' | 'next'>('current');
  const [selectedDay, setSelectedDay] = useState<DayPlan | null>(null);
  const [showAdjustBox, setShowAdjustBox] = useState(false);
  const [regenerateReason, setRegenerateReason] = useState('');
  
  // Error Handling
  const [generationError, setGenerationError] = useState<{title: string, msg: string} | null>(null);

  // Meta
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [trainingWeekNumber, setTrainingWeekNumber] = useState<number | null>(null);
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>({});
  const [generating, setGenerating] = useState(false);

  // ---------- Load everything ----------
  useEffect(() => {
    const loadEverything = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.href = '/';
        return;
      }
      setUserId(userData.user.id);

      // 1) Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (!profileData) {
        window.location.href = '/onboarding';
        return;
      }
      const typedProfile = profileData as Profile;
      setProfile(typedProfile);

      // Week calc
      const weekStartCode = normalizeWeekday(typedProfile.week_start_dow) ?? ('Mon' as WeekdayCode);
      const startOfWeek = getStartOfWeek(weekStartCode);
      
      const offset = startOfWeek.getTimezoneOffset() * 60000;
      const currentISO = new Date(startOfWeek.getTime() - offset).toISOString().slice(0, 10);
      
      const nextWeekStart = new Date(startOfWeek);
      nextWeekStart.setDate(startOfWeek.getDate() + 7);
      const nextOffset = nextWeekStart.getTimezoneOffset() * 60000;
      const nextISO = new Date(nextWeekStart.getTime() - nextOffset).toISOString().slice(0, 10);

      // 2) Load Plans
      const { data: plans } = await supabase
        .from('week_plans')
        .select('*')
        .eq('user_id', userData.user.id)
        .in('week_start_date', [currentISO, nextISO]);

      if (plans) {
        const current = plans.find((p: any) => p.week_start_date === currentISO);
        const next = plans.find((p: any) => p.week_start_date === nextISO);

        if (current) {
          const actualPlan = current.plan.plan ? current.plan.plan : current.plan;
          setCurrentWeekPlan(actualPlan as WeekPlan);
          setGeneratedAt(current.generated_at);
        }

        if (next) {
          const actualPlan = next.plan.plan ? next.plan.plan : next.plan;
          setNextWeekPlan(actualPlan as WeekPlan);
        }
      }

      // 3) Load Logs
      const { data: logsData } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userData.user.id);
      
      if (logsData) {
        const logsMap: Record<string, WorkoutLog> = {};
        logsData.forEach((log: any) => {
          logsMap[log.workout_date] = log as WorkoutLog;
        });
        setLogs(logsMap);
      }

      // 4) Week Number
      const { data: firstPlan } = await supabase
        .from('week_plans')
        .select('generated_at')
        .eq('user_id', userData.user.id)
        .order('generated_at', { ascending: true })
        .limit(1)
        .maybeSingle();
        
      if (firstPlan) {
        const firstGen = new Date(firstPlan.generated_at);
        const firstStart = getStartOfWeekFrom(firstGen, weekStartCode);
        const currentStart = getStartOfWeekFrom(new Date(), weekStartCode);
        const diffWeeks = Math.round((currentStart.getTime() - firstStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        setTrainingWeekNumber(diffWeeks + 1);
      } else {
        setTrainingWeekNumber(1);
      }

      setLoading(false);
    };

    loadEverything();
  }, [supabase]); 

  // ---------- Actions ----------

  const handleToggleLog = async (dateStr: string) => {
    if (!userId) return;
    const isCompleted = logs[dateStr]?.status === 'completed';
    const newStatus = isCompleted ? null : 'completed';

    const newLogs = { ...logs };
    if (newStatus) {
      newLogs[dateStr] = { id: 'opt', user_id: userId, workout_date: dateStr, status: 'completed' };
    } else {
      delete newLogs[dateStr];
    }
    setLogs(newLogs);

    if (newStatus === 'completed') {
      await supabase.from('workout_logs').upsert({ user_id: userId, workout_date: dateStr, status: 'completed' }, { onConflict: 'user_id, workout_date' });
    } else {
      await supabase.from('workout_logs').delete().eq('user_id', userId).eq('workout_date', dateStr);
    }
  };

  const handleGenerate = async () => {
    if (!profile) return;
    setGenerating(true);
    setGenerationError(null);

    const weekStartCode = normalizeWeekday(profile.week_start_dow) ?? 'Mon';
    const startOfWeek = getStartOfWeek(weekStartCode);
    const offset = startOfWeek.getTimezoneOffset() * 60000;
    
    const currentWeekISO = new Date(startOfWeek.getTime() - offset).toISOString().slice(0, 10);
    const nextWeekDate = new Date(startOfWeek);
    nextWeekDate.setDate(startOfWeek.getDate() + 7);
    const nextWeekISO = new Date(nextWeekDate.getTime() - offset).toISOString().slice(0, 10);
    
    let targetDateISO = currentWeekISO;
    
    if (viewingTab === 'next') {
        targetDateISO = nextWeekISO;
    } 
    else if (!regenerateReason && currentWeekPlan) {
        targetDateISO = nextWeekISO;
    }

    try {
      const res = await fetch('/api/generate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          profile, 
          lastWeek: regenerateReason ? null : currentWeekPlan,
          planning: null, 
          changeReason: regenerateReason || null,
          trainingWeekNumber: trainingWeekNumber,
          weekStartDate: targetDateISO 
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate plan');
      }
      
      const data = await res.json();
      
      const planToSave = {
          notes: data.notes,
          days: data.days
      };

      const { error: dbError } = await supabase
          .from('week_plans')
          .upsert({
              user_id: profile.id,
              week_start_date: targetDateISO,
              goal: profile.goal || 'General',
              plan: planToSave,
              generated_at: new Date().toISOString()
          }, { 
              onConflict: 'user_id, week_start_date'
          });

      if (dbError) throw dbError;

      window.location.reload();

    } catch (err: any) {
        console.error(err);
        setGenerationError({
            title: 'Planning Failed',
            msg: err.message || 'AI could not build the plan. Please try again.'
        });
    } finally {
        setGenerating(false);
        setShowAdjustBox(false);
        setRegenerateReason('');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // ---------- Rendering ----------

  if (loading || !profile) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Loading...</div>;

  const weekStartCode = normalizeWeekday(profile.week_start_dow) ?? 'Mon';
  
  const activePlan = viewingTab === 'current' ? currentWeekPlan : nextWeekPlan;
  const currentWeekStart = getStartOfWeek(weekStartCode);
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setDate(currentWeekStart.getDate() + 7);
  const viewedWeekStart = viewingTab === 'current' ? currentWeekStart : nextWeekStart;

  const orderedDays = activePlan ? orderDays(activePlan.days, weekStartCode) : [];
  const friendlyName = getFriendlyName(profile);
  const primaryDaysLabel = formatPrimaryDays(profile.default_days_available);

  const today = new Date();
  today.setHours(0,0,0,0);
  const planCreatedDate = generatedAt ? new Date(generatedAt) : new Date();
  planCreatedDate.setHours(0,0,0,0);
  
  const currentDayIndex = DOW_ORDER.indexOf(normalizeWeekday(new Date().toLocaleDateString('en-US', {weekday:'short'}))!);
  const startDayIndex = DOW_ORDER.indexOf(weekStartCode);
  const daysIntoWeek = (currentDayIndex - startDayIndex + 7) % 7;
  const showNextWeekBtn = daysIntoWeek >= 4 || !currentWeekPlan; 

  return (
    <main className="min-h-screen bg-black text-white p-6 pb-32 space-y-6">
      
      {/* Header */}
      <header className="sticky top-0 bg-black/85 backdrop-blur-md z-30 -mx-6 px-6 pt-6 pb-4 border-b border-zinc-900 shadow-sm transition-all">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold mb-1">Your week, {friendlyName}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
               <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 capitalize">{profile.level}</span>
               <span>•</span>
               <span>{profile.goal?.replace('_', ' ')}</span>
            </div>
            {primaryDaysLabel && (
              <p className="text-[10px] text-zinc-500 mt-1">Main days: {primaryDaysLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
             <button onClick={handleLogout} className="text-xs text-zinc-400 border border-zinc-800 px-3 py-1.5 rounded-xl hover:bg-zinc-900 transition">Logout</button>
          </div>
        </div>

        {nextWeekPlan && (
          <div className="flex p-1 bg-zinc-900/80 rounded-xl w-full max-w-sm mx-auto sm:mx-0">
            <button onClick={() => setViewingTab('current')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${viewingTab === 'current' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}>Current Week</button>
            <button onClick={() => setViewingTab('next')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${viewingTab === 'next' ? 'bg-white text-black shadow' : 'text-zinc-500 hover:text-zinc-300'}`}>Next Week</button>
          </div>
        )}
      </header>

      {/* ERROR STATE */}
      {generationError && (
          <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl text-center space-y-4 animate-in fade-in">
              <div className="text-3xl">⚠️</div>
              <div>
                  <h3 className="text-red-200 font-bold">{generationError.title}</h3>
                  <p className="text-red-200/70 text-sm mt-1">{generationError.msg}</p>
              </div>
              <button onClick={handleGenerate} className="bg-red-500/20 text-red-200 border border-red-500/50 px-6 py-2 rounded-lg text-sm font-bold hover:bg-red-500/30 transition">
                  Try Again
              </button>
          </div>
      )}

      {/* --- Main Content --- */}
      {activePlan ? (
        <section className="space-y-4 animate-in fade-in duration-500">
          
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
             <p className="text-sm text-zinc-300 italic leading-relaxed">"{activePlan.notes}"</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {orderedDays.map((day) => {
              const dateObj = dateForWeekday(viewedWeekStart, weekStartCode, normalizeWeekday(day.weekday)!);
              const dateStr = toLocalISO(dateObj);
              const dateLabel = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
              
              // חישוב האם יום זה הוא בעתיד
              const checkDate = new Date(dateObj);
              checkDate.setHours(0,0,0,0);
              const isFuture = checkDate.getTime() > today.getTime();
              const isToday = checkDate.getTime() === today.getTime();
              
              const kind = inferKind(day);
              const isFixedActivity = profile.fixed_activities?.some(fa => normalizeWeekday(fa.day) === day.weekday);
              const badge = kindToBadge(kind, !!isFixedActivity);
              const isSelected = selectedDay?.weekday === day.weekday;
              const log = logs[dateStr];
              const isCompleted = log?.status === 'completed';
              const hasWorkouts = day.workouts.length > 0;

              return (
                <div 
                  key={day.weekday}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={`
                    relative group flex flex-col h-full cursor-pointer
                    rounded-2xl p-4 border-2 transition-all duration-200
                    ${isCompleted ? 'bg-emerald-950/20 border-emerald-500/50' : 'bg-zinc-950'}
                    ${!isCompleted && isToday ? 'border-white bg-zinc-900 shadow-[0_0_20px_rgba(255,255,255,0.08)]' : ''}
                    ${!isCompleted && !isToday && (kind === 'bonus' || isFixedActivity) ? 'border-indigo-500/40 hover:border-indigo-400' : ''}
                    ${!isCompleted && !isToday && kind === 'main' && !isFixedActivity ? 'border-zinc-800 hover:border-zinc-600' : ''}
                    ${!isCompleted && !isToday && kind === 'recovery' ? 'border-zinc-900 hover:border-zinc-800 opacity-60 hover:opacity-100' : ''}
                    ${isSelected ? 'ring-1 ring-white scale-[1.02] z-10' : ''}
                  `}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                        {day.weekday} 
                        <span className="text-xs font-normal text-zinc-500">{dateLabel}</span>
                        {isToday && <span className="text-[9px] bg-white text-black px-1.5 rounded font-bold">TODAY</span>}
                      </h3>
                      <div className={`mt-1.5 inline-flex text-[10px] px-2 py-0.5 rounded-md font-medium border ${badge.className}`}>
                        {badge.label}
                      </div>
                    </div>

                    {hasWorkouts && (
                      <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (!isFuture) handleToggleLog(dateStr); 
                        }}
                        // אם זה עתיד - הופכים את הכפתור לבלתי נראה ולא לחיץ
                        className={`flex items-center justify-center w-6 h-6 rounded-full border transition-all z-10 
                            ${isFuture ? 'opacity-0 pointer-events-none' : ''} 
                            ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-black scale-110' : 'bg-transparent border-zinc-600 text-transparent hover:border-emerald-400 group-hover:text-zinc-600'}`
                        }
                      >
                         {isCompleted && "✓"}
                      </button>
                    )}
                  </div>
                  {hasWorkouts ? (
                    <ul className={`text-xs space-y-2 ${isCompleted ? 'text-zinc-500 line-through opacity-70' : 'text-zinc-300'}`}>
                      {day.workouts.slice(0, 3).map((w, i) => (
                        <li key={i} className="leading-snug pl-2 border-l-2 border-zinc-800">{w}</li>
                      ))}
                    </ul>
                  ) : (<p className="text-xs text-zinc-600 italic mt-2">Active recovery</p>)}
                </div>
              );
            })}
          </div>

          {/* Adjust Plan */}
          {viewingTab === 'current' && !generationError && (
            <div className="mt-8 pt-6 border-t border-zinc-900">
               {!showAdjustBox ? (
                 <div className="flex justify-center">
                   <button onClick={() => setShowAdjustBox(true)} className="text-xs text-zinc-500 hover:text-zinc-300 transition underline decoration-zinc-700 hover:decoration-zinc-400">
                     Need to adjust this week's plan?
                   </button>
                 </div>
               ) : (
                 <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 max-w-lg mx-auto animate-in fade-in slide-in-from-bottom-2">
                   <div className="flex justify-between items-start mb-3">
                     <p className="text-xs text-zinc-400">Tell Motiva what changed...</p>
                     <button onClick={() => setShowAdjustBox(false)} className="text-zinc-500 hover:text-white">✕</button>
                   </div>
                   <textarea
                     className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-sm text-white focus:ring-1 focus:ring-white outline-none"
                     rows={2}
                     value={regenerateReason}
                     onChange={(e) => setRegenerateReason(e.target.value)}
                   />
                   <div className="flex justify-end mt-3">
                     <button onClick={handleGenerate} disabled={generating} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50">
                       {generating ? 'Updating...' : 'Update Plan'}
                     </button>
                   </div>
                 </div>
               )}
            </div>
          )}

          {/* Plan Next Week - Only show late in the week */}
          {viewingTab === 'current' && !nextWeekPlan && showNextWeekBtn && (
             <div className="mt-6 p-5 border border-zinc-800 rounded-2xl bg-zinc-900/30 flex justify-between items-center">
               <div className="text-sm text-zinc-400">Ready to plan ahead?</div>
               <button onClick={() => router.push('/plan-next')} className="text-xs bg-white text-black px-4 py-3 rounded-xl font-bold hover:bg-zinc-200 transition">Plan Next Week →</button>
             </div>
          )}
          
          {viewingTab === 'current' && nextWeekPlan && (
            <div className="mt-8 text-center text-xs text-zinc-500">
              Your next week is ready. Switch tabs above to view it. ↗
            </div>
          )}

        </section>
      ) : (
        /* Empty State / First Load */
        !generationError && (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-5 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-3xl mb-2">⚡️</div>
            <h2 className="text-xl font-bold text-white">Let's build your first week</h2>
            <p className="text-sm text-zinc-400 max-w-xs leading-relaxed">
                Motiva will create a custom plan based on your profile and equipment.
            </p>
            <button
                onClick={handleGenerate}
                disabled={generating}
                className="mt-4 px-8 py-4 bg-white text-black text-sm font-bold rounded-full hover:bg-zinc-200 transition disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
                {generating ? 'Building Plan...' : 'Generate Plan'}
            </button>
            </div>
        )
      )}

      {/* Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedDay(null)}>
          <div 
            className="bg-zinc-950 w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 p-6 shadow-2xl animate-in slide-in-from-bottom-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">{selectedDay.weekday}</h3>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mt-1">Detailed Breakdown</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white transition">✕</button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {selectedDay.detailed_workouts && selectedDay.detailed_workouts.length > 0 ? (
                selectedDay.detailed_workouts.map((dw, i) => (
                  <div key={i} className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-bold text-emerald-100 text-lg">{dw.title}</h4>
                      {dw.duration_min && <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded text-zinc-400 font-bold uppercase tracking-wide">{dw.duration_min} min</span>}
                    </div>
                    {dw.instructions && (
                      <ul className="space-y-3">
                        {dw.instructions.map((inst, idx) => (
                          <li key={idx} className="text-sm text-zinc-300 leading-relaxed pl-4 border-l-2 border-zinc-700">{inst}</li>
                        ))}
                      </ul>
                    )}
                    {dw.notes && <p className="mt-4 text-xs text-zinc-500 italic bg-black/20 p-3 rounded-lg border border-zinc-800/50">{dw.notes}</p>}
                  </div>
                ))
              ) : (
                <div className="text-center py-10 border border-zinc-800 border-dashed rounded-2xl text-zinc-500">
                  <p>Rest & Recovery Day 🍵</p>
                </div>
              )}
            </div>
            
            {/* Action Button - SMART LOGIC FIXED */}
            {selectedDay.workouts.length > 0 && (
              <div className="mt-6 pt-4 border-t border-zinc-900">
                 <button
                    onClick={() => {
                      const d = dateForWeekday(viewedWeekStart, weekStartCode, normalizeWeekday(selectedDay.weekday)!);
                      const isoDate = toLocalISO(d);
                      const isCompleted = logs[isoDate]?.status === 'completed';

                      if (isCompleted) {
                        handleToggleLog(isoDate);
                        setSelectedDay(null);
                        return;
                      }

                      // Check if it's a fixed activity (Pilates/Swimming marked in profile)
                      const isFixed = profile.fixed_activities?.some(fa => normalizeWeekday(fa.day) === selectedDay.weekday);
                      
                      if (isFixed) {
                         // Fixed activity -> Just toggle done, no live session
                         handleToggleLog(isoDate);
                         setSelectedDay(null);
                         return;
                      }

                      // Check if live session supported (Includes Cardio/HIIT/Endurance now)
                      const hasLiveSession = selectedDay.detailed_workouts?.some(dw => {
                          const f = (dw.focus || '').toLowerCase();
                          return ['strength', 'hypertrophy', 'mixed', 'resistance', 'cardio', 'endurance', 'mobility', 'hiit', 'recovery'].includes(f) ||
                                 dw.instructions?.length > 0;
                      });

                      if (hasLiveSession) {
                        router.push(`/workout/${isoDate}`);
                      } else {
                        handleToggleLog(isoDate);
                        setSelectedDay(null);
                      }
                    }}
                    className={`w-full py-4 rounded-2xl font-bold text-sm transition shadow-lg flex items-center justify-center gap-2
                      ${logs[toLocalISO(dateForWeekday(viewedWeekStart, weekStartCode, normalizeWeekday(selectedDay.weekday)!))]?.status === 'completed'
                        ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                        : 'bg-emerald-500 text-black hover:bg-emerald-400'}
                    `}
                 >
                   {logs[toLocalISO(dateForWeekday(viewedWeekStart, weekStartCode, normalizeWeekday(selectedDay.weekday)!))]?.status === 'completed' 
                     ? <span>↺ Mark as Incomplete</span>
                     : (
                        // If it's fixed activity, show "Mark Done". Else "Start Session"
                        profile.fixed_activities?.some(fa => normalizeWeekday(fa.day) === selectedDay.weekday)
                            ? <span>✓ Mark as Done</span>
                            : <span>▶ Start Live Session</span>
                     )}
                 </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ... Bottom Nav ... */}
       <nav className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-lg border-t border-zinc-900 pb-safe pt-3 px-6 pb-6 flex justify-around items-center z-40">
          <Link href="/dashboard" className="flex flex-col items-center gap-1.5 text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-medium">Plan</span>
          </Link>
          <Link href="/progress" className="flex flex-col items-center gap-1.5 text-zinc-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-[10px] font-medium">Progress</span>
          </Link>
          <Link href="/settings" className="flex flex-col items-center gap-1.5 text-zinc-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] font-medium">Settings</span>
          </Link>
      </nav>
    </main>
  );
}