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
    settlement: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const creatorId = "8d0135e4-5012-4d91-92b1-8dfeb0fb20cc";
const memberId = "93f40da0-1f19-45a0-8f71-058c1b5c25dd";
const groupId = "b78f772f-2db2-46a3-a346-896a4310c68e";
const settlementId = "a83e2622-b037-42c5-8d1d-aec15fcff24f";
const authorization = `Bearer ${generateAccessToken(creatorId)}`;

const settlement = {
  id: settlementId,
  groupId,
  recordedById: creatorId,
  paidById: creatorId,
  paidToId: memberId,
  amount: "15.0000",
  currency: "USD",
  settledAt: new Date("2026-06-01T00:00:00.000Z"),
  notes: "Settle dinner",
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.groupMember.findFirst.mockResolvedValue({ id: "membership", role: "MEMBER" });
  prisma.groupMember.findMany.mockResolvedValue([{ userId: creatorId }, { userId: memberId }]);
});

describe("POST /api/groups/:groupId/settlements", () => {
  it("records a valid settlement between two group members", async () => {
    prisma.settlement.create.mockResolvedValue(settlement);

    const response = await request(app)
      .post(`/api/groups/${groupId}/settlements`)
      .set("Authorization", authorization)
      .send({
        paidById: creatorId,
        paidToId: memberId,
        amount: "15.00",
        currency: "USD",
        settledAt: "2026-06-01T00:00:00.000Z",
        notes: "Settle dinner",
      });

    if (response.status !== 201) console.log("CREATE ERROR:", response.body);
    expect(response.status).toBe(201);
    expect(prisma.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId,
          recordedById: creatorId,
          paidById: creatorId,
          paidToId: memberId,
          amount: "15.00",
          currency: "USD",
        }),
      }),
    );
  });

  it("rejects recording a settlement if payer and recipient are the same user", async () => {
    const response = await request(app)
      .post(`/api/groups/${groupId}/settlements`)
      .set("Authorization", authorization)
      .send({
        paidById: creatorId,
        paidToId: creatorId,
        amount: "15.00",
      });

    expect(response.status).toBe(400);
    expect(prisma.settlement.create).not.toHaveBeenCalled();
  });

  it("rejects recording a settlement if amount is zero or negative", async () => {
    const response = await request(app)
      .post(`/api/groups/${groupId}/settlements`)
      .set("Authorization", authorization)
      .send({
        paidById: creatorId,
        paidToId: memberId,
        amount: "-15.00",
      });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/groups/:groupId/settlements", () => {
  it("lists all settlements for the group", async () => {
    prisma.settlement.findMany.mockResolvedValue([settlement]);

    const response = await request(app)
      .get(`/api/groups/${groupId}/settlements`)
      .set("Authorization", authorization);

    if (response.status !== 200) console.log("LIST ERROR:", response.body);
    expect(response.status).toBe(200);
    expect(response.body.data.settlements).toEqual([
      expect.objectContaining({
        id: settlementId,
        groupId,
      }),
    ]);
  });
});
