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

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // --- Form State ---
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('male');
  
  // שינינו את ברירת המחדל ל- '' כדי שנוכל לבדוק אם המשתמש הזין משהו
  const [age, setAge] = useState<number | ''>('');
  const [weight, setWeight] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');

  const [goal, setGoal] = useState('get_active');
  const [level, setLevel] = useState('beginner');
  
  const [trainingConstraints, setTrainingConstraints] = useState('');
  const [facilities, setFacilities] = useState<string[]>([]);

  const [defaultSessions, setDefaultSessions] = useState(3);
  const [defaultDays, setDefaultDays] = useState<string[]>([]);
  const [fixedActivities, setFixedActivities] = useState<FixedActivity[]>([]);

  // --- Validation Helpers ---
  // בדיקה האם שלב 1 תקין (כל השדות מולאו)
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
  }, [supabase, router]); // eslint-disable-line

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);

  const toggleFacility = (id: string) => {
    setFacilities(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const toggleDay = (day: string) => {
    setDefaultDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleFinish = async () => {
    if (!userId) return;
    
    // ולידציה סופית לפני שליחה (למקרה שהמשתמש עקף את הכפתור)
    if (!isStep1Valid()) {
      alert("Please fill in all required fields (Age, Weight, Height).");
      setStep(1); // החזר אותו לשלב 1 לתקן
      return;
    }

    setLoading(true);

    try {
      const payload = {
        id: userId,
        full_name: fullName,
        gender,
        age: Number(age),       // בטוח מספר
        weight_kg: Number(weight), // בטוח מספר
        height_cm: Number(height), // בטוח מספר
        goal,
        level,
        training_constraints: trainingConstraints || null,
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
      
      {/* Progress Bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex justify-between text-xs text-zinc-500 mb-2 uppercase tracking-widest font-medium">
          <span>Step {step} of 4</span>
          <span>{Math.round((step / 4) * 100)}%</span>
        </div>
        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white transition-all duration-500 ease-out" 
            style={{ width: `${(step / 4) * 100}%` }}
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
              <h1 className="text-3xl font-bold mb-2">What's your goal?</h1>
              <p className="text-zinc-400 text-sm">We'll design the week based on this.</p>
            </div>

            <div className="space-y-4">
              <label className="block text-xs text-zinc-400">Current Fitness Level</label>
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

              <label className="block text-xs text-zinc-400 mt-4">Primary Goal</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'get_active', label: 'Get Active' },
                  { id: 'lose_weight', label: 'Lose Weight' },
                  { id: 'build_muscle', label: 'Build Muscle' },
                  { id: 'improve_endurance', label: 'Endurance' }
                ].map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGoal(g.id)}
                    className={`p-4 rounded-xl border text-sm text-left transition-all ${
                      goal === g.id 
                      ? 'bg-white text-black border-white' 
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    {g.label}
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

        {/* --- STEP 3: HEALTH & FACILITIES --- */}
        {step === 3 && (
          <div className="space-y-6">
             <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Health & Gear</h1>
              <p className="text-zinc-400 text-sm">Safety first. What should we know?</p>
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

        {/* --- STEP 4: SCHEDULE --- */}
        {step === 4 && (
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