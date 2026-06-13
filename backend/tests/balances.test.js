import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { generateAccessToken } from "../src/utils/token.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    group: { findUnique: vi.fn() },
    groupMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    expense: {
      findMany: vi.fn(),
    },
    settlement: {
      findMany: vi.fn(),
    },
  },
}));

const aliceId = "8d0135e4-5012-4d91-92b1-8dfeb0fb20cc";
const bobId = "93f40da0-1f19-45a0-8f71-058c1b5c25dd";
const charlieId = "a83e2622-b037-42c5-8d1d-aec15fcff24f";
const groupId = "b78f772f-2db2-46a3-a346-896a4310c68e";
const authorization = `Bearer ${generateAccessToken(aliceId)}`;

const mockMembers = [
  { userId: aliceId, user: { id: aliceId, name: "Alice", email: "alice@example.com" }, joinedAt: new Date(), leftAt: null },
  { userId: bobId, user: { id: bobId, name: "Bob", email: "bob@example.com" }, joinedAt: new Date(), leftAt: null },
  { userId: charlieId, user: { id: charlieId, name: "Charlie", email: "charlie@example.com" }, joinedAt: new Date(), leftAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  prisma.groupMember.findFirst.mockResolvedValue({ id: "membership", role: "MEMBER" });
  prisma.groupMember.findMany.mockResolvedValue(mockMembers);
});

describe("GET /api/groups/:groupId/balances", () => {
  it("calculates basic equal splits correctly", async () => {
    // Alice paid $30 for a Dinner split equally among Alice, Bob, and Charlie
    prisma.expense.findMany.mockResolvedValue([
      {
        id: "exp-1",
        groupId,
        paidById: aliceId,
        amount: "30.0000",
        expenseDate: new Date(),
        participants: [
          { userId: aliceId, amount: "10.0000" },
          { userId: bobId, amount: "10.0000" },
          { userId: charlieId, amount: "10.0000" },
        ],
      },
    ]);
    prisma.settlement.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.balances[aliceId].netBalance).toBe("20.0000");
    expect(response.body.data.balances[bobId].netBalance).toBe("-10.0000");
    expect(response.body.data.balances[charlieId].netBalance).toBe("-10.0000");

    expect(response.body.data.transfers).toEqual(
      expect.arrayContaining([
        {
          from: bobId,
          fromName: "Bob",
          fromEmail: "bob@example.com",
          to: aliceId,
          toName: "Alice",
          toEmail: "alice@example.com",
          amount: "10.0000",
        },
        {
          from: charlieId,
          fromName: "Charlie",
          fromEmail: "charlie@example.com",
          to: aliceId,
          toName: "Alice",
          toEmail: "alice@example.com",
          amount: "10.0000",
        },
      ])
    );
  });

  it("applies settlements after expense calculations correctly", async () => {
    // Alice paid $30 split equally (Alice, Bob, Charlie)
    // Bob settled $10 to Alice
    prisma.expense.findMany.mockResolvedValue([
      {
        id: "exp-1",
        groupId,
        paidById: aliceId,
        amount: "30.0000",
        expenseDate: new Date(),
        participants: [
          { userId: aliceId, amount: "10.0000" },
          { userId: bobId, amount: "10.0000" },
          { userId: charlieId, amount: "10.0000" },
        ],
      },
    ]);
    prisma.settlement.findMany.mockResolvedValue([
      {
        id: "settle-1",
        groupId,
        paidById: bobId,
        paidToId: aliceId,
        amount: "10.0000",
        settledAt: new Date(),
      },
    ]);

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    // Alice is now owed $10 (was $20, Bob paid $10)
    expect(response.body.data.balances[aliceId].netBalance).toBe("10.0000");
    // Bob now owes $0 (was -$10, paid $10)
    expect(response.body.data.balances[bobId].netBalance).toBe("0.0000");
    // Charlie still owes $10
    expect(response.body.data.balances[charlieId].netBalance).toBe("-10.0000");

    // Suggest transfers: only Charlie -> Alice $10
    expect(response.body.data.transfers).toEqual([
      {
        from: charlieId,
        fromName: "Charlie",
        fromEmail: "charlie@example.com",
        to: aliceId,
        toName: "Alice",
        toEmail: "alice@example.com",
        amount: "10.0000",
      },
    ]);
  });

  it("minimizes transactions (Who pays whom) correctly", async () => {
    // Scenario:
    // Alice paid Bob $10 (Alice owes Bob $10 -> Alice net = -10, Bob net = +10)
    // Bob paid Charlie $10 (Bob owes Charlie $10 -> Bob net = -10, Charlie net = +10)
    // Combined:
    // Alice owes Bob $10, Bob owes Charlie $10.
    // Net: Alice net = -10, Bob net = 0, Charlie net = +10.
    // Transfer suggestion should be: Alice pays Charlie $10 directly (1 transaction instead of 2).
    prisma.expense.findMany.mockResolvedValue([
      {
        id: "exp-1",
        groupId,
        paidById: bobId,
        amount: "10.0000",
        expenseDate: new Date(),
        participants: [
          { userId: aliceId, amount: "10.0000" }, // Alice owes Bob $10
        ],
      },
      {
        id: "exp-2",
        groupId,
        paidById: charlieId,
        amount: "10.0000",
        expenseDate: new Date(),
        participants: [
          { userId: bobId, amount: "10.0000" }, // Bob owes Charlie $10
        ],
      },
    ]);
    prisma.settlement.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.balances[aliceId].netBalance).toBe("-10.0000");
    expect(response.body.data.balances[bobId].netBalance).toBe("0.0000");
    expect(response.body.data.balances[charlieId].netBalance).toBe("10.0000");

    expect(response.body.data.transfers).toEqual([
      {
        from: aliceId,
        fromName: "Alice",
        fromEmail: "alice@example.com",
        to: charlieId,
        toName: "Charlie",
        toEmail: "charlie@example.com",
        amount: "10.0000",
      },
    ]);
  });
});
