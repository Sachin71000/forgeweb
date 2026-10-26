type SourceFile = { path: string; content: string; digest: string; requirementIds: string[] };

/** Presentation-only groups: never write these combined views back to storage. */
export function workspaceFileEntries(files: SourceFile[]): SourceFile[] {
  const entries: SourceFile[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const group = file.path.startsWith("frontend/") ? "Frontend" : file.path.startsWith("backend/") ? "Backend" : undefined;
    if (!group) { entries.push(file); continue; }
    if (seen.has(group)) continue;
    seen.add(group);
    const prefix = group.toLowerCase() + "/";
    const members = files.filter((item) => item.path.startsWith(prefix));
    entries.push({
      path: group,
      content: members.map((item) => `===== ${item.path} =====\n${item.content}`).join("\n\n"),
      digest: "Combined view",
      requirementIds: [...new Set(members.flatMap((item) => item.requirementIds))],
    });
  }
  return entries;
}
