import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  updateExpense,
} from "./expense.service.js";
import {
  createExpenseSchema,
  expenseGroupParamsSchema,
  expenseParamsSchema,
  listExpensesSchema,
  updateExpenseSchema,
} from "./expense.schemas.js";

export async function create(request, response) {
  const { groupId } = expenseGroupParamsSchema.parse(request.params);
  const input = createExpenseSchema.parse(request.body);
  const expense = await createExpense(groupId, request.auth.userId, input);
  response.status(201).json({ data: { expense } });
}

export async function update(request, response) {
  const { groupId, expenseId } = expenseParamsSchema.parse(request.params);
  const input = updateExpenseSchema.parse(request.body);
  const expense = await updateExpense(groupId, expenseId, request.auth.userId, input);
  response.status(200).json({ data: { expense } });
}

export async function remove(request, response) {
  const { groupId, expenseId } = expenseParamsSchema.parse(request.params);
  await deleteExpense(groupId, expenseId, request.auth.userId);
  response.status(204).send();
}

export async function list(request, response) {
  const { groupId } = expenseGroupParamsSchema.parse(request.params);
  const query = listExpensesSchema.parse(request.query);
  const result = await listExpenses(groupId, request.auth.userId, query);
  response.status(200).json({ data: result });
}

export async function details(request, response) {
  const { groupId, expenseId } = expenseParamsSchema.parse(request.params);
  const expense = await getExpense(groupId, expenseId, request.auth.userId);
  response.status(200).json({ data: { expense } });
}

