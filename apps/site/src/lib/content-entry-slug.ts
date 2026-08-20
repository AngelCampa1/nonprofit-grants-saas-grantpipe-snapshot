export function getContentEntrySlug(entry: { id: string }): string {
  return entry.id.replace(/\.mdx?$/, "");
}
