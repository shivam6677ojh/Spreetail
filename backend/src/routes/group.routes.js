import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  create as createExpense,
  details as expenseDetails,
  list as listExpenses,
  remove as removeExpense,
  update as updateExpense,
} from "../modules/expenses/expense.controller.js";
import {
  addMember,
  create,
  remove,
  removeMember,
  update,
  list as listGroups,
} from "../modules/groups/group.controller.js";
import {
  create as createSettlement,
  list as listSettlements,
} from "../modules/settlements/settlement.controller.js";
import { getBalances } from "../modules/balances/balance.controller.js";
import {
  create as createImport,
  list as listImports,
  report as getImportReport,
} from "../modules/imports/import.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const groupRouter = Router();

groupRouter.use(authenticate);
groupRouter.get("/", asyncHandler(listGroups));
groupRouter.post("/", asyncHandler(create));
groupRouter.post("/:groupId/expenses", asyncHandler(createExpense));
groupRouter.get("/:groupId/expenses", asyncHandler(listExpenses));
groupRouter.get("/:groupId/expenses/:expenseId", asyncHandler(expenseDetails));
groupRouter.patch("/:groupId/expenses/:expenseId", asyncHandler(updateExpense));
groupRouter.delete("/:groupId/expenses/:expenseId", asyncHandler(removeExpense));
groupRouter.post("/:groupId/settlements", asyncHandler(createSettlement));
groupRouter.get("/:groupId/settlements", asyncHandler(listSettlements));
groupRouter.get("/:groupId/balances", asyncHandler(getBalances));
groupRouter.post("/:groupId/imports", asyncHandler(createImport));
groupRouter.get("/:groupId/imports", asyncHandler(listImports));
groupRouter.get("/:groupId/imports/:importId", asyncHandler(getImportReport));
groupRouter.patch("/:groupId", asyncHandler(update));
groupRouter.delete("/:groupId", asyncHandler(remove));
groupRouter.post("/:groupId/members", asyncHandler(addMember));
groupRouter.delete("/:groupId/members/:userId", asyncHandler(removeMember));
