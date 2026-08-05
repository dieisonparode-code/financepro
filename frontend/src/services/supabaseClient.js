import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Erro: VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY precisam estar no arquivo frontend/.env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
