export function authRouteDecision(pathname: string, search: string) {
  const protectedRoute = pathname === "/projects" || (pathname === "/" && new URLSearchParams(search).has("project"));
  return { protected: protectedRoute, next: `${pathname}${search}` };
}
