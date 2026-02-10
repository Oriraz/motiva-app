'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabaseClient';
import FixedActivityManager, { FixedActivity } from '../../components/FixedActivityManager';

const DOW_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const FACILITY_OPTIONS = [
  { id: 'gym', label: 'Commercial Gym' },
  { id: 'home_gym', label: 'Full Home Gym' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'kettlebells', label: 'Kettlebells' },
  { id: 'barbell', label: 'Barbell & Plates' },
  { id: 'pullup_bar', label: 'Pull-up Bar' },
  { id: 'bands', label: 'Resistance Bands' },
  { id: 'bench', label: 'Weight Bench' },
  { id: 'yoga_mat', label: 'Yoga Mat' },
  { id: 'pool', label: 'Swimming Pool' },
  { id: 'bicycle', label: 'Bicycle' },
  { id: 'treadmill', label: 'Treadmill' },
];

export default function OnboardingPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  // הוספתי שלב אחד נוסף (סה"כ 5 שלבים)
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // --- Form State ---
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('male');
  
  const [age, setAge] = useState<number | ''>('');
  const [weight, setWeight] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');

  // שינוי: מטרות מרובות
  const [goals, setGoals] = useState<string[]>(['get_active']);
  const [level, setLevel] = useState('beginner'); // רמה כללית
  
  // שינוי: ניסיון ספציפי
  const [experience, setExperience] = useState({
    strength: 'beginner',
    running: 'beginner',
    cycling: 'beginner',
    swimming: 'beginner',
    mobility: 'beginner'
  });
  
  const [trainingConstraints, setTrainingConstraints] = useState('');
  const [facilities, setFacilities] = useState<string[]>([]);

  const [defaultSessions, setDefaultSessions] = useState(3);
  const [defaultDays, setDefaultDays] = useState<string[]>([]);
  const [fixedActivities, setFixedActivities] = useState<FixedActivity[]>([]);

  // --- Validation Helpers ---
  const isStep1Valid = () => {
    return (
      fullName.trim().length > 0 &&
      age !== '' && Number(age) > 0 &&
      weight !== '' && Number(weight) > 0 &&
      height !== '' && Number(height) > 0
    );
  };

  useEffect(() => {
    const checkUserAndProfile = async () => {
      const { data: authData } = await supabase.auth.getUser();
      
      if (!authData.user) {
        router.push('/');
        return;
      }

      setUserId(authData.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profile) {
        router.push('/dashboard');
        return;
      }

      if (!fullName) {
        const metaName = authData.user.user_metadata?.full_name || authData.user.user_metadata?.name;
        if (metaName) {
          setFullName(metaName);
        } else if (authData.user.email) {
          setFullName(authData.user.email.split('@')[0]);
        }
      }
      
      setCheckingProfile(false);
    };

    checkUserAndProfile();
  }, [supabase, router]);

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);

  const toggleGoal = (id: string) => {
    setGoals(prev => {
        if (prev.includes(id)) {
            // לא מאפשרים להישאר בלי מטרות בכלל
            return prev.length > 1 ? prev.filter(g => g !== id) : prev;
        }
        return [...prev, id];
    });
  };

  const toggleFacility = (id: string) => {
    setFacilities(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const toggleDay = (day: string) => {
    setDefaultDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleFinish = async () => {
    if (!userId) return;
    
    if (!isStep1Valid()) {
      alert("Please fill in all required fields (Age, Weight, Height).");
      setStep(1); 
      return;
    }

    setLoading(true);

    try {
      // יצירת מחרוזת ניסיון מפורטת עבור ה-AI
      // זה "טריק" שמאפשר לנו לשמור מידע מורכב בתוך שדה טקסט קיים בלי לשנות את מבנה הדאטאבייס
      const experienceSummary = `
--- EXPERIENCE LEVELS ---
Strength: ${experience.strength}
Running: ${experience.running}
Cycling: ${experience.cycling}
Swimming: ${experience.swimming}
Mobility: ${experience.mobility}
-------------------------
INJURIES / CONSTRAINTS:
${trainingConstraints}
      `.trim();

      const payload = {
        id: userId,
        full_name: fullName,
        gender,
        age: Number(age),       
        weight_kg: Number(weight), 
        height_cm: Number(height), 
        goal: goals.join(','), // שמירת המטרות כמחרוזת מופרדת בפסיקים
        level,
        training_constraints: experienceSummary, // שמירת הניסיון + הפציעות ביחד
        facilities,
        default_max_sessions: defaultSessions,
        default_days_available: defaultDays,
        fixed_activities: fixedActivities,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(payload);

      if (error) throw error;
      
      router.push('/dashboard');
    } catch (err: any) {
      console.error('CRITICAL ERROR saving profile:', err.message, err);
      alert(`Error saving profile: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (checkingProfile) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Checking profile...</div>;
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      
      {/* Progress Bar (Updated for 5 steps) */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex justify-between text-xs text-zinc-500 mb-2 uppercase tracking-widest font-medium">
          <span>Step {step} of 5</span>
          <span>{Math.round((step / 5) * 100)}%</span>
        </div>
        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white transition-all duration-500 ease-out" 
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>
      </div>

      <div className="w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* --- STEP 1: ABOUT YOU --- */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Let's get to know you</h1>
              <p className="text-zinc-400 text-sm">We need these details to build a safe plan.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">What should we call you? <span className="text-red-500">*</span></label>
                <input 
                  value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 outline-none focus:border-white transition"
                  placeholder="e.g. Alex"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Gender <span className="text-red-500">*</span></label>
                  <select 
                    value={gender} onChange={e => setGender(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 outline-none appearance-none"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Age <span className="text-red-500">*</span></label>
                  <input 
                    type="number" 
                    value={age} 
                    onChange={e => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 outline-none focus:border-white transition"
                    placeholder="25"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Weight (kg) <span className="text-red-500">*</span></label>
                  <input 
                    type="number" 
                    value={weight} 
                    onChange={e => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 outline-none focus:border-white transition"
                    placeholder="75"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Height (cm) <span className="text-red-500">*</span></label>
                  <input 
                    type="number" 
                    value={height} 
                    onChange={e => setHeight(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 outline-none focus:border-white transition"
                    placeholder="180"
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={handleNext} 
              disabled={!isStep1Valid()}
              className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition mt-4"
            >
              Next Step →
            </button>
          </div>
        )}

        {/* --- STEP 2: GOALS & LEVEL --- */}
        {step === 2 && (
          <div className="space-y-6">
             <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Your Focus</h1>
              <p className="text-zinc-400 text-sm">Select one or more goals.</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'get_active', label: 'Get Active' },
                  { id: 'lose_weight', label: 'Lose Weight' },
                  { id: 'build_muscle', label: 'Build Muscle' },
                  { id: 'improve_endurance', label: 'Endurance' }
                ].map(g => {
                  const isSelected = goals.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleGoal(g.id)}
                      className={`p-4 rounded-xl border text-sm text-left transition-all ${
                        isSelected 
                        ? 'bg-white text-black border-white shadow-lg' 
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      {isSelected ? '✓ ' : ''}{g.label}
                    </button>
                  );
                })}
              </div>

              <label className="block text-xs text-zinc-400 mt-4">Overall Fitness Level</label>
              <div className="grid grid-cols-3 gap-2">
                {['beginner', 'intermediate', 'advanced'].map(l => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`p-3 rounded-xl border text-sm capitalize transition-all ${
                      level === l 
                      ? 'bg-white text-black border-white' 
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={handleBack} className="flex-1 bg-zinc-900 text-zinc-400 font-bold py-4 rounded-xl hover:text-white transition">Back</button>
              <button onClick={handleNext} className="flex-[2] bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition">Next Step →</button>
            </div>
          </div>
        )}

        {/* --- STEP 2.5: SPECIFIC EXPERIENCE (NEW) --- */}
        {step === 3 && (
          <div className="space-y-6">
             <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Experience Details</h1>
              <p className="text-zinc-400 text-sm">Help us tune your workouts accurately.</p>
            </div>

            <div className="space-y-4 bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800">
              {['Strength', 'Running', 'Cycling', 'Swimming', 'Mobility'].map((activity) => {
                const key = activity.toLowerCase() as keyof typeof experience;
                return (
                  <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/50 pb-3 last:border-0 last:pb-0">
                    <label className="text-sm font-medium text-zinc-300 w-24">{activity}</label>
                    <div className="flex gap-1 flex-1">
                      {['beginner', 'intermediate', 'advanced'].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setExperience(prev => ({ ...prev, [key]: lvl }))}
                          className={`
                            flex-1 py-2 px-1 text-[10px] sm:text-xs uppercase font-bold rounded-lg border transition-all
                            ${experience[key] === lvl 
                              ? 'bg-indigo-600 text-white border-indigo-500' 
                              : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:bg-zinc-800'}
                          `}
                        >
                          {lvl.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={handleBack} className="flex-1 bg-zinc-900 text-zinc-400 font-bold py-4 rounded-xl hover:text-white transition">Back</button>
              <button onClick={handleNext} className="flex-[2] bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition">Next Step →</button>
            </div>
          </div>
        )}

        {/* --- STEP 4: HEALTH & FACILITIES --- */}
        {step === 4 && (
          <div className="space-y-6">
             <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Health & Gear</h1>
              <p className="text-zinc-400 text-sm">Safety first.</p>
            </div>

            <div className="space-y-5">
              {/* Constraints */}
              <div>
                <label className="block text-sm font-medium text-white mb-2"> Injuries / Limitations</label>
                <textarea 
                  value={trainingConstraints} onChange={e => setTrainingConstraints(e.target.value)}
                  placeholder="e.g. Bad knees, asthma, shoulder pain..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm focus:border-white outline-none min-h-[80px]"
                />
              </div>

              {/* Facilities */}
              <div>
                 <label className="block text-sm font-medium text-white mb-3">Available Equipment</label>
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {FACILITY_OPTIONS.map((item) => {
                    const isActive = facilities.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleFacility(item.id)}
                        className={`
                          px-2 py-3 rounded-xl text-xs font-medium text-center border transition-all
                          ${isActive 
                            ? 'bg-indigo-600 text-white border-indigo-500' 
                            : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800'}
                        `}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={handleBack} className="flex-1 bg-zinc-900 text-zinc-400 font-bold py-4 rounded-xl hover:text-white transition">Back</button>
              <button onClick={handleNext} className="flex-[2] bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition">Next Step →</button>
            </div>
          </div>
        )}

        {/* --- STEP 5: SCHEDULE --- */}
        {step === 5 && (
          <div className="space-y-6">
             <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Your Routine</h1>
              <p className="text-zinc-400 text-sm">Set your baseline. We'll adapt weekly.</p>
            </div>

            <div className="space-y-6">
              {/* Sessions Slider */}
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-sm font-medium text-white">Sessions per week</label>
                  <span className="text-xl font-bold">{defaultSessions}</span>
                </div>
                <input 
                  type="range" min="1" max="7" 
                  value={defaultSessions} onChange={e => setDefaultSessions(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              {/* Days */}
              <div>
                <label className="block text-sm font-medium text-white mb-3">Preferred Days</label>
                <div className="flex flex-wrap gap-2 justify-center">
                  {DOW_ORDER.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`
                        w-10 h-10 rounded-full text-xs font-bold border transition-all
                        ${defaultDays.includes(d) 
                          ? 'bg-white text-black border-white scale-110' 
                          : 'bg-zinc-900 text-zinc-500 border-zinc-800'}
                      `}
                    >
                      {d.slice(0, 1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fixed Activities */}
              <div>
                <label className="block text-sm font-medium text-white mb-3">Fixed Weekly Activities</label>
                <FixedActivityManager activities={fixedActivities} onChange={setFixedActivities} />
              </div>
            </div>

            <div className="flex gap-3 pt-6">
              <button onClick={handleBack} disabled={loading} className="flex-1 bg-zinc-900 text-zinc-400 font-bold py-4 rounded-xl hover:text-white transition">Back</button>
              <button 
                onClick={handleFinish} 
                disabled={loading}
                className="flex-[2] bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 disabled:opacity-70 transition flex items-center justify-center gap-2"
              >
                {loading ? 'Creating Profile...' : 'Finish Setup'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}