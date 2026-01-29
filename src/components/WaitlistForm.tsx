'use client';

import { useState } from 'react';

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted with:", email); // לוג לדפדפן

    if (!email) return;

    setStatus('loading');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      console.log("Response status:", res.status); // לוג סטטוס

      if (res.ok) {
        setStatus('success');
        setEmail('');
      } else {
        const errorData = await res.json();
        console.error("Error details:", errorData); // לוג שגיאה
        setStatus('error');
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="animate-in fade-in zoom-in duration-500 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center max-w-md mx-auto">
        <div className="text-2xl mb-2">🎉</div>
        <h3 className="text-emerald-400 font-bold text-lg">You're on the list!</h3>
        <p className="text-zinc-400 text-sm mt-1">We'll let you know when we open the doors.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto flex flex-col sm:flex-row gap-3">
      <input
        type="email"
        placeholder="Enter your email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === 'loading'}
        className="flex-1 bg-zinc-900/80 border border-zinc-700 text-white rounded-full px-6 py-4 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-zinc-600 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:bg-zinc-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {status === 'loading' ? 'Joining...' : 'Request Access'}
      </button>
      
      {status === 'error' && (
        <p className="absolute -bottom-8 left-0 right-0 text-red-400 text-xs text-center">
          Something went wrong. check console.
        </p>
      )}
    </form>
  );
}