import { prisma } from "./src/lib/prisma.js";
import { calculateParticipantAmounts } from "./src/modules/expenses/split-calculator.js";

async function requireActiveMember(groupId, userId) {
  console.log("Entering requireActiveMember...");
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId, leftAt: null },
    select: { id: true, role: true },
  });
  console.log("Leaving requireActiveMember...");
  return membership;
}

async function requireMembersOnDate(groupId, userIds, expenseDate) {
  console.log("Entering requireMembersOnDate...");
  const uniqueUserIds = [...new Set(userIds)];
  const dayStart = new Date(expenseDate);
  const dayEnd = new Date(expenseDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  console.log("Querying database in requireMembersOnDate...");
  const memberships = await prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: uniqueUserIds },
      joinedAt: { lte: dayEnd },
      OR: [{ leftAt: null }, { leftAt: { gte: dayStart } }],
    },
    select: { userId: true },
  });
  console.log("Finished querying database in requireMembersOnDate.");
  const memberIds = new Set(memberships.map(({ userId }) => userId));
  const invalidUserIds = uniqueUserIds.filter((memberId) => !memberIds.has(memberId));

  if (invalidUserIds.length > 0) {
    throw new Error("Payer and participants must belong to the group on the expense date");
  }
  console.log("Leaving requireMembersOnDate...");
}

async function run() {
  console.log("Starting test...");
  try {
    const user = await prisma.user.findFirst();
    const finalMembership = await prisma.groupMember.findFirst({
      where: { userId: user.id },
    });
    const groupId = finalMembership.groupId;

    console.log("1. requireActiveMember...");
    await requireActiveMember(groupId, user.id);

    console.log("2. calculateParticipantAmounts...");
    const participantAmounts = calculateParticipantAmounts(
      "30.00",
      "EQUAL",
      [{ userId: user.id }]
    );

    console.log("3. requireMembersOnDate...");
    await requireMembersOnDate(
      groupId,
      [user.id, ...participantAmounts.map(({ userId: pId }) => pId)],
      new Date()
    );

    console.log("4. prisma.expense.create...");
    const result = await prisma.expense.create({
      data: {
        groupId,
        createdById: user.id,
        paidById: user.id,
        description: "Test Dinner",
        amount: "30.00",
        currency: "USD",
        splitMethod: "EQUAL",
        expenseDate: new Date(),
        notes: "Test notes",
        participants: {
          create: participantAmounts,
        },
      },
    });
    console.log("Success! Result:", result);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
