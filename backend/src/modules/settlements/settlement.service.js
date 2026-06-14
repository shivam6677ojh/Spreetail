import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";

const userSelect = { id: true, name: true, email: true };
const settlementInclude = {
  paidBy: { select: userSelect },
  paidTo: { select: userSelect },
  recordedBy: { select: userSelect },
};

export async function createSettlement(groupId, recorderUserId, input) {
  // 1. Ensure recorder is an active member of the group
  await requireActiveMember(groupId, recorderUserId);

  // Prevent duplicate submissions within 15 seconds
  const recentDuplicate = await prisma.settlement.findFirst({
    where: {
      groupId,
      paidById: input.paidById,
      paidToId: input.paidToId,
      amount: input.amount,
      createdAt: {
        gte: new Date(Date.now() - 15000),
      },
    },
  });
  if (recentDuplicate) {
    throw new AppError("A duplicate settlement was already recorded in the last 15 seconds", 400);
  }

  // 2. Validate payer and recipient are different
  if (input.paidById === input.paidToId) {
    throw new AppError("Payer and recipient must be different users", 400);
  }

  // 3. Ensure payer and recipient belong to the group on the settlement date
  const settlementDate = input.settledAt ? new Date(input.settledAt) : new Date();
  await requireMembersOnDate(groupId, [input.paidById, input.paidToId], settlementDate);

  // 4. Create settlement record
  return prisma.settlement.create({
    data: {
      groupId,
      recordedById: recorderUserId,
      paidById: input.paidById,
      paidToId: input.paidToId,
      amount: input.amount,
      currency: input.currency ?? "USD",
      settledAt: settlementDate,
      notes: input.notes,
    },
    include: settlementInclude,
  });
}

export async function listSettlements(groupId, userId) {
  // Ensure the requesting user is an active/past member of the group to see settlements
  await requireGroupMember(groupId, userId);

  return prisma.settlement.findMany({
    where: { groupId },
    include: settlementInclude,
    orderBy: { settledAt: "desc" },
  });
}

async function requireActiveMember(groupId, userId) {
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId, leftAt: null },
    select: { id: true },
  });

  if (!membership) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    throw new AppError(group ? "Active group membership required" : "Group not found", group ? 403 : 404);
  }
}

async function requireGroupMember(groupId, userId) {
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
    select: { id: true },
  });

  if (!membership) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    throw new AppError(group ? "Group membership required" : "Group not found", group ? 403 : 404);
  }
}

async function requireMembersOnDate(groupId, userIds, dateObj) {
  const uniqueUserIds = [...new Set(userIds)];
  
  const memberships = await prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: uniqueUserIds },
      joinedAt: { lte: dateObj },
      OR: [
        { leftAt: null },
        { leftAt: { gte: dateObj } }
      ]
    },
    select: { userId: true },
  });

  const memberIds = new Set(memberships.map(({ userId }) => userId));
  const invalidUserIds = uniqueUserIds.filter((id) => !memberIds.has(id));

  if (invalidUserIds.length > 0) {
    throw new AppError("Payer and recipient must belong to the group on the settlement date", 400, {
      userIds: invalidUserIds,
    });
  }
}
