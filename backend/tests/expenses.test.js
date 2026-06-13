import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { generateAccessToken } from "../src/utils/token.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    group: { findUnique: vi.fn() },
    groupMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    expense: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const creatorId = "8d0135e4-5012-4d91-92b1-8dfeb0fb20cc";
const memberId = "93f40da0-1f19-45a0-8f71-058c1b5c25dd";
const groupId = "b78f772f-2db2-46a3-a346-896a4310c68e";
const expenseId = "a83e2622-b037-42c5-8d1d-aec15fcff24f";
const authorization = `Bearer ${generateAccessToken(creatorId)}`;

const expense = {
  id: expenseId,
  groupId,
  createdById: creatorId,
  paidById: creatorId,
  description: "Dinner",
  amount: "30.0000",
  currency: "USD",
  splitMethod: "EQUAL",
  expenseDate: new Date("2026-06-01T00:00:00.000Z"),
  participants: [{ userId: creatorId }, { userId: memberId }],
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation((operations) => Promise.all(operations));
  prisma.groupMember.findFirst.mockResolvedValue({ id: "membership", role: "MEMBER" });
  prisma.groupMember.findMany.mockResolvedValue([{ userId: creatorId }, { userId: memberId }]);
});

describe("POST /api/groups/:groupId/expenses", () => {
  it("creates an equal-split expense with normalized participant amounts", async () => {
    prisma.expense.create.mockResolvedValue(expense);

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", authorization)
      .send({
        description: "Dinner",
        amount: "30",
        paidById: creatorId,
        expenseDate: "2026-06-01",
        splitMethod: "EQUAL",
        participants: [{ userId: creatorId }, { userId: memberId }],
      });

    expect(response.status).toBe(201);
    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: creatorId,
          splitMethod: "EQUAL",
          participants: {
            create: [
              { userId: creatorId, amount: "15.0000" },
              { userId: memberId, amount: "15.0000" },
            ],
          },
        }),
      }),
    );
  });

  it("rejects a payer or participant outside the group on the expense date", async () => {
    prisma.groupMember.findMany.mockResolvedValue([{ userId: creatorId }]);

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", authorization)
      .send({
        description: "Dinner",
        amount: "30",
        paidById: creatorId,
        expenseDate: "2026-06-01",
        splitMethod: "EQUAL",
        participants: [{ userId: creatorId }, { userId: memberId }],
      });

    expect(response.status).toBe(400);
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });
});

describe("expense reads", () => {
  it("lists expenses with pagination for active group members", async () => {
    prisma.expense.findMany.mockResolvedValue([expense]);
    prisma.expense.count.mockResolvedValue(1);

    const response = await request(app)
      .get(`/api/groups/${groupId}/expenses?page=2&pageSize=10`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toEqual({ page: 2, pageSize: 10, total: 1 });
    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it("returns expense details scoped to the requested group", async () => {
    prisma.expense.findFirst.mockResolvedValue(expense);

    const response = await request(app)
      .get(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(prisma.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: expenseId, groupId } }),
    );
  });
});

describe("expense updates and deletion", () => {
  it("replaces participants when updating the split", async () => {
    prisma.expense.findFirst.mockResolvedValue(expense);
    prisma.expense.update.mockResolvedValue({ ...expense, splitMethod: "CUSTOM" });

    const response = await request(app)
      .patch(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", authorization)
      .send({
        amount: "30",
        splitMethod: "CUSTOM",
        participants: [
          { userId: creatorId, weight: "1" },
          { userId: memberId, weight: "2" },
        ],
      });

    expect(response.status).toBe(200);
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splitMethod: "CUSTOM",
          participants: {
            deleteMany: {},
            create: [
              { userId: creatorId, amount: "10.0000" },
              { userId: memberId, amount: "20.0000" },
            ],
          },
        }),
      }),
    );
  });

  it("allows the creator to delete an expense", async () => {
    prisma.expense.findFirst.mockResolvedValue(expense);
    prisma.expense.delete.mockResolvedValue(expense);

    const response = await request(app)
      .delete(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(204);
    expect(prisma.expense.delete).toHaveBeenCalledWith({ where: { id: expenseId } });
  });

  it("rejects modification by a non-creator who is not an admin", async () => {
    prisma.expense.findFirst.mockResolvedValue({ ...expense, createdById: memberId });

    const response = await request(app)
      .delete(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(403);
    expect(prisma.expense.delete).not.toHaveBeenCalled();
  });
});

