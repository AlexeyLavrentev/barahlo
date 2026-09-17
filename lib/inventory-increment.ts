// «Следующий по шаблону» для инвентарного номера (REG-06, D-02). Pure named
// export over Node built-ins only — same convention as lib/ru.ts: no
// framework imports, no side effects, safe to import from RSC, client
// components and vitest alike. ONE source for BOTH consumers (D-02, RESEARCH
// Pitfall 7): the CloneDialog prefills its field client-side from the raw
// prop, and the server folds the same function N−1 times to build the copy
// series — the client value is only an editable starting point, never the
// authority.
//
// Works on the RAW value, deliberately NOT normalizeInventory (Pitfall 4):
// 'ab-001' must suggest 'ab-002' — the operator's case/prefix survive; the
// stored uniqueness is normalInventory's job on write (inventoryPair), not
// the suggestion's. An unrecognized pattern (no trailing digits) or an empty
// original returns '' — the field renders empty and NOTHING is invented
// silently (SC 3); an empty inventory for copies is legal (NULL/NULL pair).
export function nextInventoryNumber(raw: string | null | undefined): string {
  if (!raw) return ''
  const match = raw.trim().match(/^(.*?)(\d+)$/)
  if (!match) return ''
  const [, prefix, digits] = match
  // padStart keeps zero padding; a rollover widens naturally ('AB-099' →
  // 'AB-100'). Number (not BigInt) is enough: tails ≤ 80 chars are far below
  // 2^53, and the zod cap rejects absurd lengths before this runs.
  return prefix + String(Number(digits) + 1).padStart(digits.length, '0')
}
