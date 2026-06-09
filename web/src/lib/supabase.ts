import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://hvtbzxifzkbvmqpshmqw.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_ZeTnYMfkIBdQB-jg9gXi2Q_tEQDQwM7";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});
