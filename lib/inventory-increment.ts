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
  // 'AB-100'). Number (not BigInt) stays exact only inside the safe-integer
  // range. Past 2^53 − 1 precision is lost silently (Number('9007199254740992')
  // + 1 still equals 2^53 — the SAME string came back and a 2-copy batch
  // self-collided on UNIQUE), and far larger tails render as scientific
  // notation via String() ('…1e+22'). The zod cap bounds tail LENGTH, not
  // value, so it does not protect here. An unrepresentable tail is not a
  // reliably incrementable pattern — degrade to the same silent-empty
  // contract as a non-numeric tail (SC 3): suggest nothing rather than
  // invent a wrong number.
  const value = Number(digits)
  if (!Number.isSafeInteger(value)) return ''
  const next = value + 1
  if (!Number.isSafeInteger(next)) return ''
  return prefix + String(next).padStart(digits.length, '0')
}
