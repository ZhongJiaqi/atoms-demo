import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { authRouteDecision } from "@/lib/auth/policy";
import { hasSupabaseConfig, supabaseConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const decision = authRouteDecision(request.nextUrl.pathname, request.nextUrl.search);
  if (!hasSupabaseConfig(process.env)) {
    if (!decision.protected) return response;
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", decision.next);
    login.searchParams.set("error", "Supabase 尚未配置，暂时无法恢复受保护项目。");
    return NextResponse.redirect(login);
  }
  const { url, publishableKey } = supabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (decision.protected && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", decision.next);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/", "/projects"],
};
