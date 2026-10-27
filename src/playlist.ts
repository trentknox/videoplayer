export function movePlaylistItem(ids: string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= ids.length) return ids
  const result = ids.slice()
  ;[result[from], result[to]] = [result[to], result[from]]
  return result
}
