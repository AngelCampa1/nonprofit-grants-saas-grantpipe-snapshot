export function getDocumentSizeBucket(sizeBytes: number): string {
  if (sizeBytes < 10 * 1024) {
    return "under_10kb";
  }
  if (sizeBytes < 100 * 1024) {
    return "10kb_100kb";
  }
  if (sizeBytes < 1024 * 1024) {
    return "100kb_1mb";
  }
  if (sizeBytes < 10 * 1024 * 1024) {
    return "1mb_10mb";
  }
  return "over_10mb";
}

export function getDocumentMimeFamily(mimeType: string): string {
  const [family, subtype] = mimeType.trim().toLowerCase().split("/");

  return family && subtype ? family : "unknown";
}
