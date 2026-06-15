import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";

export async function calculateGroupBalances(groupId, userId) {
  // 1. Ensure requesting user is a member of the group
  await requireGroupMember(groupId, userId);

  // 2. Fetch members, expenses, and settlements
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: { participants: true },
  });

  const settlements = await prisma.settlement.findMany({
    where: { groupId },
  });

  // Find all unique currencies across expenses and settlements
  const currencies = [...new Set([
    ...expenses.map(e => e.currency || "USD"),
    ...settlements.map(s => s.currency || "USD")
  ])];
  if (currencies.length === 0) {
    currencies.push("USD");
  }

  const result = {};

  for (const currency of currencies) {
    // Initialize balances map
    const balancesMap = {};
    for (const member of members) {
      balancesMap[member.userId] = {
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        joinedAt: member.joinedAt,
        leftAt: member.leftAt,
        totalPaid: new Prisma.Decimal(0),
        totalOwed: new Prisma.Decimal(0),
        settlementsPaid: new Prisma.Decimal(0),
        settlementsReceived: new Prisma.Decimal(0),
      };
    }

    const currencyExpenses = expenses.filter(e => (e.currency || "USD") === currency);
    const currencySettlements = settlements.filter(s => (s.currency || "USD") === currency);

    // Calculate total spent and owed from expenses
    let totalSpending = new Prisma.Decimal(0);
    for (const expense of currencyExpenses) {
      const amount = new Prisma.Decimal(expense.amount);
      totalSpending = totalSpending.plus(amount);

      // Add paid amount to payer if they are in balancesMap
      if (balancesMap[expense.paidById]) {
        balancesMap[expense.paidById].totalPaid = balancesMap[expense.paidById].totalPaid.plus(amount);
      }

      // Add owed shares to participants
      for (const participant of expense.participants) {
        if (balancesMap[participant.userId]) {
          const pAmount = new Prisma.Decimal(participant.amount);
          balancesMap[participant.userId].totalOwed = balancesMap[participant.userId].totalOwed.plus(pAmount);
        }
      }
    }

    // Calculate settlements paid and received
    for (const settlement of currencySettlements) {
      const amount = new Prisma.Decimal(settlement.amount);

      if (balancesMap[settlement.paidById]) {
        balancesMap[settlement.paidById].settlementsPaid = balancesMap[settlement.paidById].settlementsPaid.plus(amount);
      }

      if (balancesMap[settlement.paidToId]) {
        balancesMap[settlement.paidToId].settlementsReceived = balancesMap[settlement.paidToId].settlementsReceived.plus(amount);
      }
    }

    // Calculate net balance for each user
    const memberBalances = [];
    for (const uId in balancesMap) {
      const userBal = balancesMap[uId];
      const netBalance = userBal.totalPaid
        .minus(userBal.totalOwed)
        .plus(userBal.settlementsPaid)
        .minus(userBal.settlementsReceived);

      userBal.netBalance = netBalance;
      memberBalances.push(userBal);
    }

    // Compute minimized transfers (Who pays whom)
    const debtors = [];
    const creditors = [];

    for (const mb of memberBalances) {
      if (mb.netBalance.lessThan(-0.0001)) {
        debtors.push({
          userId: mb.userId,
          name: mb.name,
          email: mb.email,
          balance: mb.netBalance,
        });
      } else if (mb.netBalance.greaterThan(0.0001)) {
        creditors.push({
          userId: mb.userId,
          name: mb.name,
          email: mb.email,
          balance: mb.netBalance,
        });
      }
    }

    const transfers = [];

    while (debtors.length > 0 && creditors.length > 0) {
      debtors.sort((a, b) => a.balance.comparedTo(b.balance)); // most negative first
      creditors.sort((a, b) => b.balance.comparedTo(a.balance)); // most positive first

      const debtor = debtors[0];
      const creditor = creditors[0];

      const debtVal = debtor.balance.negated();
      const creditVal = creditor.balance;

      const transferAmount = Prisma.Decimal.min(debtVal, creditVal);

      transfers.push({
        from: debtor.userId,
        fromName: debtor.name,
        fromEmail: debtor.email,
        to: creditor.userId,
        toName: creditor.name,
        toEmail: creditor.email,
        amount: transferAmount.toFixed(4),
      });

      debtor.balance = debtor.balance.plus(transferAmount);
      creditor.balance = creditor.balance.minus(transferAmount);

      if (debtor.balance.absoluteValue().lessThanOrEqualTo(0.0001)) {
        debtors.shift();
      }
      if (creditor.balance.absoluteValue().lessThanOrEqualTo(0.0001)) {
        creditors.shift();
      }
    }

    // Format decimal amounts to strings for JSON response
    const formattedBalances = {};
    const summaryMembers = [];

    for (const mb of memberBalances) {
      formattedBalances[mb.userId] = {
        name: mb.name,
        email: mb.email,
        netBalance: mb.netBalance.toFixed(4),
        joinedAt: mb.joinedAt,
        leftAt: mb.leftAt,
      };

      summaryMembers.push({
        userId: mb.userId,
        name: mb.name,
        email: mb.email,
        totalSpent: mb.totalPaid.toFixed(4),
        totalOwed: mb.totalOwed.toFixed(4),
        settlementsPaid: mb.settlementsPaid.toFixed(4),
        settlementsReceived: mb.settlementsReceived.toFixed(4),
        netBalance: mb.netBalance.toFixed(4),
      });
    }

    result[currency] = {
      balances: formattedBalances,
      summary: {
        totalSpending: totalSpending.toFixed(4),
        members: summaryMembers,
      },
      transfers,
    };
  }

  return result;
}

async function requireGroupMember(groupId, userId) {
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
    select: { id: true },
  });

  if (!membership) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    throw new AppError(group ? "Group membership required" : "Group not found", group ? 403 : 404);
  }
}
