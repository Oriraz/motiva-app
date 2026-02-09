'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabaseBrowser } from '../../../lib/supabaseClient';
import confetti from 'canvas-confetti';
import { format, parseISO } from 'date-fns';

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
  type: 'warmup' | 'exercise' | 'cooldown' | 'endurance_session' | 'general_block';
  category: 'strength' | 'mobility' | 'cardio';
  name: string;
  subtitle?: string;
  instructions?: string[];
  sets: ExerciseSet[];
  isCompleted?: boolean;
  durationSeconds?: number;
  mode?: 'run' | 'bike' | 'swim' | 'general';
};

type WorkoutData = {
  planId: string;
  dayPlan: any;
  generalNotes?: string;
  blocks: WorkoutBlock[];
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

  sourceList.forEach((dw: any) => {
    const titleLower = dw.title?.toLowerCase() || '';
    const focus = dw.focus?.toLowerCase() || 'strength';
    const fullText = (dw.title + ' ' + (dw.instructions?.join(' ') || '')).toLowerCase();
    
    // --- 1. זיהוי סוג פעילות ---
    let mode: 'run' | 'bike' | 'swim' | 'general' = 'general';
    if (titleLower.includes('swim') || titleLower.includes('pool') || fullText.includes('freestyle')) mode = 'swim';
    else if (titleLower.includes('cycl') || titleLower.includes('bik') || titleLower.includes('rid')) mode = 'bike';
    else if (titleLower.includes('run') || titleLower.includes('jog') || titleLower.includes('treadmill')) mode = 'run';
    
    // --- 2. זיהוי זמנים ---
    let detectedSeconds = 0;
    const minMatch = fullText.match(/(\d+)\s*(?:min|mins)\b/); 
    const secMatch = fullText.match(/(\d+)\s*(?:sec|secs|s)\b/);
    if (minMatch) detectedSeconds = parseInt(minMatch[1]) * 60;
    else if (secMatch) detectedSeconds = parseInt(secMatch[1]);

    // --- 3. זיהוי חימום/קירור ברמת הכותרת ---
    const isHeaderWarmup = titleLower.includes('warm') || (titleLower.includes('mobility') && focus !== 'mobility'); 
    const isHeaderCooldown = titleLower.includes('cool') || (titleLower.includes('stretch') && focus !== 'mobility');

    if (isHeaderWarmup || isHeaderCooldown) {
      blocks.push({
        id: `block-${globalBlockIndex++}`,
        type: isHeaderWarmup ? 'warmup' : 'cooldown',
        category: 'cardio', 
        name: isHeaderWarmup ? 'Warm Up' : 'Cool Down',
        subtitle: dw.instructions?.join('\n'), 
        instructions: dw.instructions || [],
        sets: [],
        isCompleted: false,
        durationSeconds: detectedSeconds > 0 ? detectedSeconds : 300,
        mode
      });
      return;
    }

    // --- 4. זיהוי אימון אירובי ראשי (Endurance) ---
    const isExplicitCardioTitle = 
        titleLower.includes('run') || 
        titleLower.includes('cycl') || 
        titleLower.includes('swim') ||
        titleLower.includes('cardio') ||
        titleLower.includes('treadmill') ||
        titleLower.includes('elliptical') ||
        titleLower.includes('rowing');

    const isPureCardioFocus = focus === 'cardio' || focus === 'endurance';

    // אם זה אירובי מובהק ואין הוראות של סטים/חזרות (כמו כוח), זה אימון אירובי
    if ((isExplicitCardioTitle || isPureCardioFocus) && !fullText.includes('sets of') && !fullText.includes(' x ')) {
         blocks.push({
            id: `block-${globalBlockIndex++}`,
            type: 'endurance_session',
            category: 'cardio',
            name: cleanTitle(dw.title),
            subtitle: dw.instructions?.join('\n'),
            instructions: dw.instructions || [],
            sets: [],
            isCompleted: false,
            durationSeconds: detectedSeconds,
            mode
         });
         return;
    }

    // --- 5. פירוק מתקדם של שורות ---
    if (dw.instructions && Array.isArray(dw.instructions)) {
      let currentExercise: WorkoutBlock | null = null;
      let pendingInstructions: string[] = [];
      let foundAnyExercise = false;

      dw.instructions.forEach((line: string) => {
        const lineLower = line.toLowerCase();
        
        // --- TIKUN START: Smart Line Detection ---
        // בדיקה: האם השורה מתחילה בזמן (למשל "5 minutes of...")
        const startsWithTime = lineLower.match(/^(\d+)\s*(?:min|mins|minute|minutes|sec|secs|seconds)/);
        
        // בדיקה: האם השורה מכילה מילות מפתח של אירובי/חימום
        const isWarmupKeyword = lineLower.includes('warm-up') || lineLower.includes('warm up');
        const isCooldownKeyword = lineLower.includes('cool-down') || lineLower.includes('cool down');
        const isCardioKeyword = lineLower.includes('cardio') || lineLower.includes('treadmill') || lineLower.includes('run') || lineLower.includes('walk') || lineLower.includes('jog') || lineLower.includes('cycle') || lineLower.includes('rowing');

        // אם זה חימום/קירור, או שזה מתחיל בזמן ויש בזה מילת כושר
        if (isWarmupKeyword || isCooldownKeyword || (startsWithTime && isCardioKeyword)) {
            // סגירת תרגיל קודם אם קיים
            if (currentExercise) {
                if (pendingInstructions.length > 0) currentExercise.instructions = pendingInstructions;
                blocks.push(currentExercise);
                currentExercise = null;
                pendingInstructions = [];
            }

            // חילוץ זמן
            let lineSeconds = 300; // ברירת מחדל
            const lMin = line.match(/(\d+)\s*(?:min|mins)/i);
            const lSec = line.match(/(\d+)\s*(?:sec|secs|s)\b/i);
            if (lMin) lineSeconds = parseInt(lMin[1]) * 60;
            else if (lSec) lineSeconds = parseInt(lSec[1]);

            // קביעת סוג הבלוק
            let blockType: 'warmup' | 'cooldown' | 'general_block' = 'general_block';
            let blockName = 'Cardio Segment';
            
            if (isWarmupKeyword) { blockType = 'warmup'; blockName = 'Warm Up'; }
            else if (isCooldownKeyword) { blockType = 'cooldown'; blockName = 'Cool Down'; }
            else { blockName = line.split(':')[0] || 'Cardio'; } // ניסיון לקחת שם מהשורה

            blocks.push({
                id: `block-${globalBlockIndex++}`,
                type: blockType,
                category: 'cardio',
                name: blockName,
                subtitle: line,
                instructions: [line],
                sets: [],
                isCompleted: false,
                durationSeconds: lineSeconds,
                mode: 'general'
            });
            foundAnyExercise = true;
            return; // סיימנו עם השורה הזו
        }
        // --- TIKUN END ---

        const standardMatch = line.match(/^(.+?)(?::|-)?\s+(\d+)\s*(?:sets|x|rounds)/i);
        const reversedMatch = line.match(/^(\d+)\s*sets\s+(?:of\s+)?(.*)/i);

        let name = '';
        let setsCount = 0;
        let repsMatch = null;
        let weightMatch = null;
        let timeMatchInSet = null;

        if (standardMatch) {
            name = standardMatch[1].trim();
            setsCount = parseInt(standardMatch[2]);
            repsMatch = line.match(/(\d+(?:-\d+)?)\s*reps/i);
            weightMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)/i);
            timeMatchInSet = line.match(/(\d+)\s*(?:sec|min)/i);
        } else if (reversedMatch) {
            setsCount = parseInt(reversedMatch[1]);
            const remainder = reversedMatch[2];
            repsMatch = remainder.match(/(\d+(?:-\d+)?)\s*reps/i);
            weightMatch = remainder.match(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)/i);
            timeMatchInSet = remainder.match(/(\d+)\s*(?:sec|min)/i);
            name = remainder
                .replace(/(\d+(?:-\d+)?)\s*reps/i, '')
                .replace(/(\d+(?:\.\d+)?)\s*(?:kg|lbs)/i, '')
                .replace(/^\s*of\s+/i, '')
                .trim();
        }

        if (standardMatch || reversedMatch) {
          foundAnyExercise = true;
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
                reps: repsMatch ? repsMatch[1] : (timeMatchInSet ? timeMatchInSet[0] : ''),
                isBodyweight: !weightMatch, 
                completed: false
            }))
          };

        } else if ((focus === 'mobility' && (line.match(/^\d+\./) || line.trim().length > 3))) {
           foundAnyExercise = true;
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
      else if (pendingInstructions.length > 0 && !foundAnyExercise) {
          blocks.push({
            id: `block-${globalBlockIndex++}`,
            type: 'general_block', 
            category: 'strength',
            name: cleanTitle(dw.title),
            subtitle: pendingInstructions.join('\n'),
            instructions: pendingInstructions,
            sets: [],
            isCompleted: false
          });
      }
    }
  });

  return { 
      planId: dayPlan.id || 'temp',
      dayPlan,
      generalNotes: '',
      blocks
  };
}

// --- Components ---

function InlineTimer({ defaultSeconds }: { defaultSeconds: number }) {
  const [seconds, setSeconds] = useState(defaultSeconds);
  const [isActive, setIsActive] = useState(false);
  const [initial, setInitial] = useState(defaultSeconds);

  useEffect(() => {
    let interval: any = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((s) => s - 1);
      }, 1000);
    } else if (seconds === 0) {
      setIsActive(false);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const toggle = (e: any) => { e.stopPropagation(); setIsActive(!isActive); };
  const reset = (e: any) => { e.stopPropagation(); setIsActive(false); setSeconds(initial); };

  const format = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 ml-auto shrink-0" onClick={e => e.stopPropagation()}>
      <div className={`font-mono text-sm font-bold w-12 text-center ${seconds === 0 ? 'text-emerald-500' : 'text-white'}`}>
        {format(seconds)}
      </div>
      <button onClick={toggle} className="w-8 h-8 flex items-center justify-center rounded bg-zinc-700 hover:bg-zinc-600 text-white transition-colors">
        {isActive ? '⏸' : '▶'}
      </button>
      <button onClick={reset} className="w-8 h-8 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">
        ⟲
      </button>
    </div>
  );
}

function BigStopwatch({ autoStart = false, label }: { autoStart?: boolean, label?: string }) {
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
             <div className="text-6xl font-mono font-bold text-white tabular-nums tracking-tight">
                 {format(seconds)}
             </div>
             <div className="flex gap-4 mt-6">
                 <button onClick={() => setIsRunning(!isRunning)} className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all ${isRunning ? 'bg-zinc-800 text-red-400 ring-2 ring-red-400/20' : 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'}`}>
                     {isRunning ? '⏸' : '▶'}
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

function EnduranceSessionView({ 
    block, 
    onFinish, 
    onBack,
    isSaving
}: { 
    block: WorkoutBlock, 
    onFinish: () => void, 
    onBack: () => void,
    isSaving: boolean
}) {
    const modeConfig = {
        run: { icon: '🏃', label: 'Running', color: 'indigo' },
        bike: { icon: '🚴', label: 'Cycling', color: 'indigo' },
        swim: { icon: '🏊', label: 'Swimming', color: 'cyan' },
        general: { icon: '⚡', label: 'Cardio', color: 'emerald' }
    }[block.mode || 'general'];
    
    const info = modeConfig || { icon: '⚡', label: 'Cardio' };
    const durationMin = block.durationSeconds ? Math.floor(block.durationSeconds / 60) : 0;

    return (
        <div className="fixed inset-0 bg-black text-white flex flex-col z-50 animate-in slide-in-from-bottom-10 duration-300">
            <div className={`absolute top-0 left-0 w-full h-2/3 bg-gradient-to-b ${block.mode === 'swim' ? 'from-cyan-900/30' : 'from-indigo-900/30'} to-black pointer-events-none`} />
            
            <header className="px-6 py-6 z-10 flex justify-between items-start">
                <button onClick={onBack} className="w-10 h-10 rounded-full bg-zinc-900/50 flex items-center justify-center text-zinc-400 hover:text-white transition">✕</button>
            </header>

            <div className="flex-1 flex flex-col items-center pt-10 z-10 px-6">
                <div className="text-center mb-8">
                    <div className={`inline-flex items-center gap-2 ${block.mode === 'swim' ? 'text-cyan-400' : 'text-indigo-400'} mb-2 font-bold uppercase tracking-wider text-sm`}>
                         {info.icon} {info.label}
                    </div>
                    <h1 className="text-3xl font-bold leading-tight">{block.name}</h1>
                    {durationMin > 0 && <p className="text-zinc-500 mt-2">Target: {durationMin} min</p>}
                </div>

                <div className="mb-12">
                    <BigStopwatch autoStart={true} label="Duration" />
                </div>
                
                {block.instructions && block.instructions.length > 0 && (
                    <div className="w-full max-w-sm bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-5 overflow-y-auto max-h-48">
                        <h3 className="text-xs text-zinc-500 uppercase font-bold mb-3">Session Details</h3>
                        <ul className="space-y-3">
                            {block.instructions.map((inst, i) => (
                                <li key={i} className="text-sm text-zinc-300 flex items-start gap-3 leading-relaxed">
                                    <span className={`${block.mode === 'swim' ? 'text-cyan-500' : 'text-indigo-500'} mt-1.5 text-[10px]`}>●</span> {inst}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="p-6 z-10 bg-black border-t border-zinc-900 safe-area-pb">
                 <button 
                    onClick={onFinish}
                    disabled={isSaving}
                    className="w-full py-4 bg-white text-black text-lg font-bold rounded-2xl shadow-lg hover:bg-zinc-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    {isSaving ? 'Saving...' : (
                        <>
                           <span>🏁</span> Finish {info.label}
                        </>
                    )}
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

        const targetDate = parseISO(dateStr); 
        const targetDayName = format(targetDate, 'EEE');

        const relevantPlan = plans.find((p: any) => {
             // TIKUN: Null check
             if (!p.week_start_date) return false;
             const start = parseISO(p.week_start_date);
             const end = new Date(start);
             end.setDate(start.getDate() + 7);
             return targetDate >= start && targetDate < end;
        }) || plans[0];

        const planContent = relevantPlan.plan.plan ? relevantPlan.plan.plan : relevantPlan.plan;
        
        const dayPlan = planContent.days.find((d: any) => 
            d.weekday.toLowerCase().startsWith(targetDayName.toLowerCase())
        );

        if (!dayPlan) { 
            console.error("Day plan not found for", targetDayName);
            setLoading(false); 
            return; 
        }

        let parsedData = parseWorkoutToBlocks(dayPlan);

        const { data: lastLogs } = await supabase.from('workout_logs').select('details').eq('user_id', user.id).eq('status', 'completed').order('workout_date', { ascending: false }).limit(5);

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
        newSets[setIndex] = { ...newSets[setIndex], isBodyweight: isNowBW, weight: isNowBW ? '' : newSets[setIndex].weight };
    } else {
        newSets[setIndex] = { ...newSets[setIndex], [field]: value };
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
      const newBlocks = workoutData.blocks.map(b => b.id === blockId ? { ...b, isCompleted: true } : b);
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

    await supabase.from('workout_logs').upsert({
      user_id: user.id,
      workout_date: dateStr,
      status: 'completed',
      details: detailedLog 
    }, { onConflict: 'user_id, workout_date' });

    setTimeout(() => router.push('/dashboard'), 2000);
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Loading workout...</div>;
  if (!workoutData) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Workout data unavailable.</div>;

  // --- FULL SCREEN ENDURANCE MODE ---
  if (activeEnduranceBlockId) {
      const activeBlock = workoutData.blocks.find(b => b.id === activeEnduranceBlockId);
      if (activeBlock) {
          return <EnduranceSessionView 
                    block={activeBlock} 
                    onFinish={() => markEnduranceBlockComplete(activeBlock.id)}
                    onBack={() => setActiveEnduranceBlockId(null)}
                    isSaving={false}
                 />;
      }
  }

  // --- MAIN LIST VIEW ---
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
            
            // --- 1. WARMUP / COOL DOWN / GENERAL with GADGET ---
            if (block.type === 'warmup' || block.type === 'cooldown' || block.type === 'general_block') {
                return (
                    <div key={block.id} onClick={() => toggleBlockCompletion(blockIndex)} className={`p-4 rounded-xl border flex flex-col cursor-pointer transition-all ${block.isCompleted ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-zinc-900/50 border-zinc-800'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <h3 className={`font-bold ${block.type === 'warmup' ? 'text-amber-200' : 'text-indigo-200'}`}>{block.name}</h3>
                            </div>
                            
                            {block.durationSeconds && !block.isCompleted && (
                                <InlineTimer defaultSeconds={block.durationSeconds} />
                            )}

                            <div className={`w-6 h-6 rounded-full border flex items-center justify-center ml-3 ${block.isCompleted ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-zinc-600'}`}>{block.isCompleted && '✓'}</div>
                        </div>
                        {block.subtitle && <p className="text-sm text-zinc-300 mt-2 font-medium whitespace-pre-line pl-1 border-l-2 border-zinc-700 ml-0.5">{block.subtitle}</p>}
                    </div>
                );
            }

            // --- 2. MAIN ENDURANCE SESSION (Card) ---
            if (block.type === 'endurance_session') {
                const modeConfig = {
                    run: { icon: '🏃', label: 'Running', color: 'indigo' },
                    bike: { icon: '🚴', label: 'Cycling', color: 'indigo' },
                    swim: { icon: '🏊', label: 'Swimming', color: 'cyan' },
                    general: { icon: '⚡', label: 'Cardio', color: 'emerald' }
                }[block.mode || 'general'];
                
                const durationMin = block.durationSeconds ? Math.floor(block.durationSeconds / 60) : 0;
                
                return (
                    <div key={block.id} className={`bg-gradient-to-br ${block.mode === 'swim' ? 'from-cyan-900/20' : 'from-zinc-900'} to-black border border-zinc-800 rounded-2xl p-5 mb-4 shadow-lg overflow-hidden relative`}>
                         <div className="absolute -right-4 -bottom-4 text-8xl opacity-5 pointer-events-none grayscale">
                            {modeConfig.icon}
                         </div>

                         <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${block.mode === 'swim' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-indigo-500/20 text-indigo-300'} text-[10px] font-bold uppercase tracking-wider mb-2`}>
                                    {modeConfig.label} • Main Set
                                </div>
                                <h2 className="text-xl font-bold text-white leading-tight">{block.name}</h2>
                                {durationMin > 0 && <p className="text-sm text-zinc-400 mt-1">Target: {durationMin} minutes</p>}
                            </div>
                         </div>
                         
                         {block.subtitle && (
                             <div className="mb-6 relative z-10 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
                                 <p className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-line">{block.subtitle}</p>
                             </div>
                         )}

                         <div className="relative z-10">
                             {block.isCompleted ? (
                                 <button onClick={() => toggleBlockCompletion(blockIndex)} className="w-full py-3 bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 rounded-xl font-bold flex items-center justify-center gap-2">✓ Session Completed</button>
                             ) : (
                                 <button onClick={() => setActiveEnduranceBlockId(block.id)} className={`w-full py-4 ${block.mode === 'swim' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-indigo-600 hover:bg-indigo-500'} text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2`}>
                                     <span>▶</span> Start {modeConfig.label}
                                 </button>
                             )}
                         </div>
                    </div>
                );
            }

            // --- 3. EXERCISES ---
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
    </main>
  );
}