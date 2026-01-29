'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; // For Navigation
import { supabaseBrowser } from '../../lib/supabaseClient';
import FixedActivityManager, { FixedActivity } from '../../components/FixedActivityManager';

const DOW_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// רשימת הציוד/מתקנים
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

export default function SettingsPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [weight, setWeight] = useState<number | ''>('');
  const [level, setLevel] = useState('beginner');
  const [goal, setGoal] = useState('get_active');
  
  // Constraints & Schedule
  const [defaultSessions, setDefaultSessions] = useState(3);
  const [defaultDays, setDefaultDays] = useState<string[]>([]);
  const [fixedActivities, setFixedActivities] = useState<FixedActivity[]>([]);
  
  // Health & Status
  const [trainingConstraints, setTrainingConstraints] = useState(''); 
  
  // Facilities
  const [facilities, setFacilities] = useState<string[]>([]);
  const [facilitiesNotes, setFacilitiesNotes] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        setFullName(profile.full_name || '');
        setWeight(profile.weight_kg || '');
        setLevel(profile.level || 'beginner');
        setGoal(profile.goal || 'get_active');
        
        setDefaultSessions(profile.default_max_sessions || 3);
        setDefaultDays(profile.default_days_available || []);
        
        setFixedActivities(profile.fixed_activities || []);
        setTrainingConstraints(profile.training_constraints || '');
        
        setFacilities(profile.facilities || []);
        setFacilitiesNotes(profile.facilities_notes || '');
      }
      setLoading(false);
    };
    loadProfile();
  }, [supabase, router]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          weight_kg: weight === '' ? null : Number(weight),
          level,
          goal,
          default_max_sessions: defaultSessions,
          default_days_available: defaultDays,
          fixed_activities: fixedActivities,
          training_constraints: trainingConstraints || null,
          facilities: facilities,
          facilities_notes: facilitiesNotes || null,
        })
        .eq('id', userId);

      if (error) throw error;
      
      // אין צורך לנווט החוצה, רק לתת פידבק
      alert('Settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setDefaultDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleFacility = (facId: string) => {
    setFacilities(prev => 
      prev.includes(facId) ? prev.filter(f => f !== facId) : [...prev, facId]
    );
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Loading settings...</div>;

  return (
    <main className="min-h-screen bg-black text-white p-6 pb-32">
      
      {/* Header */}
      <header className="mb-8 pt-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-zinc-500 text-sm">Customize your Motiva experience.</p>
      </header>

      <div className="max-w-2xl mx-auto space-y-10">

        {/* 1. Profile & Goals */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <span className="text-xl">👤</span>
            <h2 className="text-lg font-bold text-zinc-200">Profile & Goals</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Name</label>
              <input 
                value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm focus:border-zinc-600 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Weight (kg)</label>
              <input 
                type="number"
                value={weight} onChange={e => setWeight(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm focus:border-zinc-600 outline-none transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Fitness Level</label>
              <div className="relative">
                <select 
                  value={level} onChange={e => setLevel(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm focus:border-zinc-600 outline-none appearance-none"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <div className="absolute right-3 top-3.5 pointer-events-none text-zinc-500 text-xs">▼</div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Main Goal</label>
              <div className="relative">
                <select 
                  value={goal} onChange={e => setGoal(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm focus:border-zinc-600 outline-none appearance-none"
                >
                  <option value="get_active">Get Active</option>
                  <option value="lose_weight">Lose Weight</option>
                  <option value="build_muscle">Build Muscle</option>
                  <option value="improve_endurance">Endurance</option>
                </select>
                <div className="absolute right-3 top-3.5 pointer-events-none text-zinc-500 text-xs">▼</div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Health & Constraints */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <span className="text-xl">🏥</span>
            <h2 className="text-lg font-bold text-zinc-200">Health & Constraints</h2>
          </div>
          <div className="bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Ongoing Injuries / Limitations</label>
            <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
              Motiva reads this every week. List permanent issues like "Bad knees", "Asthma", or "No jumping".
            </p>
            <textarea 
              value={trainingConstraints} onChange={e => setTrainingConstraints(e.target.value)}
              placeholder="e.g. Lower back pain, recovering from shoulder surgery..."
              className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-sm text-zinc-200 focus:border-indigo-500 outline-none min-h-[80px]"
            />
          </div>
        </section>

        {/* 3. Facilities & Equipment */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <span className="text-xl">🏋️‍♂️</span>
            <h2 className="text-lg font-bold text-zinc-200">Facilities & Equipment</h2>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FACILITY_OPTIONS.map((item) => {
              const isActive = facilities.includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleFacility(item.id)}
                  className={`
                    px-3 py-3 rounded-xl text-xs font-medium text-center border transition-all duration-200
                    ${isActive 
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/20' 
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'}
                  `}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          
          <div className="mt-2">
            <label className="block text-xs text-zinc-400 mb-1.5">Specific Equipment Notes (Optional)</label>
            <input 
              value={facilitiesNotes} onChange={e => setFacilitiesNotes(e.target.value)}
              placeholder="e.g. Only dumbbells up to 10kg, gym is closed on Sundays..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-300 focus:border-zinc-600 outline-none"
            />
          </div>
        </section>

        {/* 4. Default Schedule */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <span className="text-xl">📅</span>
            <h2 className="text-lg font-bold text-zinc-200">Default Schedule</h2>
          </div>
          
          <div className="bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800 space-y-6">
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium text-zinc-300">Default Sessions / Week</label>
                <span className="text-lg font-bold bg-zinc-800 px-3 py-1 rounded-lg">{defaultSessions}</span>
              </div>
              <input 
                type="range" min="1" max="7" 
                value={defaultSessions} onChange={e => setDefaultSessions(Number(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Preferred Days</label>
              <div className="flex flex-wrap gap-2">
                {DOW_ORDER.map(d => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`
                      w-10 h-10 rounded-full text-xs font-bold border transition-all flex items-center justify-center
                      ${defaultDays.includes(d) 
                        ? 'bg-white text-black border-white scale-110 shadow-md' 
                        : 'bg-zinc-950 text-zinc-500 border-zinc-700 hover:border-zinc-500'}
                    `}
                  >
                    {d.slice(0, 1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 5. Fixed Activities */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <span className="text-xl">📌</span>
            <h2 className="text-lg font-bold text-zinc-200">Fixed Activities</h2>
          </div>
          <FixedActivityManager activities={fixedActivities} onChange={setFixedActivities} />
        </section>

        {/* Save Button */}
        <div className="pt-8 pb-10">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-white text-black rounded-2xl font-bold text-lg hover:bg-zinc-200 disabled:opacity-70 shadow-xl shadow-white/5 transition-transform active:scale-[0.98]"
          >
            {saving ? 'Saving Profile...' : 'Save Changes'}
          </button>
        </div>

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

          {/* Progress */}
          <Link href="/progress" className="flex flex-col items-center gap-1.5 text-zinc-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-[10px] font-medium">Progress</span>
          </Link>

          {/* Settings (Active) */}
          <Link href="/settings" className="flex flex-col items-center gap-1.5 text-white">
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