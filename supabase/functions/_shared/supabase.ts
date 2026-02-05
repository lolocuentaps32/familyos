import { createClient } from "https://esm.sh/@supabase/supabase-js@2.40.0";

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "familyos-edge" } },
  });
}

export function supabaseUser(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Extract the token from Authorization header
  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        "X-Client-Info": "familyos-edge",
        "Authorization": authHeader,
      }
    },
  });
}
