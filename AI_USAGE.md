# Spreetail Shared Expense App – AI Usage Report

This document outlines the AI assistance utilized during the development of this project, including three mistakes identified and corrected.

---

## 1. AI Assistance Summary
An AI coding assistant was used to pair program with the developer to implement Tasks 6 through 13:
- Developed the **Settlement Module** (record direct payments, list payments).
- Implemented the **Balance Engine** (aggregating costs, greedy transaction minimization).
- Integrated the **CSV Import Engine** utilizing the `csv-parse` library.
- Built 18+ **Anomaly Detection** validation rules for rows and context.
- Developed a high-fidelity **React Dashboard UI** with active status indicators, forms, modals, and tabs.
- Wrote unit test suites verifying settlements, balance minimization, and CSV imports.

---

## 2. AI Mistakes and Corrections

### Mistake 1: EQUAL Split Calculator Primitive Weight Bug
- **Mistake**: When implementing the split calculator, the AI mapped participants to a primitive JavaScript number `1` for the `EQUAL` split method:
  `participants.map(({ userId }) => ({ userId, weight: 1 }))`
  However, the weights receiver `allocateByWeights` expects all weights to be `Prisma.Decimal` instances. This caused `weight.lessThanOrEqualTo` to throw a `TypeError: weight.lessThanOrEqualTo is not a function`, failing all equal-split tests.
- **Correction**: Modified the mapping to instantiate a decimal object:
  `participants.map(({ userId }) => ({ userId, weight: new Prisma.Decimal(1) }))`
  This resolved the crash and restored test suite integrity.

### Mistake 2: Missing Group Listing Route in Backend
- **Mistake**: The AI designed the React dashboard assuming that a GET `/api/groups` endpoint existed to list all groups a user belongs to. However, reviewing the backend code showed that no such listing service, controller, or route was defined in Tasks 1-5.
- **Correction**: Implemented the `listUserGroups` service function inside `group.service.js`, added a `list` controller in `group.controller.js`, and registered the GET `/api/groups` endpoint in `group.routes.js`. A unit test was also added in `groups.test.js` to verify its correctness.

### Mistake 3: Authentication Request Field Mismatch
- **Mistake**: In the initial design of the Settlements controller, the AI extracted the recorder's user ID from `request.user.id`. This caused tests to fail with `500 Internal Server Error` due to `TypeError: Cannot read properties of undefined (reading 'id')`.
- **Correction**: Investigating the `authenticate.js` middleware revealed that it populates the authenticated payload in `request.auth.userId` rather than `request.user`. The controller was corrected to access `request.auth.userId`, matching the existing middleware architecture.
