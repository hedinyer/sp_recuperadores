import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://iilgrapnrkwdcouielwz.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_2Bkl9vtG3JwiNq8p4zMFBw_spdi62c5";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});
