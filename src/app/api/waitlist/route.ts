import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    // --- התיקון הגדול ---
    // שימוש ב-Service Role Key עוקף את ה-RLS לחלוטין.
    // זה אומר שאנחנו לא צריכים להסתמך על פוליסות SQL.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // שימוש במפתח הסודי
    );

    const { error } = await supabase
      .from('waitlist')
      .insert({ email });

    if (error) {
      // התעלמות משגיאת כפילות (אם המייל כבר קיים, נגיד למשתמש שהכל טוב)
      if (error.code === '23505') {
          return NextResponse.json({ success: true });
      }
      console.error("Supabase Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}