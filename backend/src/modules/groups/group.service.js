import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";

const membershipUserSelect = {
  id: true,
  name: true,
  email: true,
};

const groupInclude = {
  members: {
    where: { leftAt: null },
    include: { user: { select: membershipUserSelect } },
    orderBy: { joinedAt: "asc" },
  },
};

export async function createGroup(userId, input) {
  return prisma.$transaction(async (transaction) => {
    const group = await transaction.group.create({
      data: {
        name: input.name,
        description: input.description,
        createdById: userId,
      },
    });

    await transaction.groupMember.create({
      data: {
        groupId: group.id,
        userId,
        role: "ADMIN",
      },
    });

    return transaction.group.findUnique({
      where: { id: group.id },
      include: groupInclude,
    });
  });
}

export async function updateGroup(groupId, userId, input) {
  await requireActiveAdmin(groupId, userId);

  return prisma.group.update({
    where: { id: groupId },
    data: input,
    include: groupInclude,
  });
}

export async function deleteGroup(groupId, userId) {
  const group = await findGroupOrThrow(groupId);

  if (group.createdById !== userId) {
    throw new AppError("Only the group creator can delete this group", 403);
  }

  await prisma.group.delete({ where: { id: groupId } });
}

export async function addGroupMember(groupId, requestingUserId, { email, joinedAt }) {
  await requireActiveAdmin(groupId, requestingUserId);

  const user = await prisma.user.findUnique({
    where: { email },
    select: membershipUserSelect,
  });

  if (!user) {
    throw new AppError("No user exists with this email", 404);
  }

  try {
    return await prisma.groupMember.create({
      data: {
        groupId,
        userId: user.id,
        joinedAt,
      },
      include: { user: { select: membershipUserSelect } },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError("User is already an active member of this group", 409);
    }

    throw error;
  }
}

export async function removeGroupMember(groupId, memberUserId, requestingUserId, { leftAt }) {
  await requireActiveAdmin(groupId, requestingUserId);

  const group = await findGroupOrThrow(groupId);

  if (group.createdById === memberUserId) {
    throw new AppError("The group creator cannot be removed", 409);
  }

  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId,
      userId: memberUserId,
      leftAt: null,
    },
  });

  if (!membership) {
    throw new AppError("User is not an active member of this group", 404);
  }

  const effectiveLeftAt = leftAt ?? new Date();

  if (effectiveLeftAt < membership.joinedAt) {
    throw new AppError("Member leave date cannot be before join date", 400);
  }

  return prisma.groupMember.update({
    where: { id: membership.id },
    data: { leftAt: effectiveLeftAt },
    include: { user: { select: membershipUserSelect } },
  });
}

async function requireActiveAdmin(groupId, userId) {
  const group = await findGroupOrThrow(groupId);
  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId,
      userId,
      role: "ADMIN",
      leftAt: null,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new AppError("Group administrator access required", 403);
  }

  return group;
}

async function findGroupOrThrow(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, createdById: true },
  });

  if (!group) {
    throw new AppError("Group not found", 404);
  }

  return group;
}

function isUniqueConstraintError(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

