# Spreetail Shared Expense App – Functional Scope

This document details the functional scope, target features, and boundaries of the Spreetail Shared Expense Application.

## 1. Core Architecture & Stack
- **Backend**: Node.js & Express (ES Modules JavaScript), PostgreSQL for persistent relational storage, and Prisma ORM.
- **Frontend**: React (Vite, React Router v7, Axios, Tailwind CSS v3).
- **Authentication**: Stateless JWT token-based authentication (hashed using bcrypt, signed with HS256).

---

## 2. Feature Scope

### A. Authentication & User Management
- **Register**: Registers users by name, email (unique/normalized), and password (hashed with bcrypt).
- **Login**: Verifies credentials and returns a signed JWT token.
- **Protected Middleware**: Restricts endpoints to users providing a valid `Authorization: Bearer <token>` header.
- **User Detail**: Endpoint `/api/auth/me` returns the currently authenticated user's information.

### B. Group Management
- **Create Group**: Creates a new group. The creator is atomically recorded as an `ADMIN` group member.
- **Edit Group**: Active admins can update the group's name and description.
- **Delete Group**: Only the group creator can delete a group.
- **Add Member**: Active admins can add registered users by email and specify a custom `joinedAt` timestamp.
- **Remove Member**: Active admins can record a member's `leftAt` timestamp to prevent participation in future expenses. The database preserves their historical records.

### C. Expense CRUD
- **Create Expense**: Active members can log expenses specifying description, amount, payer (`paidById`), date, split method (`EQUAL`, `EXACT`, `PERCENTAGE`, `CUSTOM`), and participants list.
- **Read Expenses**: Lists expenses (paginated) for members, or returns full details of a specific expense.
- **Update Expense**: Expense creators or group admins can edit the expense details.
- **Delete Expense**: Expense creators or group admins can remove an expense.
- **Split Methods**:
  - `EQUAL`: Evenly divides the amount among participants, with the rounding remainder absorbed by the last participant.
  - `EXACT`: Specifies exact decimal amounts for each participant. Sum must equal the total.
  - `PERCENTAGE`: Specifies percentages for each participant. Total must equal 100%.
  - `CUSTOM`: Specifies relative weights for each participant.

### D. Settlement Module
- **Record Settlement**: Active members can record direct payments to other members (reduces outstanding debts).
- **List Settlements**: Lists all payments recorded in the group.
- **Policy**: Settlements are recorded in the `Settlement` table and are never treated as expenses.

### E. Balance Calculation Engine
- **Net Balances**: Calculates each user's balance: `Net Balance = (Total Paid as Payer of Expenses) - (Total Owed as Participant of Expenses) + (Total Paid in Settlements) - (Total Received in Settlements)`.
- **Group Summary**: Aggregates total spending in the group and shows individual totals (total spent, total owed, total settled).
- **Greedy Transfer Minimization**: Suggests the minimum number of direct transfers ("Who pays whom") to settle all outstanding debts in the group. Matches the largest debtor with the largest creditor iteratively.
- **Membership Dates**: Ensures balance calculations check that users were active members in the group on the expense date.

### F. CSV Import Engine
- **Upload Portal**: Allows bulk uploading of `expenses_export.csv` containing fields: `date,description,amount,currency,payer_email,split_method,participants`.
- **Parsing**: Parses fields using the `csv-parse` library.
- **Email-Only Matching**: Resolves payers and participants by email only.
- **Conversion Policy**: Converts non-USD currencies (EUR, GBP, CAD, INR, AUD, JPY) to USD using static exchange rates and flags them as warning anomalies (`CURRENCY_CONVERSION`).
- **Graceful Execution**: Processes rows individually. Valid rows are written to the database; rows containing errors are skipped, logged, and statistics are recorded.

---

## 3. Anomaly Policy

The system detects and logs 18+ different types of anomalies categorized by severity:

| Code | Severity | Description |
|---|---|---|
| `DUPLICATE_IMPORT` | ERROR (Aborts File) | The file hash matches a previously uploaded file. |
| `EMPTY_CSV` | ERROR (Aborts File) | The uploaded CSV contains no data rows. |
| `MALFORMED_ROW` | ERROR (Skips Row) | Mismatched columns, missing values, or unparseable format. |
| `NEGATIVE_AMOUNT` | ERROR (Skips Row) | Row amount is negative. |
| `ZERO_AMOUNT` | ERROR (Skips Row) | Row amount is zero. |
| `INVALID_DATE` | ERROR (Skips Row) | Date format is invalid/unparseable. |
| `FUTURE_DATE` | ERROR (Skips Row) | Date is in the future relative to server time. |
| `INVALID_CURRENCY` | ERROR (Skips Row) | Currency code is unsupported or invalid. |
| `UNKNOWN_USER` | ERROR (Skips Row) | Payer or participant email does not exist in the database. |
| `PAYER_NOT_IN_GROUP` | ERROR (Skips Row) | Payer is not in the group, or joined after / left before the expense date. |
| `PARTICIPANT_NOT_IN_GROUP` | ERROR (Skips Row) | Participant is not in the group on the expense date. |
| `SELF_PAYMENT` | ERROR (Skips Row) | Payer is the sole participant of the split. |
| `INVALID_SPLIT_METHOD` | ERROR (Skips Row) | Split method is not one of: EQUAL, EXACT, PERCENTAGE, CUSTOM. |
| `SPLIT_MISMATCH` | ERROR (Skips Row) | Sum of exact splits !== amount, sum of percentage splits !== 100%, etc. |
| `BLANK_DESCRIPTION` | ERROR (Skips Row) | Description is missing or blank. |
| `CURRENCY_CONVERSION` | WARNING (Imports Row) | Converted foreign currency to USD using static exchange rates. |
| `DUPLICATE_EXPENSE` | ERROR (Skips Row) | Identical expense (payer, amount, date, description) already exists. |
| `CONFLICTING_DUPLICATE` | WARNING (Imports Row) | Same description, payer, and date, but different amount. |
| `SETTLEMENT_DISGUISED_AS_EXPENSE` | WARNING (Imports Row) | Description contains settlement keywords or split is a 1-to-1 repayment. |
