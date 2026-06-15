import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Dropping database constraints to allow negative expense/participant amounts...");
  
  try {
    // Drop expenses positive check
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_positive_amount_check";`
    );
    console.log("Dropped constraint 'expenses_positive_amount_check' successfully.");
  } catch (err) {
    console.error("Failed to drop constraint 'expenses_positive_amount_check':", err.message);
  }

  try {
    // Drop expense_participants non-negative check
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "expense_participants" DROP CONSTRAINT IF EXISTS "expense_participants_nonnegative_amount_check";`
    );
    console.log("Dropped constraint 'expense_participants_nonnegative_amount_check' successfully.");
  } catch (err) {
    console.error("Failed to drop constraint 'expense_participants_nonnegative_amount_check':", err.message);
  }

  console.log("Constraints updated!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
