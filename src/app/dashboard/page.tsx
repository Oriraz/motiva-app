'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabaseClient';
import confetti from 'canvas-confetti';

// --- Types ---
type ExerciseSet = {
  setNumber: number;
  weight: string;
  reps: string;
  isBodyweight: boolean;
  completed: boolean;
};

type WorkoutBlock = {
  id: string;
  type: 'warmup' | 'exercise' | 'cooldown' | 'endurance_session';
  category: 'strength' | 'mobility' | 'cardio';
  name: string;
  subtitle?: string;
  instructions?: string[];
  sets: ExerciseSet[];
  isCompleted?: boolean; 
};

type WorkoutData = {
  planId: string;
  dayPlan: any;
  generalNotes?: string;
  blocks: WorkoutBlock[];
  isPureEnduranceDay: boolean;
};

// --- Helper: Parsing Logic ---
function parseWorkoutToBlocks(dayPlan: any): WorkoutData {
  const blocks: WorkoutBlock[] = [];
  let globalBlockIndex = 0;

  const cleanTitle = (t: string) => t.replace(/[:|-]$/, '').trim();
  const sourceList = dayPlan.detailed_workouts || [];

  if (sourceList.length === 0 && dayPlan.workouts) {
    sourceList.push({ title: 'Workout', instructions: dayPlan.workouts, focus: 'mixed' });
  }

  // בדיקות סוג אימון
  const hasStrength = sourceList.some((dw: any) => 
    ['strength', 'hypertrophy', 'mixed', 'resistance', 'powerlifting', 'hiit'].includes(dw.focus?.toLowerCase() || '')
  );
  
  const hasCardio = sourceList.some((dw: any) => 
    ['cardio', 'endurance', 'run', 'swim', 'bike', 'cycling'].includes(dw.focus?.toLowerCase() || '')
  );

  // יום אירובי טהור = יש אירובי ואין כוח בכלל
  const isPureEnduranceDay = hasCardio && !hasStrength;

  sourceList.forEach((dw: any) => {
    const titleLower = dw.title?.toLowerCase() || '';
    const focus = dw.focus?.toLowerCase() || 'strength';
    
    // 1. Warmup / Cooldown Detection
    const isBlockWarmup = titleLower.includes('warm') || (titleLower.includes('mobility') && focus !== 'mobility'); 
    const isBlockCooldown = titleLower.includes('cool') || (titleLower.includes('stretch') && focus !== 'mobility');

    if (isBlockWarmup || isBlockCooldown) {
      blocks.push({
        id: `block-${globalBlockIndex++}`,
        type: isBlockWarmup ? 'warmup' : 'cooldown',
        category: 'cardio',
        name: isBlockWarmup ? 'Warmup' : 'Cooldown',
        subtitle: dw.instructions?.join('\n'), 
        instructions: dw.instructions || [],
        sets: [],
        isCompleted: false
      });
      return;
    }

    // 2. Endurance Session Block
    if (focus === 'cardio' || focus === 'endurance') {
         blocks.push({
            id: `block-${globalBlockIndex++}`,
            type: 'endurance_session',
            category: 'cardio',
            name: cleanTitle(dw.title),
            subtitle: dw.instructions?.join('\n'),
            instructions: dw.instructions || [],
            sets: [],
            isCompleted: false
         });
         return;
    }

    // 3. Exercise Parsing
    if (dw.instructions && Array.isArray(dw.instructions)) {
      let currentExercise: WorkoutBlock | null = null;
      let pendingInstructions: string[] = [];

      dw.instructions.forEach((line: string) => {
        const exerciseMatch = line.match(/^(.+?)(?::|-)?\s+(\d+)\s*(?:sets|x|rounds)/i);
        const isMobilityItem = focus === 'mobility' && (line.match(/^\d+\./) || line.trim().length > 3);

        if (exerciseMatch) {
          // STRENGTH
          const name = exerciseMatch[1].trim();
          const setsCount = parseInt(exerciseMatch[2]);
          const repsMatch = line.match(/(\d+(?:-\d+)?)\s*reps/i);
          const weightMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)/i);
          const timeMatch = line.match(/(\d+)\s*(?:sec|min)/i);

          if (currentExercise) {
             if (pendingInstructions.length > 0) currentExercise.instructions = pendingInstructions;
             blocks.push(currentExercise);
             pendingInstructions = [];
          }

          currentExercise = {
            id: `block-${globalBlockIndex++}`,
            type: 'exercise',
            category: focus === 'mobility' ? 'mobility' : 'strength',
            name: cleanTitle(name),
            subtitle: line,
            instructions: [],
            sets: Array.from({ length: setsCount }).map((_, i) => ({
                setNumber: i + 1,
                weight: weightMatch ? weightMatch[1] : '',
                reps: repsMatch ? repsMatch[1] : (timeMatch ? timeMatch[0] : ''),
                isBodyweight: !weightMatch, 
                completed: false
            }))
          };

        } else if (isMobilityItem && !exerciseMatch) {
           // MOBILITY
           if (currentExercise) {
                if (pendingInstructions.length > 0) currentExercise.instructions = pendingInstructions;
                blocks.push(currentExercise);
                pendingInstructions = [];
           }
           const cleanName = line.replace(/^\d+\.\s*/, '').split(':')[0].trim();
           currentExercise = {
               id: `block-${globalBlockIndex++}`,
               type: 'exercise',
               category: 'mobility',
               name: cleanName,
               subtitle: line,
               instructions: [],
               sets: [{ setNumber: 1, weight: '', reps: '1', isBodyweight: true, completed: false }]
           };

        } else {
          // Notes
          if (currentExercise) {
            currentExercise.instructions?.push(line);
          } else {
            pendingInstructions.push(line);
          }
        }
      });

      if (currentExercise) {
        if (pendingInstructions.length > 0) (currentExercise as WorkoutBlock).instructions = pendingInstructions;
        blocks.push(currentExercise);
      }
    }
  });

  return { 
      planId: dayPlan.id || 'temp',
      dayPlan,
      generalNotes: '',
      blocks,
      isPureEnduranceDay
  };
}

// --- Components ---

function Stopwatch({ autoStart = false, label }: { autoStart?: boolean, label?: string }) {
    const [seconds, setSeconds] = useState(0);
    const [isRunning, setIsRunning] = useState(autoStart);
    
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRunning) {
            interval = setInterval(() => setSeconds(s => s + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [isRunning]);

    const format = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
    };

    return (
        <div className="flex flex-col items-center">
             {label && <div className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">{label}</div>}
             <div className="text-5xl font-mono font-bold text-white tabular-nums tracking-tight">
                 {format(seconds)}
             </div>
             <div className="flex gap-3 mt-4">
                 <button onClick={() => setIsRunning(!isRunning)} className={`px-6 py-2 rounded-full font-bold text-sm ${isRunning ? 'bg-zinc-800 text-red-400' : 'bg-emerald-500 text-black'}`}>
                     {isRunning ? 'PAUSE' : 'START'}
                 </button>
             </div>
        </div>
    );
}

function SessionTimerHeader() {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, []);
    const format = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };
    return (
        <div className="text-zinc-400 font-mono text-sm bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-800">
            {format(seconds)}
        </div>
    );
}

function RestTimer({ isActive, onReset }: { isActive: boolean; onReset: () => void }) {
  const [timeLeft, setTimeLeft] = useState(90);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (isActive) { setRunning(true); setTimeLeft(90); }
  }, [isActive]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (running && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      setRunning(false);
      onReset();
    }
    return () => { if (interval) clearInterval(interval); };
  }, [running, timeLeft, onReset]);

  if (!running && !isActive) return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900 border border-zinc-700 p-2 pr-4 rounded-full shadow-2xl z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-zinc-800 rounded-full w-10 h-10 flex items-center justify-center text-xs font-bold text-zinc-400">REST</div>
      <div className="flex flex-col items-center w-16">
          <span className="font-mono text-xl text-white font-bold">{formatTime(timeLeft)}</span>
      </div>
      <button onClick={() => setRunning(!running)} className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition ${running ? 'bg-amber-600' : 'bg-emerald-600'}`}>
        {running ? '⏸' : '▶'}
      </button>
      <button onClick={() => setTimeLeft(t => t + 30)} className="text-[10px] bg-zinc-800 px-1.5 rounded text-zinc-400 hover:text-white ml-2">+30s</button>
    </div>
  );
}

function EnduranceSessionView({ 
    block, 
    onFinish, 
    isSaving,
    isPureSession 
}: { 
    block: WorkoutBlock, 
    onFinish: () => void, 
    isSaving: boolean,
    isPureSession: boolean
}) {
    const lowerName = block.name.toLowerCase();
    const isRide = lowerName.includes('cycl') || lowerName.includes('bik') || lowerName.includes('rid');
    const finishLabel = isRide ? 'Finish Ride 🏁' : (lowerName.includes('run') ? 'Finish Run 🏁' : 'Finish Session 🏁');

    return (
        <div className="min-h-screen bg-black text-white flex flex-col relative pb-10">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none" />
            
            <header className="px-6 py-6 z-10">
                <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
                    <span>{isRide ? '🚴 Cycling' : '🏃 Endurance'}</span>
                </div>
                <h1 className="text-4xl font-bold leading-tight">{block.name}</h1>
                <p className="text-zinc-400 mt-2 text-lg whitespace-pre-line">{block.subtitle || 'Steady state effort'}</p>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center z-10 px-6">
                <div className="w-full max-w-sm bg-zinc-900/40 border border-zinc-800 backdrop-blur-md rounded-3xl p-10 shadow-2xl">
                    <Stopwatch autoStart={true} label="Session Time" />
                </div>
                
                {block.instructions && block.instructions.length > 0 && (
                    <div className="mt-8 bg-black/40 border border-zinc-800 rounded-xl p-4 w-full max-w-sm">
                        <h3 className="text-sm font-bold text-zinc-300 mb-2">Coach Notes:</h3>
                        <ul className="space-y-2">
                            {block.instructions.map((inst, i) => (
                                <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
                                    <span className="text-indigo-500 mt-1">•</span> {inst}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="px-6 z-10 mt-6">
                 <button 
                    onClick={onFinish}
                    disabled={isSaving}
                    className="w-full py-5 bg-white text-black text-xl font-bold rounded-2xl shadow-lg hover:bg-zinc-200 active:scale-95 transition-all"
                >
                    {isSaving ? 'Saving...' : finishLabel}
                </button>
            </div>
        </div>
    );
}

// --- Main Page ---
export default function ActiveWorkoutPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = supabaseBrowser();
  
  const dateStr = Array.isArray(params?.date) ? params.date[0] : params?.date;

  const [loading, setLoading] = useState(true);
  const [workoutData, setWorkoutData] = useState<WorkoutData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [triggerRest, setTriggerRest] = useState(false);
  
  const [activeEnduranceBlockId, setActiveEnduranceBlockId] = useState<string | null>(null);

  useEffect(() => {
    const loadPlanAndHistory = async () => {
      try {
        if (!dateStr) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/'); return; }

        const { data: plans } = await supabase
          .from('week_plans')
          .select('*')
          .eq('user_id', user.id)
          .order('week_start_date', { ascending: false });

        if (!plans || plans.length === 0) { router.push('/dashboard'); return; }

        const currentPlanRow = plans[0];
        const planContent = currentPlanRow.plan.plan ? currentPlanRow.plan.plan : currentPlanRow.plan;
        
        // --- FIX: Robust Date Parsing (Timezone Safe) ---
        // Instead of new Date(dateStr) which might shift due to timezone,
        // we parse "YYYY-MM-DD" directly to get the intended date.
        const [y, m, d] = (dateStr as string).split('-').map(Number);
        const dateObj = new Date(y, m - 1, d); // Construct date in local time
        
        if (isNaN(dateObj.getTime())) {
             console.error("Invalid date");
             router.push('/dashboard'); 
        return;
      }

        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        
        // Find the day in the plan
        const dayPlan = planContent.days.find((d: any) => 
            d.weekday.toLowerCase().startsWith(dayName.toLowerCase())
        );

        if (!dayPlan) { 
            console.error("Day not found in plan for:", dayName);
            // Don't crash, just stop loading and show message
            setLoading(false);
        return;
      }

        let parsedData = parseWorkoutToBlocks(dayPlan);

        // Fetch History
        if (!parsedData.isPureEnduranceDay) {
            const { data: lastLogs } = await supabase
                .from('workout_logs')
                .select('details')
                .eq('user_id', user.id)
                .eq('status', 'completed')
                .order('workout_date', { ascending: false })
                .limit(5);

            if (lastLogs && lastLogs.length > 0) {
                const historyMap: Record<string, string> = {};
                lastLogs.forEach((log: any) => {
                    if (Array.isArray(log.details)) {
                        log.details.forEach((block: any) => {
                            if (block.type === 'exercise' && block.sets) {
                                const completedSets = block.sets.filter((s:any) => s.completed);
                                if (completedSets.length > 0) {
                                    const lastSet = completedSets[completedSets.length - 1];
                                    if (!historyMap[block.name] && lastSet.weight) {
                                        historyMap[block.name] = lastSet.weight;
                                    }
                                }
                            }
                        });
                    }
                });

                parsedData.blocks = parsedData.blocks.map(block => {
                    if (block.type === 'exercise' && historyMap[block.name]) {
                        const prevWeight = historyMap[block.name];
                        return {
                            ...block,
                            sets: block.sets.map(set => ({
                                ...set,
                                weight: set.weight || prevWeight,
                                isBodyweight: false
                            }))
                        };
                    }
                    return block;
                });
            }
        }

        setWorkoutData(parsedData);
      } catch (err) {
        console.error("Error loading workout:", err);
      } finally {
        setLoading(false);
      }
    };
    loadPlanAndHistory();
  }, [dateStr, router, supabase]);

  const updateSet = (blockIndex: number, setIndex: number, field: keyof ExerciseSet, value: any) => {
    if (!workoutData) return;
    const newBlocks = [...workoutData.blocks];
    if (newBlocks[blockIndex].type !== 'exercise') return;

    const newSets = [...newBlocks[blockIndex].sets];
    
    if (field === 'isBodyweight') {
        const isNowBW = value === true;
        newSets[setIndex] = { 
            ...newSets[setIndex], 
            isBodyweight: isNowBW,
            weight: isNowBW ? '' : newSets[setIndex].weight
        };
    } else {
        newSets[setIndex] = { ...newSets[setIndex], [field]: value };
    }

    if (field === 'completed' && value === true && newBlocks[blockIndex].category !== 'mobility') {
        setTriggerRest(true);
        setTimeout(() => setTriggerRest(false), 100); 
    }

    newBlocks[blockIndex] = { ...newBlocks[blockIndex], sets: newSets };
    setWorkoutData({ ...workoutData, blocks: newBlocks });
  };

  const toggleBlockCompletion = (blockIndex: number) => {
    if (!workoutData) return;
    const newBlocks = [...workoutData.blocks];
    newBlocks[blockIndex].isCompleted = !newBlocks[blockIndex].isCompleted;
    setWorkoutData({ ...workoutData, blocks: newBlocks });
  };

  const markEnduranceBlockComplete = (blockId: string) => {
      if (!workoutData) return;
      const newBlocks = workoutData.blocks.map(b => 
          b.id === blockId ? { ...b, isCompleted: true } : b
      );
      setWorkoutData({ ...workoutData, blocks: newBlocks });
      setActiveEnduranceBlockId(null);
  };

  const finishWorkout = async () => {
    if (!workoutData || !dateStr) return;
    setIsSaving(true);
    
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#34D399', '#ffffff', '#10B981'] });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const detailedLog = workoutData.blocks.map(b => ({
        name: b.name,
        type: b.type,
        completed: b.type === 'exercise' ? undefined : b.isCompleted,
        sets: b.type === 'exercise' ? b.sets.map(s => ({
            set: s.setNumber,
            weight: s.weight,
            reps: s.reps,
            is_bodyweight: s.isBodyweight,
            completed: s.completed
        })) : undefined
    }));

    const { error } = await supabase.from('workout_logs').upsert({
      user_id: user.id,
      workout_date: dateStr,
      status: 'completed',
      details: detailedLog 
    }, { onConflict: 'user_id, workout_date' });

    if (error) { alert('Error saving workout'); setIsSaving(false); } 
    else { setTimeout(() => router.push('/dashboard'), 2000); }
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Loading workout...</div>;
  if (!workoutData) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Workout data unavailable.</div>;

  // 1. Pure Endurance
  if (workoutData.isPureEnduranceDay) {
      const mainBlock = workoutData.blocks.find(b => b.type === 'endurance_session') || workoutData.blocks[0];
      return <EnduranceSessionView block={mainBlock} onFinish={finishWorkout} isSaving={isSaving} isPureSession={true} />;
  }

  // 2. Active Endurance Block (Mixed)
  if (activeEnduranceBlockId) {
      const activeBlock = workoutData.blocks.find(b => b.id === activeEnduranceBlockId);
      if (activeBlock) {
          return <EnduranceSessionView block={activeBlock} onFinish={() => markEnduranceBlockComplete(activeBlock.id)} isSaving={false} isPureSession={false} />;
      }
  }

  // 3. Main List
  let totalTrackables = 0;
  let doneTrackables = 0;
  workoutData.blocks.forEach(b => {
      if (b.type === 'exercise') {
          totalTrackables += b.sets.length;
          doneTrackables += b.sets.filter(s => s.completed).length;
      } else {
          totalTrackables += 1;
          if (b.isCompleted) doneTrackables += 1;
      }
  });
  const displayProgress = totalTrackables === 0 ? 0 : Math.round((doneTrackables / totalTrackables) * 100);

  return (
    <main className="min-h-screen bg-black text-white pb-40">
      <header className="sticky top-0 bg-black/90 backdrop-blur z-20 border-b border-zinc-900 px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-zinc-400 text-xs">✕ Cancel</button>
        <div className="flex flex-col items-center">
            <h1 className="font-bold text-sm text-white">{workoutData.dayPlan.weekday} Session</h1>
            <div className="flex items-center gap-2 mt-1">
               <SessionTimerHeader />
               <span className="text-xs text-zinc-500">{displayProgress}%</span>
            </div>
        </div>
        <button onClick={finishWorkout} disabled={isSaving} className="bg-emerald-600 text-white px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Finish'}
          </button>
      </header>

      <div className="h-1 w-full bg-zinc-900 sticky top-[62px] z-10">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${displayProgress}%` }} />
      </div>

      <div className="p-4 space-y-6 max-w-lg mx-auto mt-2">
        {workoutData.generalNotes && (
            <div className="bg-zinc-900/30 border border-zinc-800 p-3 rounded-xl mb-4">
                <p className="text-xs text-zinc-400 italic">💡 {workoutData.generalNotes}</p>
            </div>
        )}

        {workoutData.blocks.map((block, blockIndex) => {
            if (block.type === 'warmup' || block.type === 'cooldown') {
                return (
                    <div key={block.id} onClick={() => toggleBlockCompletion(blockIndex)} className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${block.isCompleted ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-zinc-900/50 border-zinc-800'}`}>
                        <div className="flex-1">
                            <h3 className={`font-bold ${block.type === 'warmup' ? 'text-amber-200' : 'text-indigo-200'}`}>{block.name}</h3>
                            {block.subtitle && <p className="text-sm text-zinc-300 mt-0.5 font-medium whitespace-pre-line">{block.subtitle}</p>}
            </div>
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center ml-3 ${block.isCompleted ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-zinc-600'}`}>{block.isCompleted && '✓'}</div>
          </div>
                );
            }

            if (block.type === 'endurance_session') {
                const isRide = block.name.toLowerCase().includes('bik') || block.name.toLowerCase().includes('cycl');
                return (
                    <div key={block.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 mb-4 animate-in fade-in slide-in-from-bottom-4">
                         <div className="flex justify-between items-start mb-3">
                <div>
                                <h2 className="text-lg font-bold text-white leading-tight">{block.name}</h2>
                                <p className="text-sm text-emerald-400/80 font-medium mt-0.5">{block.subtitle || 'Cardio Session'}</p>
                </div>
                            <div className="text-2xl">{isRide ? '🚴' : '🏃'}</div>
                  </div>
                         <div className="mt-4">
                             {block.isCompleted ? (
                                 <button onClick={() => toggleBlockCompletion(blockIndex)} className="w-full py-3 bg-emerald-900/30 border border-emerald-500/50 text-emerald-400 rounded-xl font-bold flex items-center justify-center gap-2">✓ Completed</button>
                             ) : (
                                 <button onClick={() => setActiveEnduranceBlockId(block.id)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-500 active:scale-95 transition-all flex items-center justify-center gap-2">▶ Start {isRide ? 'Ride' : 'Run'}</button>
                             )}
                </div>
              </div>
                );
            }

            const isMobility = block.category === 'mobility';
            return (
                <div key={block.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="mb-3 pl-1">
                        <div className="flex justify-between items-start">
                            <h2 className="text-lg font-bold text-white leading-tight">{block.name}</h2>
                            {isMobility && <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded ml-2">Mobility</span>}
                        </div>
                        {block.subtitle && <p className="text-sm text-emerald-400/80 font-medium mt-0.5">{block.subtitle}</p>}
              </div>

                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                        {!isMobility && (
                            <div className="grid grid-cols-12 bg-zinc-900/50 p-2 text-[10px] text-zinc-500 uppercase font-bold tracking-wider text-center border-b border-zinc-800">
                                <div className="col-span-2">Set</div>
                                <div className="col-span-4">kg / BW</div>
                                <div className="col-span-3">Reps</div>
                                <div className="col-span-3">Done</div>
            </div>
                        )}

                        {block.sets.map((set, setIndex) => (
                            <div key={setIndex} className={`grid grid-cols-12 border-b last:border-0 border-zinc-800/50 items-center p-2 py-3 transition-colors ${set.completed ? 'bg-emerald-900/10' : ''}`}>
                                {isMobility ? (
                                    <>
                                        <div className="col-span-9 pl-3 text-sm text-zinc-300 font-medium">Set {set.setNumber}</div>
                                        <div className="col-span-3 flex justify-center">
                                            <button onClick={() => updateSet(blockIndex, setIndex, 'completed', !set.completed)} className={`w-10 h-8 rounded-lg flex items-center justify-center transition-all ${set.completed ? 'bg-emerald-500 text-black shadow-lg' : 'bg-zinc-800 text-zinc-600 hover:bg-zinc-700 border border-zinc-700'}`}>
                                                {set.completed ? '✓' : ''}
        </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="col-span-2 text-center font-bold text-zinc-500 text-xs">{set.setNumber}</div>
                                        <div className="col-span-4 px-1 relative flex items-center gap-1">
                                            {!set.isBodyweight ? (
                                                <input type="number" placeholder="-" value={set.weight} onChange={(e) => updateSet(blockIndex, setIndex, 'weight', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg text-center py-2 text-sm text-white focus:border-emerald-500 outline-none placeholder:text-zinc-700" />
                                            ) : (
                                                <div className="w-full bg-zinc-800/50 border border-zinc-800 rounded-lg text-center py-2 text-xs text-zinc-400 font-medium">Bodyweight</div>
                                            )}
                                            <button onClick={() => updateSet(blockIndex, setIndex, 'isBodyweight', !set.isBodyweight)} className={`absolute -top-1.5 -right-0.5 text-[8px] px-1 rounded border ${set.isBodyweight ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>BW</button>
                                        </div>
                                        <div className="col-span-3 px-1">
                                            <input type="number" placeholder="-" value={set.reps} onChange={(e) => updateSet(blockIndex, setIndex, 'reps', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg text-center py-2 text-sm text-white focus:border-emerald-500 outline-none placeholder:text-zinc-700" />
                                        </div>
                                        <div className="col-span-3 flex justify-center">
                                            <button onClick={() => updateSet(blockIndex, setIndex, 'completed', !set.completed)} className={`w-10 h-8 rounded-lg flex items-center justify-center transition-all ${set.completed ? 'bg-emerald-500 text-black shadow-lg' : 'bg-zinc-800 text-zinc-600 hover:bg-zinc-700 border border-zinc-700'}`}>
                                                {set.completed ? '✓' : ''}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
              );
            })}
          </div>
      <RestTimer isActive={triggerRest} onReset={() => setTriggerRest(false)} />
    </main>
  );
}