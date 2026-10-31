-- People's Gallery enrollment tickets get their own secret (security review
-- finding Y-1), independent of the delivery signing secret. Additive and
-- nullable: while it is unset Yuyu keeps signing tickets with the legacy key
-- derived from the delivery secret (contract v1.2 §4.1), so this can deploy
-- before the operator runs `pg:integration rotate-ticket-secret`.
-- Lock: ALTER TABLE ... ADD COLUMN without a default is a catalog-only change
-- (ACCESS EXCLUSIVE for milliseconds on a one-row table).
ALTER TABLE "PgIntegration" ADD COLUMN "ticketSecretEncrypted" TEXT;
