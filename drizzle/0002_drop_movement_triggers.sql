-- Phase 12 (SC5): append-only invariant lifted IN THE MIGRATION CHAIN — not a runtime bypass.
-- Trigger names byte-identical to drizzle/0000_amusing_talon.sql (lines 94–102).
DROP TRIGGER IF EXISTS `movements_no_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `movements_no_delete`;
