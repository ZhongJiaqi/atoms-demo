export function previewHostDecision(host: string, pathname: string): "app" | "gateway" | "blocked" {
  if (!host.startsWith("atoms-app-")) return "app";
  const match=/^atoms-app-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.vercel\.app$/.exec(host);
  return match && (pathname===`/api/preview/${match[1]}/` || pathname===`/api/preview/${match[1]}`) ? "gateway" : "blocked";
}
