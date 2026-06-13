import crypto from "crypto";
import { parse } from "csv-parse/sync";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { convertToUSD, isSupportedCurrency } from "../../utils/currency.js";
import { calculateParticipantAmounts } from "../expenses/split-calculator.js";

export async function createImport(groupId, importedById, csvText, fileName) {
  // 1. Ensure requesting user is an active member
  await requireActiveMember(groupId, importedById);

  if (!csvText || csvText.trim() === "") {
    throw new AppError("Empty CSV file provided", 400);
  }

  // 2. Check for duplicate imports using file hash
  const fileHash = crypto.createHash("sha256").update(csvText).digest("hex");
  const existingImport = await prisma.import.findFirst({
    where: { groupId, fileHash },
  });

  if (existingImport) {
    throw new AppError("Duplicate import: this file has already been imported for this group", 409);
  }

  // 3. Create Import record in PROCESSING status
  const importRecord = await prisma.import.create({
    data: {
      groupId,
      importedById,
      fileName,
      fileHash,
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  let totalRows = 0;
  let importedRows = 0;
  let anomalousRows = 0;
  const anomaliesToCreate = [];
  const expensesToCreate = [];

  try {
    // 4. Parse CSV sync
    const rows = parse(csvText, {
      columns: (headers) => headers.map(h => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });

    totalRows = rows.length;

    if (totalRows === 0) {
      throw new AppError("No data rows found in the CSV file", 400);
    }

    // Load group members and all existing users once for quick lookups
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    // Create maps for fast lookups
    const memberEmailMap = {};
    for (const m of groupMembers) {
      memberEmailMap[m.user.email.toLowerCase()] = m;
    }

    // Fetch all users to resolve emails of non-members (for UNKNOWN_USER anomaly)
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, name: true },
    });
    const userEmailMap = {};
    for (const u of allUsers) {
      userEmailMap[u.email.toLowerCase()] = u;
    }

    // Load existing expenses in the group to detect duplicates/conflicts
    const existingExpenses = await prisma.expense.findMany({
      where: { groupId },
      include: { participants: true, paidBy: true },
    });

    // 5. Process each row
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const row = rows[i];
      const rowAnomalies = [];
      const rawData = JSON.stringify(row);

      // Validate required columns
      const requiredCols = ["date", "description", "amount", "currency", "payer_email", "split_method", "participants"];
      const missingCols = requiredCols.filter(col => row[col] === undefined || row[col] === null);
      
      if (missingCols.length > 0) {
        anomaliesToCreate.push({
          importId: importRecord.id,
          rowNumber: rowNum,
          code: "MALFORMED_ROW",
          message: `Missing required columns: ${missingCols.join(", ")}`,
          severity: "ERROR",
          rawData,
        });
        anomalousRows++;
        continue;
      }

      const { date, description, amount, currency, payer_email, split_method, participants: rawParticipants } = row;

      // Validate blank description
      if (!description || description.trim() === "") {
        rowAnomalies.push({ code: "BLANK_DESCRIPTION", message: "Expense description is blank", severity: "ERROR" });
      }

      // Validate Amount
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) {
        rowAnomalies.push({ code: "MALFORMED_ROW", message: "Amount is not a valid number", severity: "ERROR" });
      } else if (parsedAmount < 0) {
        rowAnomalies.push({ code: "NEGATIVE_AMOUNT", message: "Amount cannot be negative", severity: "ERROR" });
      } else if (parsedAmount === 0) {
        rowAnomalies.push({ code: "ZERO_AMOUNT", message: "Amount cannot be zero", severity: "ERROR" });
      }

      // Validate Date
      const expenseDate = new Date(date);
      if (isNaN(expenseDate.getTime())) {
        rowAnomalies.push({ code: "INVALID_DATE", message: `Invalid date format: ${date}`, severity: "ERROR" });
      } else if (expenseDate > new Date()) {
        rowAnomalies.push({ code: "FUTURE_DATE", message: `Date is in the future: ${date}`, severity: "ERROR" });
      }

      // Validate Currency
      let finalAmount = amount;
      if (!currency || currency.trim() === "") {
        rowAnomalies.push({ code: "INVALID_CURRENCY", message: "Currency code is missing", severity: "ERROR" });
      } else if (!isSupportedCurrency(currency)) {
        rowAnomalies.push({ code: "INVALID_CURRENCY", message: `Unsupported currency: ${currency}`, severity: "ERROR" });
      } else {
        const conversion = convertToUSD(amount, currency);
        if (conversion.isConverted) {
          finalAmount = conversion.amountUSD;
          rowAnomalies.push({
            code: "CURRENCY_CONVERSION",
            message: `Converted ${amount} ${currency.toUpperCase()} to ${finalAmount} USD (Rate: ${conversion.rate})`,
            severity: "WARNING",
          });
        }
      }

      // Validate Payer
      let payerUser = null;
      if (!payer_email || payer_email.trim() === "") {
        rowAnomalies.push({ code: "MALFORMED_ROW", message: "Payer email is missing", severity: "ERROR" });
      } else {
        const normalizedEmail = payer_email.trim().toLowerCase();
        const member = memberEmailMap[normalizedEmail];
        if (!member) {
          const systemUser = userEmailMap[normalizedEmail];
          if (!systemUser) {
            rowAnomalies.push({ code: "UNKNOWN_USER", message: `Payer email ${payer_email} is not registered`, severity: "ERROR" });
          } else {
            rowAnomalies.push({ code: "PAYER_NOT_IN_GROUP", message: `Payer ${payer_email} is not in this group`, severity: "ERROR" });
          }
        } else {
          payerUser = member.user;
          // Check join/leave dates
          if (member.joinedAt > expenseDate) {
            rowAnomalies.push({ code: "PAYER_NOT_IN_GROUP", message: `Payer joined the group on ${member.joinedAt.toISOString().slice(0, 10)} which is after the expense date`, severity: "ERROR" });
          } else if (member.leftAt && member.leftAt < expenseDate) {
            rowAnomalies.push({ code: "PAYER_NOT_IN_GROUP", message: `Payer left the group on ${member.leftAt.toISOString().slice(0, 10)} which is before the expense date`, severity: "ERROR" });
          }
        }
      }

      // Parse and Validate Split Method
      const splitMethod = split_method?.toUpperCase();
      const validSplitMethods = ["EQUAL", "EXACT", "PERCENTAGE", "CUSTOM"];
      if (!splitMethod || !validSplitMethods.includes(splitMethod)) {
        rowAnomalies.push({ code: "INVALID_SPLIT_METHOD", message: `Invalid split method: ${split_method}`, severity: "ERROR" });
      }

      // Parse and Validate Participants
      const parsedParticipants = [];
      if (!rawParticipants || rawParticipants.trim() === "") {
        rowAnomalies.push({ code: "MISSING_PARTICIPANTS", message: "Participant list is empty", severity: "ERROR" });
      } else {
        const parts = rawParticipants.split(";").map(p => p.trim());
        const participantEmailsSeen = new Set();

        for (const p of parts) {
          if (!p) continue;
          let email = p;
          let splitVal = null;

          if (p.includes(":")) {
            const index = p.indexOf(":");
            email = p.slice(0, index).trim();
            splitVal = p.slice(index + 1).trim();
          }

          const normalizedEmail = email.toLowerCase();
          if (participantEmailsSeen.has(normalizedEmail)) {
            rowAnomalies.push({ code: "MALFORMED_ROW", message: `Duplicate participant in split: ${email}`, severity: "ERROR" });
            continue;
          }
          participantEmailsSeen.add(normalizedEmail);

          const member = memberEmailMap[normalizedEmail];
          if (!member) {
            const systemUser = userEmailMap[normalizedEmail];
            if (!systemUser) {
              rowAnomalies.push({ code: "UNKNOWN_USER", message: `Participant email ${email} is not registered`, severity: "ERROR" });
            } else {
              rowAnomalies.push({ code: "PARTICIPANT_NOT_IN_GROUP", message: `Participant ${email} is not in this group`, severity: "ERROR" });
            }
          } else {
            // Check join/leave dates
            if (member.joinedAt > expenseDate) {
              rowAnomalies.push({ code: "PARTICIPANT_NOT_IN_GROUP", message: `Participant ${email} joined the group on ${member.joinedAt.toISOString().slice(0, 10)} which is after the expense date`, severity: "ERROR" });
            } else if (member.leftAt && member.leftAt < expenseDate) {
              rowAnomalies.push({ code: "PARTICIPANT_NOT_IN_GROUP", message: `Participant ${email} left the group on ${member.leftAt.toISOString().slice(0, 10)} which is before the expense date`, severity: "ERROR" });
            }

            const pEntry = { userId: member.userId, email: normalizedEmail };
            if (splitMethod === "EXACT") pEntry.amount = splitVal;
            else if (splitMethod === "PERCENTAGE") pEntry.percentage = splitVal;
            else if (splitMethod === "CUSTOM") pEntry.weight = splitVal;

            parsedParticipants.push(pEntry);
          }
        }

        // Validate self-payment
        if (payerUser && parsedParticipants.length === 1 && parsedParticipants[0].userId === payerUser.id) {
          rowAnomalies.push({ code: "SELF_PAYMENT", message: "Payer is splitting the expense solely with themselves", severity: "ERROR" });
        }
      }

      // Check split totals and splits logic if no critical errors so far
      const hasErrors = rowAnomalies.some(a => a.severity === "ERROR");
      let computedParticipants = [];

      if (!hasErrors && payerUser && splitMethod && parsedParticipants.length > 0) {
        try {
          computedParticipants = calculateParticipantAmounts(finalAmount, splitMethod, parsedParticipants);
        } catch (err) {
          rowAnomalies.push({
            code: "SPLIT_MISMATCH",
            message: err.message || "Split amount allocation failed",
            severity: "ERROR",
          });
        }
      }

      // Validate duplicate/conflict anomalies contextually against DB or current import batch
      if (!hasErrors && payerUser) {
        // Find exact duplicates: same description, payer, amount, date
        const isDbDuplicate = existingExpenses.some(e => 
          e.description.toLowerCase() === description.trim().toLowerCase() &&
          e.paidById === payerUser.id &&
          parseFloat(e.amount).toFixed(4) === parseFloat(finalAmount).toFixed(4) &&
          e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10)
        );
        const isBatchDuplicate = expensesToCreate.some(e =>
          e.description.toLowerCase() === description.trim().toLowerCase() &&
          e.paidById === payerUser.id &&
          parseFloat(e.amount).toFixed(4) === parseFloat(finalAmount).toFixed(4) &&
          e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10)
        );

        if (isDbDuplicate || isBatchDuplicate) {
          rowAnomalies.push({
            code: "DUPLICATE_EXPENSE",
            message: `Exact duplicate of this expense already exists: ${description}`,
            severity: "ERROR",
          });
        } else {
          // Find conflicting duplicates: same description, payer, date, but different amount
          const isDbConflict = existingExpenses.some(e => 
            e.description.toLowerCase() === description.trim().toLowerCase() &&
            e.paidById === payerUser.id &&
            e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10) &&
            parseFloat(e.amount).toFixed(4) !== parseFloat(finalAmount).toFixed(4)
          );
          const isBatchConflict = expensesToCreate.some(e =>
            e.description.toLowerCase() === description.trim().toLowerCase() &&
            e.paidById === payerUser.id &&
            e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10) &&
            parseFloat(e.amount).toFixed(4) !== parseFloat(finalAmount).toFixed(4)
          );

          if (isDbConflict || isBatchConflict) {
            rowAnomalies.push({
              code: "CONFLICTING_DUPLICATE",
              message: `Conflicting duplicate with different amount: ${description}`,
              severity: "WARNING",
            });
          }
        }

        // Settlement disguised as expense check
        const descLower = description.toLowerCase();
        const isSettlementKeyword = ["settle", "settlement", "repayment", "transfer", "payback"].some(kw => descLower.includes(kw));
        
        // Or if it's EXACT split with 1 participant who is NOT the payer, and amount matches
        const isDisguisedSettlement = isSettlementKeyword || (
          parsedParticipants.length === 1 &&
          parsedParticipants[0].userId !== payerUser.id &&
          splitMethod === "EXACT" &&
          parseFloat(parsedParticipants[0].amount) === parseFloat(finalAmount)
        );

        if (isDisguisedSettlement) {
          rowAnomalies.push({
            code: "SETTLEMENT_DISGUISED_AS_EXPENSE",
            message: `Expense looks like a settlement: ${description}`,
            severity: "WARNING",
          });
        }
      }

      // 6. Save anomalies and record success/failure
      const rowHasErrors = rowAnomalies.some(a => a.severity === "ERROR");

      // Log all row anomalies (both warnings and errors)
      for (const anomaly of rowAnomalies) {
        anomaliesToCreate.push({
          importId: importRecord.id,
          rowNumber: rowNum,
          code: anomaly.code,
          message: anomaly.message,
          severity: anomaly.severity,
          rawData,
        });
      }

      if (rowHasErrors) {
        anomalousRows++;
      } else {
        // Stage expense creation
        expensesToCreate.push({
          groupId,
          createdById: importedById,
          paidById: payerUser.id,
          description: description.trim(),
          amount: finalAmount,
          currency: "USD", // everything normalized to USD
          splitMethod,
          expenseDate,
          importId: importRecord.id,
          participants: computedParticipants,
        });
        importedRows++;
      }
    }

    // 7. Write to database using transaction
    await prisma.$transaction(async (tx) => {
      // Create all valid expenses
      for (const exp of expensesToCreate) {
        const { participants, ...expenseData } = exp;
        await tx.expense.create({
          data: {
            ...expenseData,
            participants: {
              create: participants.map(p => ({
                userId: p.userId,
                amount: p.amount,
              })),
            },
          },
        });
      }

      // Create all anomalies
      if (anomaliesToCreate.length > 0) {
        await tx.importAnomaly.createMany({
          data: anomaliesToCreate,
        });
      }

      // Update Import status and statistics
      const status = anomalousRows > 0
        ? (importedRows === 0 ? "FAILED" : "COMPLETED_WITH_ANOMALIES")
        : "COMPLETED";

      await tx.import.update({
        where: { id: importRecord.id },
        data: {
          status,
          totalRows,
          importedRows,
          anomalousRows,
          completedAt: new Date(),
        },
      });
    });

  } catch (error) {
    // If anything critical crashes, update Import record to FAILED
    console.error("CSV Import Engine crashed:", error);
    await prisma.import.update({
      where: { id: importRecord.id },
      data: {
        status: "FAILED",
        totalRows,
        importedRows,
        anomalousRows,
        completedAt: new Date(),
      },
    }).catch(console.error);

    throw error;
  }

  // Retrieve and return final report
  return prisma.import.findUnique({
    where: { id: importRecord.id },
    include: {
      anomalies: { orderBy: { rowNumber: "asc" } },
    },
  });
}

export async function listImports(groupId, userId) {
  await requireActiveMember(groupId, userId);

  return prisma.import.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getImportReport(groupId, importId, userId) {
  await requireActiveMember(groupId, userId);

  const importReport = await prisma.import.findFirst({
    where: { id: importId, groupId },
    include: {
      anomalies: { orderBy: { rowNumber: "asc" } },
    },
  });

  if (!importReport) {
    throw new AppError("Import report not found", 404);
  }

  return importReport;
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
