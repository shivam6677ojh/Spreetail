import crypto from "crypto";
import { parse } from "csv-parse/sync";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { convertToUSD, isSupportedCurrency } from "../../utils/currency.js";
import { calculateParticipantAmounts } from "../expenses/split-calculator.js";

const KNOWN_FLATMATES = new Set(["aisha", "rohan", "priya", "meera", "dev", "sam", "kabir", "priya s", "dev's friend kabir"]);

// Helper to resolve if user is one of the known flatmates
function isKnownFlatmate(rawNameOrEmail) {
  if (!rawNameOrEmail) return false;
  let cleaned = rawNameOrEmail.trim().toLowerCase();
  if (cleaned.includes("@")) {
    cleaned = cleaned.split("@")[0].trim();
  }
  return KNOWN_FLATMATES.has(cleaned) || [...KNOWN_FLATMATES].some(f => cleaned.includes(f));
}

// Helper to resolve row values case-insensitively with fallback keys
const getRowValue = (row, keys) => {
  for (const k of keys) {
    const normalizedKey = k.toLowerCase().replace(/[\s_]+/g, '');
    for (const rowKey in row) {
      const normalizedRowKey = rowKey.toLowerCase().replace(/[\s_]+/g, '');
      if (normalizedRowKey === normalizedKey) {
        return row[rowKey];
      }
    }
  }
  return undefined;
};

// Helper to normalize and map names to flatmate profiles
function resolveMemberName(rawName) {
  if (!rawName) return "";
  let cleaned = rawName.trim().toLowerCase();
  
  // If email was provided, extract the prefix
  if (cleaned.includes("@")) {
    cleaned = cleaned.split("@")[0].trim();
  }

  // Typos and exact mappings for flatmates
  if (cleaned === "priya s" || cleaned === "priya") return "Priya";
  if (cleaned === "rohan" || cleaned === "rohan ") return "Rohan";
  if (cleaned === "aisha") return "Aisha";
  if (cleaned === "meera") return "Meera";
  if (cleaned === "dev") return "Dev";
  if (cleaned === "sam") return "Sam";
  if (cleaned.includes("kabir")) return "Kabir";

  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Helper to get or create a user and their membership
async function getOrCreateUserAndMember(tx, groupId, rawNameOrEmail) {
  const name = resolveMemberName(rawNameOrEmail);
  let email = rawNameOrEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    email = `${name.toLowerCase()}@example.com`;
  }

  // Try to find user by email first
  let user = await tx.user.findUnique({
    where: { email },
  });

  // Try to find user by name
  if (!user) {
    user = await tx.user.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
  }

  // Auto-create user if not found
  if (!user) {
    user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: "$2b$10$vI8Y6Dk3/43QzUp3d7K9.OxjQ0fS0k5T8eDk9GgG.r6UfW.K0607m", // bcrypt for "password123"
      },
    });
  }

  // Check group membership
  let member = await tx.groupMember.findFirst({
    where: { groupId, userId: user.id },
  });

  // Assign timeline dates as per assignment rules (UTC to avoid timezone shifts)
  let joinedAt = new Date(Date.UTC(2026, 1, 1)); // Feb 1
  let leftAt = null;

  if (name === "Meera") {
    leftAt = new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999)); // March 31
  } else if (name === "Sam") {
    joinedAt = new Date(Date.UTC(2026, 3, 15)); // April 15
  } else if (name === "Kabir") {
    joinedAt = new Date(Date.UTC(2026, 2, 11)); // March 11
  }

  if (!member) {
    member = await tx.groupMember.create({
      data: {
        groupId,
        userId: user.id,
        joinedAt,
        leftAt,
        role: "MEMBER",
      },
    });
  } else {
    // Sync dates in case membership exists but had default values
    member = await tx.groupMember.update({
      where: { id: member.id },
      data: { joinedAt, leftAt },
    });
  }

  return { user, member };
}

// Multi-format date parser - Prioritizes regex matching to prevent JS Date constructor ambiguities
function parseDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.trim();

  // 1. Match DD/MM/YYYY explicitly (common in our CSV: e.g. 01/03/2026)
  const slashRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const slashMatch = s.match(slashRegex);
  if (slashMatch) {
    const day = parseInt(slashMatch[1]);
    const month = parseInt(slashMatch[2]) - 1;
    const year = parseInt(slashMatch[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) {
      return { date: d, format: "dd/mm/yyyy", cleaned: true };
    }
  }

  // 2. Match month abbreviation, e.g. "Mar-14" or "Mar 14"
  const monthNames = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  const monthRegex = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[- ]?(\d+)(?:[- ]?(\d{4}))?$/i;
  const monthMatch = s.match(monthRegex);
  if (monthMatch) {
    const month = monthNames[monthMatch[1].toLowerCase()];
    const day = parseInt(monthMatch[2]);
    const year = monthMatch[3] ? parseInt(monthMatch[3]) : 2026;
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) {
      return { date: d, format: "month-day", cleaned: true };
    }
  }

  // 3. Match YYYY-MM-DD (e.g. 2026-02-01)
  const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  const ymdMatch = s.match(ymdRegex);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1]);
    const month = parseInt(ymdMatch[2]) - 1;
    const day = parseInt(ymdMatch[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) {
      return { date: d, format: "yyyy-mm-dd" };
    }
  }

  // Fallback to standard Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    // Force to UTC midnight to avoid local timezone shifts
    const utcDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    return { date: utcDate, format: "standard" };
  }

  return null;
}

// Helper to parse split details string
function parseSplitDetails(splitDetailsStr) {
  if (!splitDetailsStr || splitDetailsStr.trim() === "") return {};
  const parts = splitDetailsStr.split(";").map(p => p.trim());
  const parsed = {};

  for (const part of parts) {
    if (!part) continue;
    const match = part.match(/^(.+?)\s+([\d\.\-]+)%?$/);
    if (match) {
      const rawName = match[1].trim();
      const val = parseFloat(match[2]);
      const resolved = resolveMemberName(rawName);
      parsed[resolved.toLowerCase()] = val;
    }
  }

  return parsed;
}

export async function createImport(groupId, importedById, csvText, fileName) {
  await requireActiveMember(groupId, importedById);

  if (!csvText || csvText.trim() === "") {
    throw new AppError("Empty CSV file provided", 400);
  }

  // Check duplicate imports
  const fileHash = crypto.createHash("sha256").update(csvText).digest("hex");
  const existingImport = await prisma.import.findFirst({
    where: { groupId, fileHash },
  });

  if (existingImport) {
    throw new AppError("Duplicate import: this file has already been imported for this group", 409);
  }

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
  const settlementsToCreate = [];

  try {
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    totalRows = rows.length;

    if (totalRows === 0) {
      throw new AppError("No data rows found in the CSV file", 400);
    }

    // --- PRE-STEP SCAN FOR USER AUTO-PROVISIONING ---
    const whitelistedNamesToProvision = new Set();
    for (const row of rows) {
      const payer = getRowValue(row, ["payer_email", "paid_by", "paidby"]);
      if (payer && payer.trim() !== "" && isKnownFlatmate(payer)) {
        whitelistedNamesToProvision.add(resolveMemberName(payer));
      }

      const participantsStr = getRowValue(row, ["participants", "split_with", "splitwith"]);
      if (participantsStr) {
        const parts = participantsStr.split(";").map(p => p.trim()).filter(Boolean);
        for (const p of parts) {
          let name = p;
          if (p.includes(":")) {
            name = p.split(":")[0].trim();
          }
          if (isKnownFlatmate(name)) {
            whitelistedNamesToProvision.add(resolveMemberName(name));
          }
        }
      }
    }

    // Auto-provision whitelisted flatmates directly on main prisma client
    if (whitelistedNamesToProvision.size > 0) {
      for (const name of whitelistedNamesToProvision) {
        await getOrCreateUserAndMember(prisma, groupId, name);
      }
    }

    // Now load ALL group members and users from DB to build complete lookup maps!
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, name: true },
    });

    // Maps for lookups
    const memberMap = {}; // key: name (lowercased) or email (lowercased) -> member
    const userMap = {};   // key: name (lowercased) or email (lowercased) -> user

    for (const m of groupMembers) {
      const nameKey = m.user.name.toLowerCase();
      const emailKey = m.user.email.toLowerCase();
      memberMap[nameKey] = m;
      memberMap[emailKey] = m;
      userMap[nameKey] = m.user;
      userMap[emailKey] = m.user;
    }

    const userEmailMap = {};
    for (const u of allUsers) {
      userEmailMap[u.email.toLowerCase()] = u;
    }

    // Add alias mappings
    if (memberMap["priya"]) {
      memberMap["priya s"] = memberMap["priya"];
      userMap["priya s"] = userMap["priya"];
    }

    // Load existing expenses to detect duplicates
    const existingExpenses = await prisma.expense.findMany({
      where: { groupId },
      include: { participants: true, paidBy: true },
    });

    // --- ROW PROCESSING ---
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const row = rows[i];
      const rowAnomalies = [];
      const rawData = JSON.stringify(row);

      // Validate required columns
      const hasDate = getRowValue(row, ["date"]) !== undefined;
      const hasDesc = getRowValue(row, ["description"]) !== undefined;
      const hasAmount = getRowValue(row, ["amount"]) !== undefined;

      if (!hasDate || !hasDesc || !hasAmount) {
        anomaliesToCreate.push({
          importId: importRecord.id,
          rowNumber: rowNum,
          code: "MALFORMED_ROW",
          message: "Missing key columns (date, description, or amount)",
          severity: "ERROR",
          rawData,
        });
        anomalousRows++;
        continue;
      }

      const rawDate = getRowValue(row, ["date"]);
      const rawDesc = getRowValue(row, ["description"]);
      const rawAmount = getRowValue(row, ["amount"]);
      const rawCurrency = getRowValue(row, ["currency"]);
      const rawPaidBy = getRowValue(row, ["payer_email", "paid_by", "paidby"]);
      const rawSplitType = getRowValue(row, ["split_method", "split_type", "splittype"]);
      const rawSplitWith = getRowValue(row, ["participants", "split_with", "splitwith"]);
      const rawSplitDetails = getRowValue(row, ["split_details", "split_detail", "splitdetails"]);
      const rawNotes = getRowValue(row, ["notes"]);

      // 1. Validate Description
      if (!rawDesc || rawDesc.trim() === "") {
        rowAnomalies.push({ code: "BLANK_DESCRIPTION", message: "Expense description is blank", severity: "ERROR" });
      }

      // 2. Validate Amount
      const cleanedAmountStr = String(rawAmount || "").replace(/["\s,]+/g, "");
      const parsedAmount = parseFloat(cleanedAmountStr);
      if (isNaN(parsedAmount)) {
        rowAnomalies.push({ code: "MALFORMED_ROW", message: "Amount is not a valid number", severity: "ERROR" });
      } else if (parsedAmount === 0) {
        rowAnomalies.push({ code: "ZERO_AMOUNT", message: "Expense amount is zero; skipping row", severity: "ERROR" });
      }

      // 3. Validate Date
      const parsedDateResult = parseDate(rawDate);
      let expenseDate = null;
      if (!parsedDateResult) {
        rowAnomalies.push({ code: "INVALID_DATE", message: `Invalid date format: ${rawDate}`, severity: "ERROR" });
      } else {
        expenseDate = parsedDateResult.date;
        if (expenseDate > new Date()) {
          rowAnomalies.push({ code: "FUTURE_DATE", message: `Date is in the future: ${rawDate}`, severity: "ERROR" });
        }
        if (parsedDateResult.cleaned) {
          rowAnomalies.push({
            code: "DATE_FORMAT_CLEANED",
            message: `Parsed date "${rawDate}" using format "${parsedDateResult.format}"`,
            severity: "WARNING"
          });
        }
        // Check ambiguity
        const parts = String(rawDate).split(/[\/\-]/);
        if (parts.length === 3) {
          const p1 = parseInt(parts[0]);
          const p2 = parseInt(parts[1]);
          if (p1 <= 12 && p2 <= 12) {
            rowAnomalies.push({
              code: "AMBIGUOUS_DATE_FORMAT",
              message: `Ambiguous date format "${rawDate}"; parsed as ${expenseDate.toLocaleDateString()}`,
              severity: "WARNING"
            });
          }
        }
      }

      // 4. Resolve Payer
      let payerUser = null;
      let payerMember = null;
      if (!rawPaidBy || rawPaidBy.trim() === "") {
        // Missing Payer -> assign to importer
        payerUser = await prisma.user.findUnique({ where: { id: importedById } });
        payerMember = memberMap[resolveMemberName(payerUser.name).toLowerCase()];
        rowAnomalies.push({
          code: "MISSING_PAYER_ASSIGNED_TO_IMPORTER",
          message: `Missing payer; assigned to importer "${payerUser.name}"`,
          severity: "WARNING"
        });
      } else {
        const payerKey = rawPaidBy.trim().toLowerCase();
        payerUser = userMap[payerKey] || userMap[resolveMemberName(rawPaidBy).toLowerCase()];
        payerMember = memberMap[payerKey] || memberMap[resolveMemberName(rawPaidBy).toLowerCase()];

        if (!payerMember) {
          rowAnomalies.push({
            code: "UNKNOWN_USER",
            message: `Payer "${rawPaidBy}" is not registered/member of this group`,
            severity: "ERROR"
          });
        } else {
          // Check payer timeline
          if (expenseDate) {
            if (payerMember.joinedAt > expenseDate) {
              rowAnomalies.push({
                code: "PAYER_NOT_IN_GROUP",
                message: `Payer "${payerUser.name}" was not in the group on ${expenseDate?.toISOString().slice(0, 10)} (joined ${payerMember.joinedAt.toISOString().slice(0, 10)})`,
                severity: "ERROR"
              });
            } else if (payerMember.leftAt && payerMember.leftAt < expenseDate) {
              rowAnomalies.push({
                code: "PAYER_NOT_IN_GROUP",
                message: `Payer "${payerUser.name}" left the group on ${payerMember.leftAt.toISOString().slice(0, 10)} which is before the expense date`,
                severity: "ERROR"
              });
            }
          }
        }
      }

      // 5. Currency
      let finalCurrency = rawCurrency ? rawCurrency.trim().toUpperCase() : "";
      let finalAmountStr = cleanedAmountStr;
      let finalAmountNum = parsedAmount;

      if (!finalCurrency || finalCurrency === "") {
        finalCurrency = "INR";
        rowAnomalies.push({
          code: "MISSING_CURRENCY_DEFAULTED",
          message: "Missing currency code; defaulted to INR",
          severity: "WARNING"
        });
      }

      if (finalCurrency !== "USD" && finalCurrency !== "INR") {
        if (!isSupportedCurrency(finalCurrency)) {
          rowAnomalies.push({
            code: "INVALID_CURRENCY",
            message: `Unsupported currency: ${finalCurrency}`,
            severity: "ERROR"
          });
        } else {
          const conversion = convertToUSD(parsedAmount, finalCurrency);
          if (conversion) {
            finalAmountNum = parseFloat(conversion.amountUSD);
            finalAmountStr = conversion.amountUSD;
            finalCurrency = "USD";
            rowAnomalies.push({
              code: "CURRENCY_CONVERSION",
              message: `Converted ${parsedAmount} ${rawCurrency} to ${finalAmountStr} USD (Rate: ${conversion.rate})`,
              severity: "WARNING",
            });
          }
        }
      }

      // 6. Fractional amounts check
      if (!isNaN(parsedAmount)) {
        const decimals = String(parsedAmount).split(".")[1];
        if (decimals && decimals.length > 2) {
          finalAmountNum = Math.round(finalAmountNum * 100) / 100;
          finalAmountStr = finalAmountNum.toFixed(4);
          rowAnomalies.push({
            code: "FRACTIONAL_CENT_ROUNDED",
            message: `Amount ${parsedAmount} contains fractions of cent/paisa; rounded to ${finalAmountStr}`,
            severity: "WARNING"
          });
        }
      }

      // 7. Negative amount -> Refund check
      let isRefund = false;
      if (parsedAmount < 0) {
        isRefund = true;
        rowAnomalies.push({
          code: "NEGATIVE_AMOUNT_TREATED_AS_REFUND",
          message: `Negative amount ${parsedAmount} treated as a refund/credit`,
          severity: "WARNING"
        });
      }

      const hasErrorsSoFar = rowAnomalies.some(a => a.severity === "ERROR");

      // 8. Settlement Disguised as Expense Detection
      const descLower = String(rawDesc || "").toLowerCase();
      const isSettlementKeyword = ["settle", "settlement", "repayment", "transfer", "payback", "deposit", "paid aisha back", "paid rohan back", "paid sam back", "paid priya back", "paid meera back", "paid dev back"].some(kw => descLower.includes(kw));
      const hasOneSplitParticipant = rawSplitWith && rawSplitWith.split(";").map(p => p.trim()).filter(Boolean).length === 1;

      const isDisguisedSettlement = !hasErrorsSoFar && (
        isSettlementKeyword || 
        (!rawSplitType && hasOneSplitParticipant) ||
        (rawSplitType === "" && hasOneSplitParticipant)
      );

      if (isDisguisedSettlement && payerUser) {
        // Import directly as a Settlement instead of Expense
        const recipientName = rawSplitWith ? rawSplitWith.split(";")[0].trim() : "";
        const recipientKey = recipientName.trim().toLowerCase();
        const recipientUser = userMap[recipientKey] || userMap[resolveMemberName(recipientName).toLowerCase()];
        const recipientMember = memberMap[recipientKey] || memberMap[resolveMemberName(recipientName).toLowerCase()];

        if (!recipientMember) {
          rowAnomalies.push({
            code: "UNKNOWN_USER",
            message: `Settlement recipient "${recipientName}" is not registered/member of this group`,
            severity: "ERROR"
          });
        } else {
          rowAnomalies.push({
            code: "SETTLEMENT_DISGUISED_AS_EXPENSE",
            message: `Row imported as Settlement: "${rawDesc}"`,
            severity: "WARNING"
          });

          // Save settlement instead
          settlementsToCreate.push({
            id: crypto.randomUUID(),
            groupId,
            paidById: payerUser.id,
            paidToId: recipientUser.id,
            recordedById: importedById,
            importId: importRecord.id,
            amount: Math.abs(finalAmountNum),
            currency: finalCurrency,
            settledAt: expenseDate,
            notes: `Imported Settlement: ${rawDesc}`
          });

          importedRows++;
          
          // Log row anomalies
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
          continue; // Done with this row!
        }
      }

      // 9. Standard Expense split calculation
      let splitMethod = "EQUAL";
      const rawSplitTypeClean = String(rawSplitType || "").trim().toLowerCase();
      if (rawSplitTypeClean === "unequal") {
        splitMethod = "EXACT";
        rowAnomalies.push({
          code: "UNUSUAL_SPLIT_METHOD",
          message: `Mapped split type "unequal" to EXACT method`,
          severity: "WARNING"
        });
      } else if (rawSplitTypeClean === "share") {
        splitMethod = "CUSTOM";
        rowAnomalies.push({
          code: "UNUSUAL_SPLIT_METHOD",
          message: `Mapped split type "share" to CUSTOM weights method`,
          severity: "WARNING"
        });
      } else if (rawSplitTypeClean === "percentage") {
        splitMethod = "PERCENTAGE";
      } else if (rawSplitTypeClean === "custom") {
        splitMethod = "CUSTOM";
      } else if (rawSplitTypeClean === "equal") {
        splitMethod = "EQUAL";
      }

      // Resolve participants list
      const rawParticipantParts = rawSplitWith ? rawSplitWith.split(";").map(p => p.trim()).filter(Boolean) : [];
      let participants = [];

      for (const p of rawParticipantParts) {
        let pName = p;
        let pValue = null;
        if (p.includes(":")) {
          const idx = p.indexOf(":");
          pName = p.slice(0, idx).trim();
          pValue = p.slice(idx + 1).trim();
        }

        const pKey = pName.trim().toLowerCase();
        const pUser = userMap[pKey] || userMap[resolveMemberName(pName).toLowerCase()];
        const pMember = memberMap[pKey] || memberMap[resolveMemberName(pName).toLowerCase()];

        if (!pMember) {
          rowAnomalies.push({
            code: "UNKNOWN_USER",
            message: `Participant "${pName}" is not registered/member of this group`,
            severity: "ERROR"
          });
        } else {
          // Check join/leave timeline
          let isTimelineValid = true;
          if (expenseDate) {
            if (pMember.joinedAt > expenseDate) {
              isTimelineValid = false;
              rowAnomalies.push({
                code: "PARTICIPANT_NOT_IN_GROUP",
                message: `Participant "${pUser.name}" was not in the group on ${expenseDate?.toISOString().slice(0, 10)} (joined ${pMember.joinedAt.toISOString().slice(0, 10)})`,
                severity: "WARNING" // Warning because we will exclude them
              });
            } else if (pMember.leftAt && pMember.leftAt < expenseDate) {
              isTimelineValid = false;
              rowAnomalies.push({
                code: "PARTICIPANT_NOT_IN_GROUP",
                message: `Participant "${pUser.name}" had left the group on ${pMember.leftAt.toISOString().slice(0, 10)} which is before the expense date`,
                severity: "WARNING" // Warning because we will exclude them
              });
            }
          }

          if (isTimelineValid) {
            const pObj = { userId: pUser.id, name: pUser.name, email: pUser.email };
            if (pValue !== null) {
              if (splitMethod === "EXACT") pObj.amount = pValue;
              else if (splitMethod === "PERCENTAGE") pObj.percentage = pValue;
              else if (splitMethod === "CUSTOM") pObj.weight = pValue;
            }
            participants.push(pObj);
          }
        }
      }

      // Check self payment
      if (payerUser && participants.length === 1 && participants[0].userId === payerUser.id) {
        rowAnomalies.push({
          code: "SELF_PAYMENT",
          message: `Payer "${payerUser.name}" is the only participant in the split`,
          severity: "ERROR"
        });
      }

      // Parse split details if any
      const splitDetailsMap = parseSplitDetails(rawSplitDetails);
      let computedParticipants = [];

      const hasErrors = rowAnomalies.some(a => a.severity === "ERROR");

      if (!hasErrors && payerUser && participants.length > 0) {
        // Inject values from split_details if not already loaded from inline format
        for (const p of participants) {
          const lowerName = p.name.toLowerCase();
          const detailVal = splitDetailsMap[lowerName];
          if (detailVal !== undefined) {
            if (splitMethod === "EXACT") p.amount = detailVal;
            else if (splitMethod === "PERCENTAGE") p.percentage = detailVal;
            else if (splitMethod === "CUSTOM") p.weight = detailVal;
          }
        }

        // Remainder auto-allocation
        if (splitMethod === "EXACT") {
          const missingCount = participants.filter(p => p.amount === undefined || p.amount === null).length;
          if (missingCount === 1) {
            const missing = participants.find(p => p.amount === undefined || p.amount === null);
            const sumSpecified = participants
              .filter(p => p.amount !== undefined && p.amount !== null)
              .reduce((s, p) => s + parseFloat(p.amount), 0);
            missing.amount = finalAmountNum - sumSpecified;
            rowAnomalies.push({
              code: "REMAINDER_AUTO_ALLOCATED",
              message: `Auto-allocated exact remainder ${missing.amount} to "${missing.name}"`,
              severity: "WARNING"
            });
          }
        } else if (splitMethod === "PERCENTAGE") {
          const missingCount = participants.filter(p => p.percentage === undefined || p.percentage === null).length;
          if (missingCount === 1) {
            const missing = participants.find(p => p.percentage === undefined || p.percentage === null);
            const sumSpecified = participants
              .filter(p => p.percentage !== undefined && p.percentage !== null)
              .reduce((s, p) => s + parseFloat(p.percentage), 0);
            missing.percentage = 100 - sumSpecified;
            rowAnomalies.push({
              code: "REMAINDER_AUTO_ALLOCATED",
              message: `Auto-allocated percentage remainder ${missing.percentage}% to "${missing.name}"`,
              severity: "WARNING"
            });
          }

          // Row 15 handles 110% sum mismatch re-scaling
          const percentageSum = participants.reduce((s, p) => s + parseFloat(p.percentage || 0), 0);
          if (percentageSum > 0 && Math.abs(percentageSum - 100) > 0.01) {
            // Re-scale percentages so they total exactly 100, absorbing remainder on last participant
            let allocatedPercentage = 0;
            for (let k = 0; k < participants.length; k++) {
              const p = participants[k];
              const isLast = k === participants.length - 1;
              const prev = parseFloat(p.percentage || 0);
              const percentage = isLast ? (100 - allocatedPercentage) : Math.round((prev / percentageSum) * 1000000) / 10000;
              p.percentage = percentage.toFixed(4);
              allocatedPercentage += percentage;
            }
            rowAnomalies.push({
              code: "SPLIT_MISMATCH_RESCALED",
              message: `Percentages totaled ${percentageSum}% instead of 100%. Re-scaled weights to sum to 100%`,
              severity: "WARNING"
            });
          }
        } else if (splitMethod === "CUSTOM") {
          // Default missing weights to 1
          for (const p of participants) {
            if (p.weight === undefined || p.weight === null) {
              p.weight = 1;
            }
          }
        }

        try {
          computedParticipants = calculateParticipantAmounts(finalAmountStr, splitMethod, participants);
        } catch (err) {
          rowAnomalies.push({
            code: "SPLIT_MISMATCH",
            message: err.message || "Split amount allocation failed",
            severity: "ERROR"
          });
        }
      }

      // Duplicate/Conflict check
      if (!hasErrors && payerUser && expenseDate) {
        const isDbDuplicate = existingExpenses.some(e =>
          e.description.toLowerCase() === rawDesc.trim().toLowerCase() &&
          e.paidById === payerUser.id &&
          Math.abs(parseFloat(e.amount) - finalAmountNum) < 0.001 &&
          (e.currency || "USD") === finalCurrency &&
          e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10)
        );
        const isBatchDuplicate = expensesToCreate.some(e =>
          e.description.toLowerCase() === rawDesc.trim().toLowerCase() &&
          e.paidById === payerUser.id &&
          Math.abs(parseFloat(e.amount) - finalAmountNum) < 0.001 &&
          (e.currency || "USD") === finalCurrency &&
          e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10)
        );

        if (isDbDuplicate || isBatchDuplicate) {
          rowAnomalies.push({
            code: "DUPLICATE_EXPENSE",
            message: `Exact duplicate of this expense already exists: ${rawDesc}`,
            severity: "ERROR"
          });
        } else {
          const isDbConflict = existingExpenses.some(e =>
            e.description.toLowerCase() === rawDesc.trim().toLowerCase() &&
            e.paidById === payerUser.id &&
            e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10) &&
            Math.abs(parseFloat(e.amount) - finalAmountNum) >= 0.001
          );
          const isBatchConflict = expensesToCreate.some(e =>
            e.description.toLowerCase() === rawDesc.trim().toLowerCase() &&
            e.paidById === payerUser.id &&
            e.expenseDate.toISOString().slice(0, 10) === expenseDate.toISOString().slice(0, 10) &&
            Math.abs(parseFloat(e.amount) - finalAmountNum) >= 0.001
          );

          if (isDbConflict || isBatchConflict) {
            rowAnomalies.push({
              code: "CONFLICTING_DUPLICATE",
              message: `Conflicting duplicate with different amount: ${rawDesc}`,
              severity: "WARNING"
            });
          }
        }
      }

      // Record final anomalies & stage database operations
      const rowHasErrors = rowAnomalies.some(a => a.severity === "ERROR");

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
        const expenseId = crypto.randomUUID();
        expensesToCreate.push({
          id: expenseId,
          groupId,
          createdById: importedById,
          paidById: payerUser.id,
          description: rawDesc.trim(),
          amount: finalAmountStr,
          currency: finalCurrency,
          splitMethod,
          expenseDate,
          importId: importRecord.id,
          notes: rawNotes ? rawNotes.trim() : null,
          participants: computedParticipants,
        });
        importedRows++;
      }
    }

    // Write all database changes in a single transaction
    await prisma.$transaction(async (tx) => {
      // 1. Create expenses
      if (expensesToCreate.length > 0) {
        const expenseRows = expensesToCreate.map(({ participants, ...expenseData }) => expenseData);
        await tx.expense.createMany({
          data: expenseRows,
        });

        // 2. Create expense participants
        const participantRows = [];
        for (const exp of expensesToCreate) {
          for (const p of exp.participants) {
            participantRows.push({
              expenseId: exp.id,
              userId: p.userId,
              amount: p.amount,
            });
          }
        }

        if (participantRows.length > 0) {
          await tx.expenseParticipant.createMany({
            data: participantRows,
          });
        }
      }

      // 3. Create settlements
      if (settlementsToCreate.length > 0) {
        await tx.settlement.createMany({
          data: settlementsToCreate,
        });
      }

      // 4. Create anomalies
      if (anomaliesToCreate.length > 0) {
        await tx.importAnomaly.createMany({
          data: anomaliesToCreate,
        });
      }

      // 5. Update import status
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

export async function deleteImport(groupId, importId, userId) {
  await requireActiveMember(groupId, userId);

  const importRecord = await prisma.import.findFirst({
    where: { id: importId, groupId },
  });

  if (!importRecord) {
    throw new AppError("Import report not found", 404);
  }

  // Delete all expenses created by this import
  await prisma.expense.deleteMany({
    where: { importId },
  });

  // Delete all settlements created by this import
  await prisma.settlement.deleteMany({
    where: { importId },
  });

  // Delete the import record itself
  await prisma.import.delete({
    where: { id: importId },
  });

  return { id: importId };
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
