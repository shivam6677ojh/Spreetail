import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { createImport } from "../src/modules/imports/import.service.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting real CSV import test...");
  
  // 1. Read the CSV file
  const csvText = readFileSync("C:\\Users\\HP\\Downloads\\expenses_export.csv", "utf8");
  console.log(`Read expenses_export.csv: ${csvText.length} bytes`);

  // 2. Find or create a test user
  let admin = await prisma.user.findFirst({
    where: { email: "admin@example.com" }
  });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: "Admin User",
        email: "admin@example.com",
        passwordHash: "$2b$10$vI8Y6Dk3/43QzUp3d7K9.OxjQ0fS0k5T8eDk9GgG.r6UfW.K0607m"
      }
    });
  }

  // 3. Create a test group
  const testGroup = await prisma.group.create({
    data: {
      name: "Flatmates Test Group",
      description: "Testing Spreetail Shared Expenses CSV Import",
      createdById: admin.id
    }
  });
  console.log(`Created test group: ${testGroup.name} (ID: ${testGroup.id})`);

  // 4. Add admin to the group as ADMIN member
  await prisma.groupMember.create({
    data: {
      groupId: testGroup.id,
      userId: admin.id,
      role: "ADMIN",
      joinedAt: new Date("2026-02-01")
    }
  });

  // 5. Run the CSV Import Engine!
  console.log("Running CSV Import Engine...");
  const report = await createImport(testGroup.id, admin.id, csvText, "expenses_export.csv");

  console.log("\n=================== IMPORT REPORT ===================");
  console.log(`Status: ${report.status}`);
  console.log(`Total Rows: ${report.totalRows}`);
  console.log(`Successfully Imported Rows: ${report.importedRows}`);
  console.log(`Anomalous/Skipped Rows: ${report.anomalousRows}`);
  console.log(`Total Logged Anomalies: ${report.anomalies.length}`);
  
  console.log("\n--- Logged Anomalies / Audit Log ---");
  for (const anomaly of report.anomalies) {
    console.log(`[${anomaly.severity}] Row ${anomaly.rowNumber} (${anomaly.code}): ${anomaly.message}`);
  }
  console.log("=====================================================");

  // 6. Verify expense count in group
  const expenseCount = await prisma.expense.count({
    where: { groupId: testGroup.id }
  });
  const settlementCount = await prisma.settlement.count({
    where: { groupId: testGroup.id }
  });
  console.log(`Expenses in DB for group: ${expenseCount}`);
  console.log(`Settlements in DB for group: ${settlementCount}`);

  // 7. Cleanup test group
  console.log("Cleaning up test group...");
  await prisma.group.delete({
    where: { id: testGroup.id }
  });
  console.log("Cleanup complete!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
