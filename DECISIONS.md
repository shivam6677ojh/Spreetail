# 🧠 Spreetail Shared Expenses App – Decisions Log

This document details the architectural, product, and engineering decisions made during the development of this application, outlining the options considered and the rationale for our choices.

---

## 1. Database Choice: PostgreSQL vs. MongoDB

* **Options Considered**:
  1. **Document Database (MongoDB / NoSQL)**: Highly flexible document schemas, fast reads, but no native enforcement of relations.
  2. **Relational Database (PostgreSQL)**: Enforced schemas, ACID transactions, foreign key constraints, and cascade delete configurations.
* **Why Chosen**: **PostgreSQL**. Financial applications require strict data integrity. To ensure that deleting a CSV import cleanly rolls back all created expenses and participants without leaving orphaned records, relational database cascade deletes are essential. Compound unique constraints (e.g. preventing the same user from joining a group twice on the same date, or preventing the same CSV file hash from being imported twice) are easily enforced at the database layer.

---

## 2. Multi-Currency Strategy: Separate USD/INR vs. Strict Unified USD

* **Options Considered**:
  1. **Strict Unified USD**: Convert all currencies (including INR) to USD upon import and store everything in USD.
  2. **Multi-Currency Balances**: Allow USD and INR to coexist natively in the database. Calculate group totals, net balances, and simplified debt transfers separately for each currency.
* **Why Chosen**: **Multi-Currency Balances**. Converting INR to USD on import would violate Aisha's request (*"I want one number per person"*) and Rohan's request (*"If the app says I owe ₹2,300, I want to see exactly which expenses make that up"*). If we converted INR, Rohan would see his debt fluctuated by exchange rates rather than matching his exact spreadsheet records. Preserving USD and INR natively and providing a toggle on the frontend allows members to settle up in the exact currency they spent, resolving Priya's concern (*"The sheet pretends a dollar is a rupee"*).

---

## 3. Timeline Violations: Rejecting Rows vs. Graceful Exclusion

* **Options Considered**:
  1. **Reject/Skip Row**: If any participant listed in a CSV row was inactive on the expense date (e.g. Sam in March, or Meera in April), reject the entire row.
  2. **Graceful Exclusion (Exclude and Re-split)**: Auto-detect timeline overlaps, exclude the inactive member from the split calculation, split the cost among the active members, and log a `PARTICIPANT_NOT_IN_GROUP` warning.
* **Why Chosen**: **Graceful Exclusion**. Rejecting the entire row would crash the import or skip legitimate costs spent by active members. Excluding the inactive member keeps the import flow moving while protecting members from historical bills that do not concern them, satisfying Sam's request (*"I moved in mid-April. Why would March electricity affect my balance?"*).

---

## 4. PDF Generation: Native HTML Print vs. jsPDF Library

* **Options Considered**:
  1. **jsPDF / html2canvas Libraries**: Generate PDFs silently in the background on the client side.
  2. **Native HTML Print Window styled with CSS**: Open a blank print-friendly window, generate a structured HTML document, apply custom print styles, and call `window.print()`.
* **Why Chosen**: **Native HTML Print Window**. 
  - **No external package bloat**: Keeps the Vite frontend bundle small and fast.
  - **Perfect Vector Quality**: Unlike canvas-to-pdf generators that capture screenshots and blur text, native printing renders crisp vector text.
  - **Handling Page Breaks**: Standard print styles handle page boundaries cleanly using `page-break-inside: avoid;` on rows, whereas client-side PDF scripts frequently cut off tables mid-row.

---

## 5. Write Timeouts: Row-by-Row Transactions vs. Bulk Import Writes

* **Options Considered**:
  1. **Row-by-Row Transaction**: Process and insert each row individually inside a single database transaction block.
  2. **Bulk Insertion (`createMany`)**: Perform all validation checks in memory, bundle the database rows, and write them in bulk.
* **Why Chosen**: **Bulk Insertion**. Neon serverless databases sleep when inactive and have high round-trip latency (~250ms) from local development environments. Running 40+ sequential insert queries inside a transaction caused connection pool starvation and timeout errors. Refactoring the engine to perform a pre-check scan and executing bulk inserts outside transaction loops reduced database queries to 4, bringing import times down from 10+ seconds to 200ms.
