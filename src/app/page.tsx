import type { Metadata } from "next";
import Link from "next/link";
import WaitlistForm from "../components/WaitlistForm";

export const metadata: Metadata = {
  title: "Motiva - AI Fitness Coach",
  description: "Functional fitness tailored to your life.",
};

export default function TeaserPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden font-sans selection:bg-emerald-500/30">
      
      {/* Background Ambience */}
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
        {/* Hidden login link */}
        <Link href="/beta" className="text-zinc-900 hover:text-zinc-800 text-[10px] cursor-default">.</Link>
      </nav>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 z-10 text-center -mt-20">
        <div className="w-full max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          
          <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 rounded-full px-4 py-1.5 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs text-zinc-400 font-medium tracking-wide">Private Beta Access Only</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.1]">
            Fitness designed for <br/> 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-200 to-zinc-500">longevity.</span>
          </h1>
          
          <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-md mx-auto mb-8">
            An intelligent AI coach that adapts to your schedule, injuries, and equipment. No rigid plans. Just consistency.
          </p>

          {/* הטופס החדש */}
          <div className="pt-4 w-full">
             <WaitlistForm />
             <p className="text-xs text-zinc-600 mt-6">
                Launching publicly soon. Join the waitlist for early access.
             </p>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="p-8 border-t border-zinc-900/50 text-center z-10">
        <p className="text-zinc-600 text-xs">© 2025 Motiva AI. All rights reserved.</p>
      </div>
    </main>
  );
}