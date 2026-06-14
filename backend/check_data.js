import { prisma } from "./src/lib/prisma.js";

async function run() {
  try {
    const users = await prisma.user.findMany();
    console.log("=== USERS ===");
    users.forEach(u => console.log(`- ${u.name} (${u.email}) [${u.id}]`));

    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: true
          }
        }
      }
    });
    console.log("\n=== GROUPS & MEMBERS ===");
    groups.forEach(g => {
      console.log(`- Group: ${g.name} [${g.id}]`);
      g.members.forEach(m => console.log(`  * Member: ${m.user.name} (${m.user.email}) [Role: ${m.role}]`));
    });

    const expenses = await prisma.expense.findMany();
    console.log("\n=== EXPENSES ===");
    expenses.forEach(e => console.log(`- ${e.description}: ${e.currency} ${e.amount} [PaidBy: ${e.paidById}] [Group: ${e.groupId}]`));

    const settlements = await prisma.settlement.findMany();
    console.log("\n=== SETTLEMENTS ===");
    settlements.forEach(s => console.log(`- ${s.amount} ${s.currency} [From: ${s.paidById} To: ${s.paidToId}]`));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
