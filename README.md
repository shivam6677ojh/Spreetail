# Spreetail Shared Expense App

A React + Node.js/Express shared expense application (similar to Splitwise) designed to track group spending, calculate balances, record settlements, and audit bulk expense sheets with anomaly detection.

---

## Technical Stack

- **Frontend**: React, Vite, React Router v7, Axios, Tailwind CSS v3
- **Backend**: Node.js, Express, Prisma ORM, PostgreSQL, JWT authentication, bcrypt, Zod, csv-parse
- **Testing**: Vitest & Supertest

---

## Local Setup

### Prerequisites
Make sure you have **Node.js 20+** and **Docker** installed.

### Step 1: Start Database Container
```bash
docker compose up -d
```

### Step 2: Configure Environment
Copy `.env.example` to `.env` in both folders and adjust values if necessary:
- **Backend**: [backend/.env](file:///d:/SplitWisetask/backend/.env)
- **Frontend**: [frontend/.env](file:///d:/SplitWisetask/frontend/.env)

### Step 3: Run Database Migrations & Generate Client
```bash
cd backend
npm install
npm run prisma:migrate -- --name init
npm run dev
```

### Step 4: Run Frontend Dev Server
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
The frontend runs at `http://localhost:5173` and the API at `http://localhost:4000/api`.

---

## Database Design

The relational schema (managed via Prisma & PostgreSQL) consists of:
- **Users**: User credentials, hashes, and profiles.
- **Groups**: Expense groups created by users.
- **Group Members**: Tracks join and leave date intervals for members in a group.
- **Expenses**: Individual expenses containing payers, split methods, and details.
- **Expense Participants**: Owed share per participant (at 4-decimal precision).
- **Settlements**: Directly recorded payments resolving balances (never treated as expenses).
- **Imports**: Tracks bulk uploads of CSV expense sheets.
- **Import Anomalies**: Contains warning/error audit logs generated during parsing.

---

## CSV Export Format

Bulk uploads are performed using `.csv` files. The header columns must be:
```csv
date,description,amount,currency,payer_email,split_method,participants
```
The `participants` column uses a semicolon-separated list:
- **EQUAL**: `email1;email2` (splits evenly, rounding remainder absorbed by the last member).
- **EXACT**: `email1:amount1;email2:amount2` (split amounts must equal total).
- **PERCENTAGE**: `email1:percentage1;email2:percentage2` (percentage sum must equal 100%).
- **CUSTOM**: `email1:weight1;email2:weight2` (splits based on relative weights).

---

## Anomaly Detection Policies

During CSV imports, the engine parses rows and audits them against 18+ different anomaly policies:
1. **DUPLICATE_IMPORT**: Detects SHA-256 file hash collisions against previous imports in the group.
2. **EMPTY_CSV**: Empty files are blocked from importing.
3. **MALFORMED_ROW / BLANK_DESCRIPTION**: Handles missing fields or blank text.
4. **NEGATIVE_AMOUNT / ZERO_AMOUNT**: Restricts negative/zero amounts.
5. **INVALID_DATE / FUTURE_DATE**: Restricts future dates and unparseable dates.
6. **INVALID_CURRENCY**: Rejects unsupported codes (supported: USD, EUR, GBP, CAD, INR, AUD, JPY).
7. **CURRENCY_CONVERSION**: Warns when foreign currencies are converted to USD.
8. **UNKNOWN_USER**: Rejects emails not registered in the system.
9. **PAYER_NOT_IN_GROUP / PARTICIPANT_NOT_IN_GROUP**: Rejects emails of members not active in the group on the expense date.
10. **SELF_PAYMENT**: Rejects expenses where the payer splits solely with themselves.
11. **SPLIT_MISMATCH**: Rejects exact splits not totaling the amount, or percentages not totaling 100%.
12. **DUPLICATE_EXPENSE**: Rejects rows identical to database entries or other rows in the file.
13. **CONFLICTING_DUPLICATE**: Warns when expenses share descriptions, dates, and payers but differ in amounts.
14. **SETTLEMENT_DISGUISED_AS_EXPENSE**: Warns when description keywords or split patterns look like direct settlements.

---

## Testing & Verification

Run the comprehensive Vitest test suite in the backend directory:
```bash
cd backend
npm test
```
To run linter and build audits:
```bash
# Backend
npm run lint
npm run build

# Frontend
npm run lint
npm run build
```
All builds, tests, and linters compile clean.
