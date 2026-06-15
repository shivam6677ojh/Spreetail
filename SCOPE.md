# 📊 Spreetail Shared Expenses App – Scope & Anomaly Log

This document details the functional scope of the Spreetail Shared Expenses App, the exact database schema layout, and the comprehensive **Anomaly Log** describing the 14 deliberate data issues present in `expenses_export.csv` and the policies selected to resolve them.

---

## 1. Relational Database Schema

We use PostgreSQL for all operations. The schema is defined below:

### Tables & Fields

1. **`users`**
   - `id` (UUID, Primary Key): Unique identifier.
   - `name` (String): Full name.
   - `email` (String, Unique): Normalized lowercase email.
   - `password_hash` (String): Bcrypt password hash.
   - `created_at` / `updated_at` (Timestamptz): Creation/update timestamps.

2. **`groups`**
   - `id` (UUID, Primary Key): Unique identifier.
   - `name` (String): Group name.
   - `description` (String, Nullable): Optional summary.
   - `created_by_id` (UUID, Foreign Key -> `users`): Group creator.

3. **`group_members`**
   - `id` (UUID, Primary Key).
   - `group_id` (UUID, Foreign Key -> `groups`, Cascade delete).
   - `user_id` (UUID, Foreign Key -> `users`, Restrict delete).
   - `role` (Enum: `MEMBER`, `ADMIN`).
   - `joined_at` (Timestamptz): Joined date (defaults to Feb 1, 2026).
   - `left_at` (Timestamptz, Nullable): Leaving date (null if active).
   - *Index*: `@@unique([groupId, userId, joinedAt])` prevents duplicate memberships.

4. **`expenses`**
   - `id` (UUID, Primary Key).
   - `group_id` (UUID, Foreign Key -> `groups`, Cascade).
   - `paid_by_id` (UUID, Foreign Key -> `users`): Payer.
   - `created_by_id` (UUID, Foreign Key -> `users`): Submitter.
   - `import_id` (UUID, Foreign Key -> `imports`, Set Null): Associated bulk import.
   - `description` (String): Expense title.
   - `amount` (Decimal 19,4): Expense amount. Stored as signed decimal to support negative refunds.
   - `currency` (Char 3): Default `"USD"`.
   - `split_method` (Enum: `EQUAL`, `EXACT`, `PERCENTAGE`, `CUSTOM`).
   - `expense_date` (Date): Date of purchase (stored as UTC midnight).

5. **`expense_participants`**
   - `expense_id` (UUID, Foreign Key -> `expenses`, Cascade).
   - `user_id` (UUID, Foreign Key -> `users`): Participant.
   - `amount` (Decimal 19,4): Exact share of the cost.
   - *Index*: `@@id([expenseId, userId])` primary key.

6. **`settlements`**
   - `id` (UUID, Primary Key).
   - `group_id` (UUID, Foreign Key -> `groups`, Cascade).
   - `paid_by_id` (UUID, Foreign Key -> `users`): Debtor.
   - `paid_to_id` (UUID, Foreign Key -> `users`): Creditor.
   - `recorded_by_id` (UUID, Foreign Key -> `users`): Recorder.
   - `import_id` (UUID, Foreign Key -> `imports`, Set Null).
   - `amount` (Decimal 19,4): Amount paid.
   - `currency` (Char 3): `"USD"` or `"INR"`.
   - `settled_at` (Timestamptz).

7. **`imports`**
   - `id` (UUID, Primary Key).
   - `group_id` (UUID, Foreign Key -> `groups`, Cascade).
   - `imported_by_id` (UUID, Foreign Key -> `users`).
   - `file_name` (String): CSV filename.
   - `file_hash` (String): SHA-256 hash of the CSV text.
   - `status` (Enum: `PENDING`, `PROCESSING`, `COMPLETED`, `COMPLETED_WITH_ANOMALIES`, `FAILED`).
   - `total_rows` (Int), `imported_rows` (Int), `anomalous_rows` (Int).
   - *Index*: `@@unique([groupId, fileHash])` prevents re-importing the same file.

8. **`import_anomalies`**
   - `id` (UUID, Primary Key).
   - `import_id` (UUID, Foreign Key -> `imports`, Cascade).
   - `row_number` (Int): Location in the CSV.
   - `code` (String): Anomaly type code.
   - `message` (String): Detailed action message.
   - `severity` (Enum: `WARNING`, `ERROR`).
   - `raw_data` (Json): Serialized raw CSV row.

---

## 2. The CSV Anomaly Log

Here are the 14 deliberate data problems detected in `expenses_export.csv`, our policies for resolving them, and the engineering rationale behind each decision.

| # | Anomaly Code | Severity | Example Row in CSV | Chosen Policy & Action Taken | Engineering Rationale |
|---|---|---|---|---|---|
| **1** | `DUPLICATE_IMPORT` | **ERROR** (Aborts) | Re-uploading `expenses_export.csv` | **Abort Import**. Checks file text hash. Block file if hash exists. | Prevents duplicate records and double-charging members. |
| **2** | `MALFORMED_ROW` | **ERROR** (Skips) | Missing columns or unparseable amount | **Skip Row**. Skip import and log error details in report. | Ensures database integrity; invalid data must not pollute balances. |
| **3** | `BLANK_DESCRIPTION` | **ERROR** (Skips) | Row with missing description | **Skip Row**. Reject row if description is empty or blank. | Expenses must have a name to be auditable by members (e.g. Rohan). |
| **4** | `ZERO_AMOUNT` | **ERROR** (Skips) | Row 31: "Dinner drinks", amount `0 INR` | **Skip Row**. Skip zero-amount expenses. | Zero-amount entries do not affect balances and are clutter. |
| **5** | `INVALID_DATE` | **ERROR** (Skips) | Row with missing or unparseable date text | **Skip Row**. Reject row. | A precise date is required to check member timelines. |
| **6** | `UNKNOWN_USER` | **ERROR** (Skips) | Participant `stranger@example.com` | **Skip Row**. Reject if payer/participant is unregistered. | Cannot allocate balances to non-existent profiles. |
| **7** | `PAYER_NOT_IN_GROUP` | **ERROR** (Skips) | Sam paying for an expense on March 14 | **Skip Row**. Reject if payer joined after/left before the expense date. | A member cannot spend on behalf of a group before joining or after leaving. |
| **8** | `SELF_PAYMENT` | **ERROR** (Skips) | Payer splits solely with themselves | **Skip Row**. Reject if payer is the only split participant. | Shared expense applications require at least two members. |
| **9** | `NEGATIVE_AMOUNT_TREATED_AS_REFUND` | **WARNING** (Imports) | Row 26: "Parasailing refund", `-30 USD` | **Import**. Stored as negative expense (refund). Positive constraints dropped. | Storing refunds natively adjusts net positions accurately. |
| **10** | `FRACTIONAL_CENT_ROUNDED` | **WARNING** (Imports) | Row 10: "Cylinder replacement", `899.995 INR` | **Import & Round**. Round amount to 2 decimal places (`900.00`). | Real-world currency payments cannot settle fractional cents/paisa. |
| **11** | `DATE_FORMAT_CLEANED` | **WARNING** (Imports) | Row 27: Date format is `"Mar-14"` | **Import**. Regex parses date successfully, normalize to UTC midnight. | Handles variations in date formats (e.g. spreadsheet exports). |
| **12** | `MISSING_PAYER_ASSIGNED_TO_IMPORTER` | **WARNING** (Imports) | Row 13: "House cleaning supplies" (Payer blank) | **Import**. Default payer to the user who uploaded the CSV file. | Prevents losing the expense; assigns responsibility to the importer. |
| **13** | `MISSING_CURRENCY_DEFAULTED` | **WARNING** (Imports) | Row 28: "Groceries", amount `2105` (Currency blank) | **Import**. Default the currency to `INR`. | Prevents import crashes; defaults to the group's local currency. |
| **14** | `PARTICIPANT_NOT_IN_GROUP` | **WARNING** (Imports) | March rent including Sam (joined April 15) | **Import & Exclude**. Exclude inactive participant from the split. | Excludes members from costs logged outside their active timeline. |
| **15** | `REMAINDER_AUTO_ALLOCATED` / `SPLIT_MISMATCH_RESCALED` | **WARNING** (Imports) | Row 15: Pizza Friday (Aisha 30%), Row 32: (Sum = 110%) | **Import & Re-scale**. Re-scale percentages to 100% or auto-allocate remainders. | Ensures splits total exactly the expense amount, preventing fractional leaks. |
| **16** | `SETTLEMENT_DISGUISED_AS_EXPENSE` | **WARNING** (Imports) | Row 14: "Rohan paid Aisha" (Notes: settlement) | **Import as Settlement**. Store as `Settlement` record, bypass timelines. | Corrects bookkeeping by routing repayments out of expenses. |
| **17** | `DUPLICATE_EXPENSE` | **ERROR** (Skips) | Row 5 & 6: Identical dinner lines | **Skip Row**. Skips exact duplicate lines. | Prevents double-charging members for accidental duplicate entries. |
| **18** | `CONFLICTING_DUPLICATE` | **WARNING** (Imports) | Row 24 & 25: Same description/date, different amount | **Import**. Import both rows but log a warning. | Safe policy; flags conflicts so members can audit manually. |
| **19** | `CURRENCY_CONVERSION` | **WARNING** (Imports) | Non-USD/INR currency uploaded (e.g. EUR) | **Import & Convert**. Convert to USD using static rates. | Stabiliizes balances without relying on unstable external APIs. |
