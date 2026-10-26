import type { GeneratedFile } from "../domain.ts";

// Compare composition, not customer copy, brand names, colors, or CSS class names.
// This is a conservative repeated-template guard, not a visual similarity score.
export function layoutStructure(html: string): string {
  const body = (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  return (body.match(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi) ?? [])
    .map((tag) => tag.match(/^<\/?([a-z][a-z0-9-]*)/i)?.[0].toLowerCase() ?? "")
    .join(" ");
}

export function repeatedLayout(files: GeneratedFile[], previous: GeneratedFile[][]): boolean {
  const preview = files.find((file) => file.path === "frontend/preview.html")?.content;
  if (!preview) return false;
  const structure = layoutStructure(preview);
  // Tiny shells do not carry enough information to identify a shared template.
  if (structure.split(" ").length < 24) return false;
  return previous.some((snapshot) => {
    const older = snapshot.find((file) => file.path === "frontend/preview.html")?.content;
    return Boolean(older && layoutStructure(older) === structure);
  });
}
