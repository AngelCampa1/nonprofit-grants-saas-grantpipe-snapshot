export function getTextLengthBucket(length: number) {
  if (length <= 0) return "0";
  if (length <= 20) return "1-20";
  if (length <= 50) return "21-50";
  return "51+";
}

export function getCountBucket(count: number) {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  return "50+";
}
