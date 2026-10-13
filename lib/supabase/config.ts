export function readSupabaseConfig(environment: Readonly<Record<string, string | undefined>>) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url) throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL。");
  if (!publishableKey) throw new Error("缺少 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。");
  return { url, publishableKey };
}

export function hasSupabaseConfig(environment: Readonly<Record<string, string | undefined>>) {
  return Boolean(
    environment.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export function supabaseConfig() {
  return readSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
