'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabaseClient';
import FixedActivityManager, { FixedActivity } from '../../components/FixedActivityManager';

const DOW_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type WeekdayCode = (typeof DOW_ORDER)[number];

// --- Types ---
type Profile = {
  id: string;
  week_start_dow: string | null;
  checkin_dow: string | null;
  checkin_time: string | null;
  default_days_available: string[] | null;
  default_max_sessions: number | null;
  schedule_notes: string | null;
  fixed_activities: FixedActivity[] | null;
  training_constraints: string | null; // <--- השדה החדש
  // שדות נוספים לצרכי ה-AI
  goal?: string;
  level?: string;
  facilities?: string[];
  facilities_notes?: string;
};

// --- Helpers ---
function normalizeWeekday(label: string | null | undefined): WeekdayCode | null {
  if (!label) return null;
  const base = label.slice(0, 3).toLowerCase();
  switch (base) {
    case 'sun': return 'Sun';
    case 'mon': return 'Mon';
    case 'tue': return 'Tue';
    case 'wed': return 'Wed';
    case 'thu': return 'Thu';
    case 'fri': return 'Fri';
    case 'sat': return 'Sat';
    default: return null;
  }
}

function getNextWeekStartDate(weekStartDow: string): string {
  const targetCode = normalizeWeekday(weekStartDow) || 'Mon';
  const now = new Date();
  const currentDayIndex = now.getDay(); 
  const targetIndex = DOW_ORDER.indexOf(targetCode);
  
  let daysUntil = targetIndex - currentDayIndex;
  if (daysUntil <= 0) daysUntil += 7; 
  
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + daysUntil);
  nextDate.setHours(0,0,0,0);
  
  const offset = nextDate.getTimezoneOffset() * 60000;
  return new Date(nextDate.getTime() - offset).toISOString().slice(0, 10);
}

export default function PlanNextPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nextWeekStartISO, setNextWeekStartISO] = useState<string | null>(null);

  // Form State
  const [sessions, setSessions] = useState<number>(3);
  const [days, setDays] = useState<WeekdayCode[]>([]);
  
  // שתי תיבות טקסט נפרדות:
  const [persistentConstraints, setPersistentConstraints] = useState(''); // נשמר לפרופיל (פציעות וכו')
  const [weeklyNotes, setWeeklyNotes] = useState(''); // נשמר רק לשבוע הזה (בקשות מיוחדות)
  
  const [fixedActivities, setFixedActivities] = useState<FixedActivity[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push('/');
        return;
      }
      setUserId(userData.user.id);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (profileError || !profileData) {
        router.push('/onboarding');
        return;
      }

      const p = profileData as Profile;
      setProfile(p);

      // Calculate Next Week Start
      const nextISO = getNextWeekStartDate(p.week_start_dow || 'Mon');
      setNextWeekStartISO(nextISO);

      // Load Data into State
      if (p.fixed_activities) setFixedActivities(p.fixed_activities);
      if (p.training_constraints) setPersistentConstraints(p.training_constraints); // טעינת המצב המתמשך

      // Check if user already planned specifically for this date
      const { data: checkinRow } = await supabase
        .from('weekly_checkins')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('week_start_date', nextISO)
        .maybeSingle();

      if (checkinRow) {
        // Load saved draft for NEXT week
        if (checkinRow.max_sessions) setSessions(checkinRow.max_sessions);
        if (checkinRow.days_available) {
          setDays((checkinRow.days_available as string[]).map(d => normalizeWeekday(d) as WeekdayCode).filter(Boolean));
        }
        if (checkinRow.notes) setWeeklyNotes(checkinRow.notes);
      } else {
        // Load defaults from Profile
        if (p.default_max_sessions) setSessions(p.default_max_sessions);
        if (p.default_days_available) {
          setDays((p.default_days_available).map(d => normalizeWeekday(d) as WeekdayCode).filter(Boolean));
        }
      }

      setLoading(false);
    };

    load();
  }, [supabase, router]);

  const toggleDay = (day: WeekdayCode) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleGenerate = async () => {
    if (!userId || !nextWeekStartISO || !profile) return;
    setGenerating(true);

    try {
      // 1. Update Profile (Persistent Data)
      // שומרים את הפעילויות הקבועות ואת האילוצים המתמשכים (פציעות וכו') בפרופיל
      const updatedProfile = { 
        ...profile, 
        fixed_activities: fixedActivities,
        training_constraints: persistentConstraints.trim() || null
      };
      
      await supabase.from('profiles').update({
        fixed_activities: fixedActivities,
        training_constraints: persistentConstraints.trim() || null
      }).eq('id', userId);

      // 2. Save the Check-in (Weekly specific request)
      const planningData = {
        max_sessions: sessions,
        days_available: days,
        notes: weeklyNotes.trim(), // רק ההערות השבועיות
        auto_continue: false,
      };

      await supabase.from('weekly_checkins').upsert({
        user_id: userId,
        week_start_date: nextWeekStartISO,
        ...planningData
      }, { onConflict: 'user_id,week_start_date' });

      // 3. Generate the Plan via AI
      // אנחנו שולחים ל-AI גם את הפרופיל המעודכן (עם הפציעות) וגם את הבקשה השבועית
      const res = await fetch('/api/generate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: updatedProfile, 
          lastWeek: null, 
          planning: planningData,
          changeReason: null
        }),
      });

      if (!res.ok) throw new Error('Generation failed');
      const json = await res.json();

      // 4. Save the Resulting Plan
      const { error: saveError } = await supabase.from('week_plans').upsert({
        user_id: userId,
        week_start_date: nextWeekStartISO,
        plan: json.plan || json, 
      }, { onConflict: 'user_id, week_start_date' });

      if (saveError) throw saveError;

      // 5. Done!
      router.push('/dashboard');

    } catch (err) {
      console.error(err);
      alert('Error generating plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center bg-black text-zinc-500">Loading...</main>;
  }

  return (
    <main className="min-h-screen bg-black text-white p-6 flex flex-col gap-6">
      
      {/* Top Navigation */}
      <header className="flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-zinc-400 hover:text-white transition">
          ← Cancel
        </button>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Planning Mode</span>
      </header>

      <section className="max-w-2xl mx-auto w-full space-y-8">
        
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold mb-2">Design Your Next Week</h1>
          <p className="text-sm text-zinc-400">
            Week starting <span className="text-white font-medium">{new Date(nextWeekStartISO!).toLocaleDateString()}</span>.
          </p>
        </div>

        <div className="space-y-6">
          
          {/* 1. Permanent Status (New!) */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2">
              🏥 Ongoing Status
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-normal">Saves to Profile</span>
            </h3>
            <p className="text-xs text-zinc-500 mb-3">
              Injuries, health conditions, or equipment limitations that affect <b>every</b> week.
            </p>
            <textarea
              className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 transition min-h-[80px]"
              value={persistentConstraints}
              onChange={(e) => setPersistentConstraints(e.target.value)}
              placeholder="e.g. 'Left knee injury - no jumping', 'Asthma', 'Only have dumbbells at home'..."
            />
          </div>

          {/* 2. Fixed Activities */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Fixed Activities</h3>
            <FixedActivityManager activities={fixedActivities} onChange={setFixedActivities} />
          </div>

          {/* 3. Logistics */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5 space-y-6">
            
            {/* Volume Slider */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="text-sm font-medium text-zinc-300">Target Sessions</label>
                <div className="flex items-center justify-center w-8 h-8 bg-zinc-800 rounded-full border border-zinc-700 text-sm font-bold">
                  {sessions}
                </div>
              </div>
              <input
                type="range"
                min="1"
                max="7"
                step="1"
                value={sessions}
                onChange={(e) => setSessions(Number(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-2 uppercase font-medium">
                <span>Relaxed</span>
                <span>Intense</span>
              </div>
            </div>

            {/* Days Selector */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Available Days</label>
              <div className="grid grid-cols-7 gap-2">
                {DOW_ORDER.map((d) => {
                  const active = days.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`
                        aspect-square rounded-lg text-xs font-medium transition-all flex items-center justify-center
                        ${active 
                          ? 'bg-white text-black border-white shadow-lg scale-105' 
                          : 'bg-zinc-950 border border-zinc-800 text-zinc-500 hover:border-zinc-600'}
                      `}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Weekly Focus */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Next Week's Focus</h3>
            <p className="text-xs text-zinc-500 mb-3">Specific requests just for this coming week.</p>
            <textarea
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 outline-none focus:border-zinc-600 transition min-h-[80px]"
              value={weeklyNotes}
              onChange={(e) => setWeeklyNotes(e.target.value)}
              placeholder="e.g. 'Traveling on Wed-Thu', 'Focus on upper body', 'Short sessions only'"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={generating || days.length === 0}
            className="w-full py-4 bg-white text-black rounded-xl font-bold text-lg hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xl shadow-white/5"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
                Generating Plan...
              </>
            ) : (
              'Generate New Week'
            )}
          </button>

        </div>
      </section>
    </main>
  );
}