No external API integration: write-excel-file is an npm library, not a remote API.

<!-- Spec-less edge coverage report (EDGE_ABSENT fallback), 2026-09-30 -->
```json
{
  "items": [
    {
      "requirement_id": "EXP-02",
      "category": "unclassified",
      "status": "unresolved",
      "verification": null,
      "resolution": null,
      "reason": null,
      "probe": "unclassified — review manually"
    }
  ],
  "coverage": {
    "applicable": 1,
    "resolved": 0,
    "unresolved": 1,
    "byVerification": { "explicit": 0, "backstop": 0 }
  }
}
```

Disposition: the single unresolved edge is surfaced as an explicit flagged assumption in
`14-02-PLAN.md` frontmatter (`must_haves.flagged_assumptions`) — not auto-backstopped, not
auto-dismissed. Manual review is assigned to end-of-phase verify-work.
