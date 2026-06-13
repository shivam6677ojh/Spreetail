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
    user: {
      findMany: vi.fn(),
    },
    expense: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    import: {
      create: vi.fn(),
      update: vi.fn(),
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
  prisma.groupMember.findFirst.mockResolvedValue({ id: "membership", role: "MEMBER" });
  prisma.groupMember.findMany.mockResolvedValue(mockMembers);
  prisma.user.findMany.mockResolvedValue(mockUsers);
  prisma.expense.findMany.mockResolvedValue([]);
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
    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Dinner",
          amount: "30",
          splitMethod: "EQUAL",
        }),
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
    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Lunch",
          amount: "11.0000",
        }),
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
    expect(prisma.expense.create).not.toHaveBeenCalled(); // No expenses created because they all have errors

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
});
