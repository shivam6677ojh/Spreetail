import { PrismaClient } from "@prisma/client";

async function run() {
  const directUrl = "postgresql://neondb_owner:npg_pwc1UAjB4NXq@ep-aged-recipe-ai54jkx4.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
  console.log("Connecting directly to database...");
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: directUrl,
      },
    },
  });

  try {
    const start = Date.now();
    const user = await prisma.user.findFirst();
    console.log(`findFirst took ${Date.now() - start}ms`);

    const startCreate = Date.now();
    const result = await prisma.expense.create({
      data: {
        groupId: "e989a35b-5027-4d45-9585-44bf17c83cb8",
        createdById: user.id,
        paidById: user.id,
        description: "Direct Test Dinner",
        amount: "30.00",
        currency: "USD",
        splitMethod: "EQUAL",
        expenseDate: new Date(),
        notes: "Direct notes",
      },
    });
    console.log(`create took ${Date.now() - startCreate}ms`);
  } catch (err) {
    console.error("Direct connection error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
