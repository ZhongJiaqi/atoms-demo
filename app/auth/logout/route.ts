import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return NextResponse.json({ error: "退出登录失败，请稍后重试。" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ signedOut: true }, { headers: { "Cache-Control": "no-store" } });
}
