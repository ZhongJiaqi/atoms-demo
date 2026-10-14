import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { authRouteDecision } from "@/lib/auth/policy";
import { hasSupabaseConfig, supabaseConfig } from "@/lib/supabase/config";
import { previewHostDecision } from "@/lib/cloud/preview-host-policy";

export async function middleware(request: NextRequest) {
  const previewDecision = previewHostDecision(request.nextUrl.hostname, request.nextUrl.pathname);
  if (previewDecision === "blocked") return new NextResponse("预览域名仅允许访问对应项目", {status:404, headers:{"Cache-Control":"no-store"}});
  if (previewDecision === "gateway") return NextResponse.next({request});
  let response = NextResponse.next({ request });
  if (request.nextUrl.pathname !== "/" && request.nextUrl.pathname !== "/projects") return response;
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
  matcher: ["/:path*"],
};
