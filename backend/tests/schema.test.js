import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../prisma/migrations/20260613171000_initial_expense_schema/migration.sql", import.meta.url),
  "utf8",
);

const requiredTables = [
  "users",
  "groups",
  "group_members",
  "expenses",
  "expense_participants",
  "settlements",
  "imports",
  "import_anomalies",
];

describe("initial expense schema migration", () => {
  it.each(requiredTables)("creates the %s table", (table) => {
    expect(migration).toContain(`CREATE TABLE "${table}"`);
  });

  it("preserves membership history and prevents duplicate active memberships", () => {
    expect(migration).toContain('"joined_at" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('"left_at" TIMESTAMPTZ(3)');
    expect(migration).toContain("group_members_valid_interval_check");
    expect(migration).toContain("group_members_one_active_membership_key");
  });

  it("defines foreign keys, indexes, and monetary checks", () => {
    expect(migration).toContain("-- AddForeignKey");
    expect(migration).toContain("-- CreateIndex");
    expect(migration).toContain("expenses_positive_amount_check");
    expect(migration).toContain("settlements_positive_amount_check");
    expect(migration).toContain("expense_participants_nonnegative_amount_check");
  });
});

