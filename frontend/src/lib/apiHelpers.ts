export function extractList<T>(data: T[] | { results: T[] } | null | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : data.results ?? []
}
