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
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    expense: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    settlement: {
      deleteMany: vi.fn(),
    },
    expenseParticipant: {
      createMany: vi.fn(),
    },
    import: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    importAnomaly: {
      createMany: vi.fn(),
    },
  },
}));

const aliceId = "8d0135e4-5012-4d91-92b1-8dfeb0fb20cc";
const bobId = "93f40da0-1f19-45a0-8f71-058c1b5c25dd";
const charlieId = "a83e2622-b037-42c5-8d1d-aec15fcff24f";
const groupId = "b78f772f-2db2-46a3-a346-896a4310c68e";
const authorization = `Bearer ${generateAccessToken(aliceId)}`;

const mockUsers = [
  { id: aliceId, name: "Alice", email: "alice@example.com" },
  { id: bobId, name: "Bob", email: "bob@example.com" },
  { id: charlieId, name: "Charlie", email: "charlie@example.com" },
];

const mockMembers = [
  { userId: aliceId, user: mockUsers[0], joinedAt: new Date("2026-05-01"), leftAt: null },
  { userId: bobId, user: mockUsers[1], joinedAt: new Date("2026-05-01"), leftAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation((cb) => cb(prisma));
  prisma.groupMember.findFirst.mockResolvedValue({ id: "membership", role: "MEMBER", joinedAt: new Date("2026-05-01"), leftAt: null });
  prisma.groupMember.findMany.mockResolvedValue(mockMembers);
  prisma.groupMember.create.mockImplementation((args) => Promise.resolve({ id: "new-member", ...args.data }));
  prisma.groupMember.update.mockImplementation((args) => Promise.resolve({ id: "updated-member", ...args.data }));

  prisma.user.findMany.mockResolvedValue(mockUsers);
  prisma.user.findUnique.mockImplementation((args) => {
    const email = args.where.email;
    const found = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    return Promise.resolve(found || null);
  });
  prisma.user.findFirst.mockImplementation((args) => {
    const name = args.where.name?.equals;
    const found = mockUsers.find(u => u.name.toLowerCase() === name.toLowerCase());
    return Promise.resolve(found || null);
  });
  prisma.user.create.mockImplementation((args) => Promise.resolve({ id: "new-user", ...args.data }));

  prisma.expense.findMany.mockResolvedValue([]);
  prisma.settlement.deleteMany.mockResolvedValue({ count: 0 });
  prisma.import.create.mockResolvedValue({ id: "import-123" });
  prisma.import.update.mockResolvedValue({ id: "import-123", status: "COMPLETED" });
});

describe("POST /api/groups/:groupId/imports", () => {
  it("imports a valid CSV file successfully", async () => {
    const csvContent = [
      "date,description,amount,currency,payer_email,split_method,participants",
      "2026-06-01,Dinner,30,USD,alice@example.com,EQUAL,alice@example.com;bob@example.com",
    ].join("\n");

    const response = await request(app)
      .post(`/api/groups/${groupId}/imports`)
      .set("Authorization", authorization)
      .send({ csvText: csvContent, fileName: "export.csv" });

    if (response.status !== 201) console.log("IMPORT FAIL:", response.body);
    expect(response.status).toBe(201);
    expect(prisma.expense.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            description: "Dinner",
            amount: "30",
            splitMethod: "EQUAL",
          }),
        ]),
      })
    );
  });

  it("normalizes foreign currency (EUR) to USD and logs warning anomaly", async () => {
    const csvContent = [
      "date,description,amount,currency,payer_email,split_method,participants",
      "2026-06-01,Lunch,10,EUR,alice@example.com,EQUAL,alice@example.com;bob@example.com",
    ].join("\n");

    const response = await request(app)
      .post(`/api/groups/${groupId}/imports`)
      .set("Authorization", authorization)
      .send({ csvText: csvContent });

    expect(response.status).toBe(201);
    // Converted amount should be 10 * 1.10 = 11.0000 USD
    expect(prisma.expense.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            description: "Lunch",
            amount: "11.0000",
          }),
        ]),
      })
    );

    // Warning anomaly should be logged for currency conversion
    expect(prisma.importAnomaly.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            code: "CURRENCY_CONVERSION",
            severity: "WARNING",
          }),
        ]),
      })
    );
  });

  it("detects UNKNOWN_USER, INVALID_CURRENCY, and SELF_PAYMENT anomalies", async () => {
    const csvContent = [
      "date,description,amount,currency,payer_email,split_method,participants",
      // Row 1: Unknown Payer
      "2026-06-01,Dinner,30,USD,stranger@example.com,EQUAL,alice@example.com;bob@example.com",
      // Row 2: Invalid Currency
      "2026-06-01,Dinner,30,XYZ,alice@example.com,EQUAL,alice@example.com;bob@example.com",
      // Row 3: Self Payment
      "2026-06-01,Dinner,30,USD,alice@example.com,EQUAL,alice@example.com",
    ].join("\n");

    const response = await request(app)
      .post(`/api/groups/${groupId}/imports`)
      .set("Authorization", authorization)
      .send({ csvText: csvContent });

    expect(response.status).toBe(201);
    expect(prisma.expense.createMany).not.toHaveBeenCalled(); // No expenses created because they all have errors

    expect(prisma.importAnomaly.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ code: "UNKNOWN_USER", severity: "ERROR" }),
          expect.objectContaining({ code: "INVALID_CURRENCY", severity: "ERROR" }),
          expect.objectContaining({ code: "SELF_PAYMENT", severity: "ERROR" }),
        ]),
      })
    );
  });

  it("rejects duplicate imports (SHA-256 collision)", async () => {
    const csvContent = "some csv data here";
    prisma.import.findFirst.mockResolvedValue({ id: "existing-import" });

    const response = await request(app)
      .post(`/api/groups/${groupId}/imports`)
      .set("Authorization", authorization)
      .send({ csvText: csvContent });

    expect(response.status).toBe(409);
  });

  describe("DELETE /api/groups/:groupId/imports/:importId", () => {
    it("deletes the import and associated expenses successfully", async () => {
      prisma.import.findFirst.mockResolvedValue({ id: "import-123", groupId });
      prisma.expense.deleteMany.mockResolvedValue({ count: 2 });
      prisma.import.delete.mockResolvedValue({ id: "import-123" });

      const response = await request(app)
        .delete(`/api/groups/${groupId}/imports/import-123`)
        .set("Authorization", authorization);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe("import-123");
      expect(prisma.expense.deleteMany).toHaveBeenCalledWith({
        where: { importId: "import-123" },
      });
      expect(prisma.import.delete).toHaveBeenCalledWith({
        where: { id: "import-123" },
      });
    });

    it("returns 404 if the import is not found", async () => {
      prisma.import.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .delete(`/api/groups/${groupId}/imports/invalid-import`)
        .set("Authorization", authorization);

      expect(response.status).toBe(404);
    });
  });
});
