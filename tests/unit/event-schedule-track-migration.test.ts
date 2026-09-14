import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("event schedule track migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20260915020000_add_event_schedule_tracks/migration.sql"),
    "utf8",
  );

  it("seeds tracks from legacy locations and protects the required session relation", () => {
    expect(sql).toContain('COALESCE(NULLIF(btrim("location"), \'\'), \'General programme\')');
    expect(sql).toContain('ALTER COLUMN "trackId" SET NOT NULL');
    expect(sql).toContain('ON DELETE RESTRICT');
  });
});
