'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabaseClient';

export default function LandingPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // בדיקת סשן קיים
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // המשתמש מחובר, נבדוק אם יש לו פרופיל
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.session.user.id)
          .maybeSingle();
          
        if (profile) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      } else {
        setIsCheckingSession(false);
      }
    };
    checkSession();
  }, [supabase, router]);

  const handleGoogleLogin = async () => {
    setLoading(true);

    // מחזיר את הלוגיקה האוטומטית
    const origin = typeof window !== 'undefined' && window.location.origin 
      ? window.location.origin 
      : '';
      
    //const redirectTo = `${origin}/auth/callback`;
    //console.log('Redirecting to:', redirectTo);
    // אנחנו מגדירים את הכתובת ידנית כדי למנוע טעויות
    const redirectTo = 'http://192.168.178.22:3000/auth/callback';
    console.log('Force redirect to:', redirectTo);
    

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  };

  if (isCheckingSession) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden font-sans">
      
      {/* Background Gradients */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-900/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Navbar */}
      <nav className="p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-black font-bold text-xl">M</span>
          </div>
          <span className="font-bold text-xl tracking-tight">Motiva</span>
        </div>
        <div className="hidden sm:block text-sm text-zinc-400">
          AI Fitness Coach
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 z-10 text-center">
        
        <div className="w-full max-w-lg space-y-8">
          
          {/* Hero Text */}
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.1]">
              Fitness that fits <br/> 
              <span className="text-zinc-500">your real life.</span>
            </h1>
            <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-md mx-auto">
            An intelligent coach that adapts to your schedule, level and goals.
              <span className="text-zinc-200 block mt-2">No guilt. Just consistency.</span>
            </p>
          </div>

          {/* Login Button */}
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="group relative inline-flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-full font-semibold text-lg hover:bg-zinc-200 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-70 w-full sm:w-auto"
            >
              {loading ? (
                <span>Redirecting...</span>
              ) : (
                <>
                  {/* Google Icon SVG */}
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M23.766 12.2764C23.766 11.4607 23.6999 10.6406 23.5588 9.83807H12.24V14.4591H18.7217C18.4528 15.9494 17.5885 17.2678 16.323 18.1056V21.1039H20.19C22.4608 19.0139 23.766 15.9274 23.766 12.2764Z" fill="#4285F4"/>
                    <path d="M12.24 24.0008C15.4765 24.0008 18.2059 22.9382 20.1945 21.1039L16.3275 18.1055C15.2517 18.8375 13.8627 19.252 12.2445 19.252C9.11388 19.252 6.45946 17.1399 5.50705 14.3003H1.5166V17.3912C3.55371 21.4434 7.7029 24.0008 12.24 24.0008Z" fill="#34A853"/>
                    <path d="M5.50253 14.3003C5.00236 12.8099 5.00236 11.1961 5.50253 9.70575V6.61481H1.51649C-0.18551 10.0056 -0.18551 14.0004 1.51649 17.3912L5.50253 14.3003Z" fill="#FBBC05"/>
                    <path d="M12.24 4.74966C13.9509 4.7232 15.6044 5.36697 16.8434 6.54867L20.2695 3.12262C18.1001 1.0855 15.2208 -0.034466 12.24 0.000808666C7.7029 0.000808666 3.55371 2.55822 1.5166 6.61481L5.50264 9.70575C6.45064 6.86173 9.10947 4.74966 12.24 4.74966Z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </>
              )}
            </button>
            <p className="mt-4 text-xs text-zinc-600">
              Secure authentication via Google. No passwords needed.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Features */}
      <div className="p-8 md:p-12 border-t border-zinc-900 bg-black z-10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="space-y-2">
            <div className="text-zinc-100 font-semibold text-sm">Adaptive Planning</div>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mx-auto">
              Sick? Traveling? Injured? Motiva rebuilds your week instantly to keep you on track.
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-zinc-100 font-semibold text-sm">Habit First</div>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mx-auto">
              We prioritize consistency over intensity. Build the habit of showing up.
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-zinc-100 font-semibold text-sm">Smart Constraints</div>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mx-auto">
              Only have dumbbells? Bad knee? Motiva works around your reality, not against it.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}