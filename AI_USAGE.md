# 🤖 Spreetail Shared Expenses App – AI Usage Report

This document outlines the AI assistance utilized during the development of this project, key prompts, and 4 concrete cases where the AI produced incorrect code, along with how we caught and corrected it.

---

## 1. AI Assistance Summary

* **AI Used**: **Antigravity (Google DeepMind)**
* **Collaborative Scope**:
  - Developed the **Settlement Module** (record direct payments, list payments).
  - Implemented the **Balance Engine** (aggregating costs, greedy transaction minimization).
  - Integrated the **CSV Import Engine** utilizing the `csv-parse` library.
  - Built 18+ **Anomaly Detection** validation rules for rows and context.
  - Developed a high-fidelity **React Dashboard UI** with active status indicators, forms, modals, and tabs.
  - Wrote unit test suites verifying settlements, balance minimization, and CSV imports.

---

## 2. Key Prompts Used

* **Prompt 1 (Database & Schema)**:
  > *"Review the legacy schema.prisma file. We need to add tables to support CSV Import logs and CSV Anomaly logs. Make sure to implement cascade delete on the group relation so that removing a group cleans up all historical imports and anomalies, but restrict user deletion to prevent orphan records."*
* **Prompt 2 (CSV Import Column Mapping)**:
  > *"The CSV file expenses_export.csv has header names like paid_by, split_type, split_with, split_details. The legacy parser expected payer_email, split_method, participants. Write a case-insensitive lookup helper getRowValue that resolves these column aliases automatically so we do not have to modify the CSV manually."*
* **Prompt 3 (Greedy Transfer Simplification)**:
  > *"Implement a Greedy Transfer Minimization algorithm in JavaScript using Prisma.Decimal. Find the net balance of each user, separate them into debtors and creditors, and match the largest debtor with the largest creditor iteratively until all debts are settled in the minimum number of transactions."*
* **Prompt 4 (Report PDF Export)**:
  > *"Write a frontend print handler downloadReportPDF(report) that opens a print-friendly blank window, formats the HTML, applies print styles, and automatically opens the browser print dialog to let the user save to PDF. Do not install jspdf."*

---

## 3. AI Mistakes & Corrections

### Case 1: EQUAL Split Calculator Primitive Weight Bug
* **The Mistake**: When implementing the split calculator, the AI mapped participants to a primitive JavaScript number `1` for the `EQUAL` split method:
  `participants.map(({ userId }) => ({ userId, weight: 1 }))`
  However, the weight allocator `allocateByWeights` expects all weights to be `Prisma.Decimal` instances.
* **How We Caught It**: The test suite crashed during test runs with `TypeError: weight.lessThanOrEqualTo is not a function`.
* **The Correction**: Modified the mapping to instantiate a decimal object:
  `participants.map(({ userId }) => ({ userId, weight: new Prisma.Decimal(1) }))`
  This resolved the crash and restored test suite integrity.

---

### Case 2: Missing Group Listing Route in Backend
* **The Mistake**: The AI designed the React dashboard assuming that a GET `/api/groups` endpoint existed to list all groups a user belongs to. However, reviewing the backend code showed that no such listing service, controller, or route was defined in Tasks 1-5.
* **How We Caught It**: The frontend logged `AxiosError: Request failed with status code 404` on page load.
* **The Correction**: Implemented the `listUserGroups` service function inside `group.service.js`, added a `list` controller in `group.controller.js`, and registered the GET `/api/groups` endpoint in `group.routes.js`. A unit test was also added in `groups.test.js` to verify its correctness.

---

### Case 3: Authentication Request Field Mismatch
* **The Mistake**: In the initial design of the Settlements controller, the AI extracted the recorder's user ID from `request.user.id`.
* **How We Caught It**: Tests failed with `500 Internal Server Error` due to `TypeError: Cannot read properties of undefined (reading 'id')`.
* **The Correction**: Investigating the `authenticate.js` middleware revealed that it populates the authenticated payload in `request.auth.userId` rather than `request.user`. The controller was corrected to access `request.auth.userId`, matching the existing middleware architecture.

---

### Case 4: Database Check Constraints on Negative Amounts
* **The Mistake**: The AI assumed that storing negative amounts (refunds) in PostgreSQL would work out of the box because the Prisma model had a `Decimal` type.
* **How We Caught It**: Importing a negative amount row (Row 26, Parasailing refund) crashed the database insert with a PostgreSQL check constraint violation: `db error: check constraint "expenses_positive_amount_check" violated`.
* **The Correction**: Created and executed a script `drop_constraints.js` to drop `expenses_positive_amount_check` and `expense_participants_nonnegative_amount_check` constraints from the PostgreSQL database, allowing negative values to be saved natively.
