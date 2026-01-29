'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link'; // For Navigation
import { supabaseBrowser } from '../../lib/supabaseClient';
import { 
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';

// --- Types ---
type WorkoutLog = {
  id: string;
  workout_date: string;
  status: string;
  details: any; // JSON containing sets, reps, blocks
};

type StatCardProps = {
  label: string;
  value: string | number;
  icon: string;
  subtext?: string;
  color: string;
};

// --- Components ---
function StatCard({ label, value, icon, subtext, color }: StatCardProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex flex-col justify-between h-full">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xl p-2 rounded-lg bg-zinc-800 ${color}`}>{icon}</span>
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-zinc-400 font-medium">{label}</div>
        {subtext && <div className="text-[10px] text-zinc-600 mt-1">{subtext}</div>}
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const supabase = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  
  // Computed Stats
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [avgCompletion, setAvgCompletion] = useState(0);
  
  // Charts Data
  const [weeklyActivity, setWeeklyActivity] = useState<any[]>([]);
  const [workoutTypes, setWorkoutTypes] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // Auth handled by middleware/layout usually

      const { data } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('workout_date', { ascending: false });

      if (data) {
        setLogs(data);
        calculateStats(data);
      }
      setLoading(false);
    };

    fetchData();
  }, [supabase]);

  // --- Logic Engine ---
  const calculateStats = (data: WorkoutLog[]) => {
    setTotalWorkouts(data.length);

    // 1. Calculate Completion Rates & Types
    let totalScore = 0;
    const typeCounts: Record<string, number> = { Strength: 0, Cardio: 0, Mobility: 0, Mixed: 0 };

    data.forEach(log => {
        // Calculate Score for this log
        let setsTotal = 0;
        let setsDone = 0;
        let isCardio = false;
        let isStrength = false;

        if (Array.isArray(log.details)) {
            log.details.forEach((block: any) => {
                if (block.type === 'exercise') {
                    isStrength = true;
                    if (block.sets) {
                        setsTotal += block.sets.length;
                        setsDone += block.sets.filter((s: any) => s.completed).length;
                    }
                } else if (block.type === 'warmup' || block.type === 'cooldown') {
                     // Minor weight
                }
                
                // Heuristic to detect cardio if not explicitly typed
                if (block.name?.toLowerCase().includes('run') || block.name?.toLowerCase().includes('cycle')) {
                    isCardio = true;
                }
            });
        }

        // Determine Type
        if (isStrength && isCardio) typeCounts.Mixed++;
        else if (isStrength) typeCounts.Strength++;
        else if (isCardio) typeCounts.Cardio++;
        else typeCounts.Mobility++; // Default/Fallback

        // Determine Score %
        const score = setsTotal > 0 ? (setsDone / setsTotal) * 100 : 100; // If no sets (just cardio), assume 100%
        totalScore += score;
    });

    setAvgCompletion(data.length > 0 ? Math.round(totalScore / data.length) : 0);
    
    // Set Pie Chart Data
    const pieData = Object.entries(typeCounts)
        .filter(([_, val]) => val > 0)
        .map(([name, value]) => ({ name, value }));
    setWorkoutTypes(pieData);


    // 2. Weekly Activity Graph
    const weeksMap: Record<string, number> = {};
    const uniqueWeeks = new Set<string>();
    
    data.forEach(log => {
      const date = new Date(log.workout_date);
      // ISO Week calculation (simplified)
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const key = `W${weekNum}`;
      
      weeksMap[key] = (weeksMap[key] || 0) + 1;
      uniqueWeeks.add(`${date.getFullYear()}-${weekNum}`);
    });

    const graphData = Object.entries(weeksMap)
      .map(([name, count]) => ({ name, count }))
      .slice(-6); // Show last 6 active weeks
    setWeeklyActivity(graphData);
    
    // 3. Simple Streak (Consecutive Active Weeks)
    // Note: A real calendar streak calculation is complex, this is a simplified version
    // counting how many unique weeks exist in the log history.
    setStreakWeeks(uniqueWeeks.size); 
  };

  // Helper to get log specific stats for the list
  const getLogStats = (log: WorkoutLog) => {
    if (!Array.isArray(log.details)) return { pct: 100, label: 'Workout', sets: 'Done' };
    
    let total = 0; 
    let done = 0;
    let type = 'Workout';

    log.details.forEach((b: any) => {
        if (b.type === 'exercise') {
            type = 'Strength';
            total += b.sets?.length || 0;
            done += b.sets?.filter((s:any) => s.completed).length || 0;
        } else if (b.name?.toLowerCase().includes('run')) {
            if (type === 'Workout') type = 'Cardio';
        }
    });

    const pct = total === 0 ? 100 : Math.round((done / total) * 100);
    return { pct, label: type, sets: total > 0 ? `${done}/${total} Sets` : 'Completed' };
  };

  const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899']; // Emerald, Indigo, Amber, Pink

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Calculating gains...</div>;

  return (
    <main className="min-h-screen bg-black text-white pb-32 p-6">
      
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Your Progress</h1>
        <p className="text-zinc-500 text-sm">Consistency builds results.</p>
      </header>

      <div className="space-y-8">

        {/* 1. Top Stats Cards */}
        <section className="grid grid-cols-3 gap-3">
            <StatCard 
                label="Total Workouts" 
                value={totalWorkouts} 
                icon="🔥" 
                color="text-amber-400"
                subtext="Keep going!"
            />
            <StatCard 
                label="Active Weeks" 
                value={streakWeeks} 
                icon="📅" 
                color="text-indigo-400"
            />
            <StatCard 
                label="Avg. Completion" 
                value={`${avgCompletion}%`} 
                icon="🎯" 
                color="text-emerald-400"
                subtext="Quality reps"
            />
        </section>

        {/* 2. Charts Row */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Weekly Activity */}
            <div className="bg-zinc-900/30 border border-zinc-800 p-4 rounded-2xl">
                <h3 className="text-sm font-bold text-zinc-300 mb-4">Weekly Volume</h3>
                <div className="h-40 w-full">
                    {weeklyActivity.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyActivity}>
                                <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                                />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {weeklyActivity.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={index === weeklyActivity.length - 1 ? '#10b981' : '#3f3f46'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-zinc-600 text-xs">No data yet</div>
                    )}
                </div>
            </div>

            {/* Workout Types Breakdown */}
            <div className="bg-zinc-900/30 border border-zinc-800 p-4 rounded-2xl">
                <h3 className="text-sm font-bold text-zinc-300 mb-4">Training Split</h3>
                <div className="h-40 w-full flex items-center justify-center">
                    {workoutTypes.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={workoutTypes}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={60}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {workoutTypes.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                    ))}
                                </Pie>
                                <Legend verticalAlign="middle" align="right" layout="vertical" iconSize={8} wrapperStyle={{ fontSize: '10px', color: '#a1a1aa' }}/>
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="text-zinc-600 text-xs">No types recorded</div>
                    )}
                </div>
            </div>
        </section>

        {/* 3. Enhanced History Feed */}
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
             Recent Sessions
          </h2>
          <div className="space-y-3">
            {logs.slice(0, 10).map((log) => {
              const stats = getLogStats(log);
              const date = new Date(log.workout_date);
              
              return (
                <div key={log.id} className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl hover:bg-zinc-900/50 transition">
                   <div className="flex items-center gap-4">
                      {/* Date Badge */}
                      <div className="bg-zinc-800 w-12 h-12 rounded-xl flex flex-col items-center justify-center text-zinc-400">
                         <span className="text-xs font-bold uppercase">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                         <span className="text-lg font-bold text-white leading-none">{date.getDate()}</span>
                      </div>
                      
                      {/* Info */}
                      <div>
                         <div className="flex items-center gap-2 mb-1">
                             <h4 className="font-bold text-sm text-zinc-200">{stats.label}</h4>
                             <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                 stats.pct === 100 ? 'bg-emerald-500/10 text-emerald-400' : 
                                 stats.pct >= 80 ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'
                             }`}>
                                 {stats.pct}%
                             </span>
                         </div>
                         <p className="text-xs text-zinc-500">{stats.sets}</p>
                      </div>
                   </div>

                   {/* Right Side Status */}
                   <div className="text-right">
                       {stats.pct === 100 ? (
                           <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">★</div>
                       ) : (
                           <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">✓</div>
                       )}
                   </div>
                </div>
              );
            })}
             
             {logs.length === 0 && (
                <div className="text-center py-10 border border-zinc-800 border-dashed rounded-2xl">
                    <p className="text-zinc-500 text-sm">No completed workouts yet.</p>
                    <Link href="/dashboard" className="text-emerald-400 text-xs font-bold mt-2 inline-block">Go to Plan</Link>
                </div>
             )}
          </div>
        </section>

      </div>

      {/* --- Bottom Navigation Bar --- */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-lg border-t border-zinc-900 pb-safe pt-3 px-6 pb-6 flex justify-around items-center z-40">
          
          {/* Dashboard */}
          <Link href="/dashboard" className="flex flex-col items-center gap-1.5 text-zinc-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-medium">Plan</span>
          </Link>

          {/* Progress (Active) */}
          <Link href="/progress" className="flex flex-col items-center gap-1.5 text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-[10px] font-medium">Progress</span>
          </Link>

          {/* Settings */}
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