# Spreetail Shared Expense App – Architectural Decisions

This document details the key architectural and design decisions made during the development of the Spreetail Shared Expense Application.

---

## 1. Programming Language & Module System
- **Decision**: Retain JavaScript ES Modules (`type: "module"`) instead of converting the codebase to TypeScript.
- **Rationale**: The core template and foundation code (Tasks 1 to 5) were already fully implemented in ES Modules JavaScript (using `.js` and `.jsx` extensions, with configuration files for Vitest, ESLint, and Tailwind built around ES Modules). Converting the entire codebase to TypeScript would have introduced unnecessary compile-time overhead, configuration changes, and risking regressions in already passing tests. We maintain codebase consistency and readability by keeping the existing Javascript ES Modules structure.

---

## 2. Database Schema & Constraints
- **Decision**: Keep the PostgreSQL database schema normalized with foreign keys and unique indexes.
- **Rationale**: 
  - The `group_members` table handles intervals using `joined_at` and `left_at` fields. A unique compound index prevents more than one active membership per user/group.
  - The `Import` model stores a `fileHash` representing the SHA-256 hash of the CSV text. A unique index `@@unique([groupId, fileHash])` prevents re-importing the same CSV.
  - Cascade deletes are implemented for `Group` -> `GroupMember`, `Expense`, and `Settlement`, but restrict deletes for `User` to avoid orphans.

---

## 3. Balance Engine & Transfer Minimization
- **Decision**: Implement a Greedy Debt Minimization algorithm for the "Who pays whom" calculation.
- **Rationale**:
  - We calculate each user's net position in a group: `Net = (Total Paid) - (Total Owed)`.
  - Users with positive net balances are creditors; users with negative net balances are debtors.
  - The greedy matching algorithm repeatedly matches the largest debtor (most negative balance) with the largest creditor (most positive balance), suggesting a direct transfer of the minimum of the two balances, and subtracting/adding the transferred amount.
  - This reduces the number of transactions from $O(N)$ simple payments to at most $N-1$ transfers. The greedy strategy is easy to explain, computationally efficient ($O(N \log N)$ per iteration), and guarantees debt resolution.

---

## 4. CSV Import Parsing Library
- **Decision**: Use the proven `csv-parse` library instead of implementing a custom parser.
- **Rationale**: 
  - Standard CSV files can include edge cases like quoted fields, commas inside quotes, multi-line quoted entries, and carriage returns.
  - Writing a custom regex or split parser for these edge cases is error-prone.
  - By installing and using the robust and battle-tested `csv-parse` library, we ensure the engine parses standard formats correctly and handles errors gracefully.

---

## 5. Currency Normalization Policy
- **Decision**: Normalize all foreign currencies to USD upon import and store them as USD.
- **Rationale**:
  - The application's database represents expenses in USD by default.
  - To support mixed currencies without introducing complex live exchange rate API dependencies (which can fail due to rate limits or offline states), we implement a static, documented exchange rate mapping:
    - `EUR`: `1.10 USD`
    - `GBP`: `1.25 USD`
    - `CAD`: `0.75 USD`
    - `INR`: `0.012 USD`
    - `AUD`: `0.65 USD`
    - `JPY`: `0.0065 USD`
  - When a foreign currency is detected, we perform the calculation, normalize the amount to 4 decimal places, save the expense in USD, and log a `CURRENCY_CONVERSION` warning anomaly containing the conversion details. This keeps data uniform while keeping the user fully informed.
