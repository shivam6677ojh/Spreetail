import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { calculateParticipantAmounts } from "./split-calculator.js";

const userSelect = { id: true, name: true, email: true };
const expenseInclude = {
  paidBy: { select: userSelect },
  createdBy: { select: userSelect },
  participants: {
    include: { user: { select: userSelect } },
    orderBy: { userId: "asc" },
  },
};

export async function createExpense(groupId, userId, input) {
  await requireActiveMember(groupId, userId);
  
  // Prevent duplicate submissions within 15 seconds
  const recentDuplicate = await prisma.expense.findFirst({
    where: {
      groupId,
      description: input.description,
      amount: input.amount,
      paidById: input.paidById,
      splitMethod: input.splitMethod,
      createdAt: {
        gte: new Date(Date.now() - 15000),
      },
    },
  });
  if (recentDuplicate) {
    throw new AppError("A duplicate expense was already created in the last 15 seconds", 400);
  }

  const participantAmounts = calculateParticipantAmounts(
    input.amount,
    input.splitMethod,
    input.participants,
  );
  await requireMembersOnDate(
    groupId,
    [input.paidById, ...participantAmounts.map(({ userId: participantId }) => participantId)],
    input.expenseDate,
  );

  return prisma.expense.create({
    data: {
      groupId,
      createdById: userId,
      paidById: input.paidById,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      splitMethod: input.splitMethod,
      expenseDate: input.expenseDate,
      notes: input.notes,
      participants: {
        create: participantAmounts,
      },
    },
    include: expenseInclude,
  });
}

export async function updateExpense(groupId, expenseId, userId, input) {
  const expense = await findExpenseOrThrow(groupId, expenseId);
  await requireExpenseManager(groupId, userId, expense.createdById);

  const effectiveDate = input.expenseDate ?? expense.expenseDate;
  const effectivePayerId = input.paidById ?? expense.paidById;
  let participantAmounts;

  if (input.splitMethod && input.participants) {
    participantAmounts = calculateParticipantAmounts(
      input.amount ?? expense.amount,
      input.splitMethod,
      input.participants,
    );
  }

  const participantIds =
    participantAmounts?.map(({ userId: participantId }) => participantId) ??
    expense.participants.map(({ userId: participantId }) => participantId);
  await requireMembersOnDate(groupId, [effectivePayerId, ...participantIds], effectiveDate);

  const expenseData = { ...input };
  delete expenseData.participants;
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...expenseData,
      ...(participantAmounts
        ? {
            participants: {
              deleteMany: {},
              create: participantAmounts,
            },
          }
        : {}),
    },
    include: expenseInclude,
  });
}

export async function deleteExpense(groupId, expenseId, userId) {
  const expense = await findExpenseOrThrow(groupId, expenseId);
  await requireExpenseManager(groupId, userId, expense.createdById);
  await prisma.expense.delete({ where: { id: expenseId } });
}

export async function listExpenses(groupId, userId, { page, pageSize }) {
  await requireActiveMember(groupId, userId);
  const where = { groupId };
  const [expenses, total] = await prisma.$transaction([
    prisma.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  return { expenses, pagination: { page, pageSize, total } };
}

export async function getExpense(groupId, expenseId, userId) {
  await requireActiveMember(groupId, userId);
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    include: expenseInclude,
  });

  if (!expense) {
    throw new AppError("Expense not found", 404);
  }

  return expense;
}

async function findExpenseOrThrow(groupId, expenseId) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    include: { participants: { select: { userId: true } } },
  });

  if (!expense) {
    throw new AppError("Expense not found", 404);
  }

  return expense;
}

async function requireActiveMember(groupId, userId) {
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId, leftAt: null },
    select: { id: true, role: true },
  });

  if (!membership) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    throw new AppError(group ? "Active group membership required" : "Group not found", group ? 403 : 404);
  }

  return membership;
}

async function requireExpenseManager(groupId, userId, createdById) {
  const membership = await requireActiveMember(groupId, userId);

  if (createdById !== userId && membership.role !== "ADMIN") {
    throw new AppError("Only the expense creator or a group admin can modify this expense", 403);
  }
}

async function requireMembersOnDate(groupId, userIds, expenseDate) {
  const uniqueUserIds = [...new Set(userIds)];
  const dayStart = new Date(expenseDate);
  const dayEnd = new Date(expenseDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const memberships = await prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: uniqueUserIds },
      joinedAt: { lte: dayEnd },
      OR: [{ leftAt: null }, { leftAt: { gte: dayStart } }],
    },
    select: { userId: true },
  });
  const memberIds = new Set(memberships.map(({ userId }) => userId));
  const invalidUserIds = uniqueUserIds.filter((memberId) => !memberIds.has(memberId));

  if (invalidUserIds.length > 0) {
    throw new AppError("Payer and participants must belong to the group on the expense date", 400, {
      userIds: invalidUserIds,
    });
  }
}

