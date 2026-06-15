import { Prisma } from "@prisma/client";
import { AppError } from "../../utils/AppError.js";

const SCALE = 4;
const ONE_HUNDRED = new Prisma.Decimal(100);

export function calculateParticipantAmounts(amount, splitMethod, participants) {
  const total = decimal(amount);
  validateParticipantIds(participants);

  if (total.equals(0)) {
    return participants.map(({ userId }) => ({
      userId,
      amount: decimal(0).toFixed(SCALE),
    }));
  }

  if (splitMethod === "EQUAL") {
    return allocateByWeights(total, participants.map(({ userId }) => ({ userId, weight: new Prisma.Decimal(1) })));
  }

  if (splitMethod === "EXACT") {
    const amounts = participants.map(({ userId, amount: participantAmount }) => ({
      userId,
      amount: decimal(participantAmount),
    }));
    const participantTotal = sum(amounts.map(({ amount: value }) => value));

    if (!participantTotal.equals(total)) {
      throw new AppError("Exact split amounts must equal the expense amount", 400);
    }

    return amounts.map(({ userId, amount: value }) => ({
      userId,
      amount: normalized(value, true),
    }));
  }

  if (splitMethod === "PERCENTAGE") {
    const weightedParticipants = participants.map(({ userId, percentage }) => ({
      userId,
      weight: decimal(percentage),
    }));
    const percentageTotal = sum(weightedParticipants.map(({ weight }) => weight));

    if (!percentageTotal.equals(ONE_HUNDRED)) {
      throw new AppError("Percentage split values must total 100", 400);
    }

    return allocateByWeights(total, weightedParticipants);
  }

  if (splitMethod === "CUSTOM") {
    return allocateByWeights(
      total,
      participants.map(({ userId, weight }) => ({ userId, weight: decimal(weight) })),
    );
  }

  throw new AppError("Unsupported split method", 400);
}

function allocateByWeights(total, participants) {
  const totalWeight = sum(participants.map(({ weight }) => weight));

  if (totalWeight.lessThanOrEqualTo(0)) {
    throw new AppError("Split values must be greater than zero", 400);
  }

  let allocated = new Prisma.Decimal(0);

  return participants.map(({ userId, weight }, index) => {
    if (weight.lessThanOrEqualTo(0)) {
      throw new AppError("Split values must be greater than zero", 400);
    }

    const isLast = index === participants.length - 1;
    const participantAmount = isLast
      ? total.minus(allocated)
      : total.times(weight).dividedBy(totalWeight).toDecimalPlaces(SCALE);

    allocated = allocated.plus(participantAmount);
    return { userId, amount: normalized(participantAmount, true) };
  });
}

function validateParticipantIds(participants) {
  if (participants.length === 0) {
    throw new AppError("At least one participant is required", 400);
  }

  if (new Set(participants.map(({ userId }) => userId)).size !== participants.length) {
    throw new AppError("Expense participants must be unique", 400);
  }
}

function sum(values) {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
}

function decimal(value) {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new AppError("Invalid split value", 400);
  }
}

function normalized(value, isNegativeAllowed = true) {
  if (!isNegativeAllowed && value.lessThanOrEqualTo(0)) {
    throw new AppError("Participant amounts must be greater than zero", 400);
  }

  return value.toFixed(SCALE);
}
