import { createBrowserClient } from '@supabase/ssr';

// משתנה ששומר את החיבור בזיכרון
let client: ReturnType<typeof createBrowserClient> | undefined;

export const supabaseBrowser = () => {
  // אם כבר יש חיבור קיים - תחזיר אותו (אל תיצור חדש!)
  if (client) return client;

  // אחרת, צור חיבור חדש ותשמור אותו
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
};