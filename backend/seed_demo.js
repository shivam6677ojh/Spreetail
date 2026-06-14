import { prisma } from "./src/lib/prisma.js";

async function run() {
  console.log("Starting database cleanup and demo seeding...");
  try {
    // 1. Delete all existing expenses and settlements
    const delSettlements = await prisma.settlement.deleteMany();
    console.log(`Deleted ${delSettlements.count} settlements.`);

    const delParticipants = await prisma.expenseParticipant.deleteMany();
    console.log(`Deleted ${delParticipants.count} expense participants.`);

    const delExpenses = await prisma.expense.deleteMany();
    console.log(`Deleted ${delExpenses.count} expenses.`);

    // 2. Find Flatmates group and its members
    const groupId = "e989a35b-5027-4d45-9585-44bf17c83cb8";
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true }
    });

    if (members.length === 0) {
      console.log("No members found in group Flatmates.");
      return;
    }

    const memberIds = members.map(m => m.userId);
    console.log(`Group Flatmates has ${memberIds.length} members:`, memberIds);

    // Helper to calculate equal split amounts
    const getEqualSplitParticipants = (amount, userIds) => {
      const splitAmt = (parseFloat(amount) / userIds.length).toFixed(4);
      return userIds.map(uId => ({
        userId: uId,
        amount: splitAmt
      }));
    };

    // 3. Seed expenses
    // Expense 1: Dinner — ₹1200 paid by SHIVAM (49e7ae85-afc7-41d4-b3a0-9fd01270186e)
    const shivamId = "49e7ae85-afc7-41d4-b3a0-9fd01270186e";
    const aishaId = "fef8d7ad-23cb-48af-9517-da80fb37bfd5";

    console.log("Seeding Expense 1: Dinner — ₹1200");
    await prisma.expense.create({
      data: {
        groupId,
        createdById: shivamId,
        paidById: shivamId,
        description: "Dinner",
        amount: 1200.00,
        currency: "INR",
        splitMethod: "EQUAL",
        expenseDate: new Date(),
        notes: "Shared flat dinner",
        participants: {
          create: getEqualSplitParticipants(1200.00, memberIds)
        }
      }
    });

    // Expense 2: Rent — ₹8000 paid by SHIVAM
    console.log("Seeding Expense 2: Rent — ₹8000");
    await prisma.expense.create({
      data: {
        groupId,
        createdById: shivamId,
        paidById: shivamId,
        description: "Rent",
        amount: 8000.00,
        currency: "INR",
        splitMethod: "EQUAL",
        expenseDate: new Date(),
        notes: "Monthly flat rent",
        participants: {
          create: getEqualSplitParticipants(8000.00, memberIds)
        }
      }
    });

    // Expense 3: Electricity — ₹1500 paid by Aisha
    console.log("Seeding Expense 3: Electricity — ₹1500");
    await prisma.expense.create({
      data: {
        groupId,
        createdById: shivamId,
        paidById: aishaId,
        description: "Electricity",
        amount: 1500.00,
        currency: "INR",
        splitMethod: "EQUAL",
        expenseDate: new Date(),
        notes: "Electricity bill",
        participants: {
          create: getEqualSplitParticipants(1500.00, memberIds)
        }
      }
    });

    console.log("Database successfully cleaned and seeded with INR demo data! 🚀");
  } catch (err) {
    console.error("Error during database seeding:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
