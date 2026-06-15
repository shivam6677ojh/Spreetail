import { PrismaClient } from "@prisma/client";
import { calculateGroupBalances } from "../src/modules/balances/balance.service.js";

const prisma = new PrismaClient();

async function main() {
  // Let's find an existing group first
  const group = await prisma.group.findFirst();
  if (!group) {
    console.log("No groups found in database.");
    return;
  }
  const groupId = group.id;
  const adminMember = await prisma.groupMember.findFirst({ where: { groupId } });
  if (!adminMember) {
    console.log("No members found in group " + groupId);
    return;
  }
  const userId = adminMember.userId;

  console.log(`Testing query performance for Group ID: ${groupId}, User ID: ${userId}`);

  // Test 1: findUnique Group
  console.time("GroupDetailsQuery");
  await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  console.timeEnd("GroupDetailsQuery");

  // Test 2: listExpenses
  console.time("ListExpensesQuery");
  await prisma.$transaction([
    prisma.expense.findMany({
      where: { groupId },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { userId: "asc" },
        },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip: 0,
      take: 10,
    }),
    prisma.expense.count({ where: { groupId } }),
  ]);
  console.timeEnd("ListExpensesQuery");

  // Test 3: settlements
  console.time("SettlementsQuery");
  await prisma.settlement.findMany({
    where: { groupId },
  });
  console.timeEnd("SettlementsQuery");

  // Test 4: imports
  console.time("ImportsQuery");
  await prisma.import.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
  });
  console.timeEnd("ImportsQuery");

  // Test 5: calculateGroupBalances
  console.time("CalculateGroupBalances");
  await calculateGroupBalances(groupId, userId);
  console.timeEnd("CalculateGroupBalances");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
