import { createBrowserClient } from '@supabase/ssr';

// משתנה ששומר את החיבור בזיכרון
let client: ReturnType<typeof createBrowserClient> | undefined;

export const supabaseBrowser = () => {
  // --- דיבוג זמני: בדיקה לאיזה פרויקט אנחנו מחוברים ---
  // הערך הזה יודפס ב-Console של הדפדפן (F12)
  console.log("🔌 Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL); 
  // ---------------------------------------------------
  
  // אם כבר יש חיבור קיים - תחזיר אותו (אל תיצור חדש!)
  if (client) return client;

  // אחרת, צור חיבור חדש ותשמור אותו
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
};