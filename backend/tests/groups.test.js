import { Prisma } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { generateAccessToken } from "../src/utils/token.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    group: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    groupMember: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const creatorId = "8d0135e4-5012-4d91-92b1-8dfeb0fb20cc";
const memberId = "93f40da0-1f19-45a0-8f71-058c1b5c25dd";
const groupId = "b78f772f-2db2-46a3-a346-896a4310c68e";
const membershipId = "a83e2622-b037-42c5-8d1d-aec15fcff24f";
const authorization = `Bearer ${generateAccessToken(creatorId)}`;

const group = {
  id: groupId,
  name: "Summer Trip",
  description: null,
  createdById: creatorId,
};

const member = {
  id: memberId,
  name: "Jordan Lee",
  email: "jordan@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
});

describe("POST /api/groups", () => {
  it("creates a group and atomically records the creator as an admin member", async () => {
    prisma.group.create.mockResolvedValue(group);
    prisma.groupMember.create.mockResolvedValue({ id: membershipId });
    prisma.group.findUnique.mockResolvedValue({ ...group, members: [] });

    const response = await request(app)
      .post("/api/groups")
      .set("Authorization", authorization)
      .send({ name: "  Summer Trip  " });

    expect(response.status).toBe(201);
    expect(response.body.data.group).toMatchObject({ id: groupId });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.groupMember.create).toHaveBeenCalledWith({
      data: {
        groupId,
        userId: creatorId,
        role: "ADMIN",
      },
    });
  });

  it("requires authentication", async () => {
    const response = await request(app).post("/api/groups").send({ name: "Summer Trip" });

    expect(response.status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/groups/:groupId", () => {
  it("allows an active admin to edit the group", async () => {
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.groupMember.findFirst.mockResolvedValue({ id: membershipId });
    prisma.group.update.mockResolvedValue({ ...group, name: "Updated Trip", members: [] });

    const response = await request(app)
      .patch(`/api/groups/${groupId}`)
      .set("Authorization", authorization)
      .send({ name: "Updated Trip" });

    expect(response.status).toBe(200);
    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: groupId },
        data: { name: "Updated Trip" },
      }),
    );
  });

  it("rejects a user who is not an active admin", async () => {
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.groupMember.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/groups/${groupId}`)
      .set("Authorization", authorization)
      .send({ name: "Updated Trip" });

    expect(response.status).toBe(403);
    expect(prisma.group.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/groups/:groupId", () => {
  it("allows only the creator to delete the group", async () => {
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.group.delete.mockResolvedValue(group);

    const response = await request(app)
      .delete(`/api/groups/${groupId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(204);
    expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: groupId } });
  });

  it("rejects an admin who is not the group creator", async () => {
    prisma.group.findUnique.mockResolvedValue({ ...group, createdById: memberId });

    const response = await request(app)
      .delete(`/api/groups/${groupId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(403);
    expect(prisma.group.delete).not.toHaveBeenCalled();
  });
});

describe("POST /api/groups/:groupId/members", () => {
  it("adds a registered user and records the supplied join date", async () => {
    const joinedAt = "2026-05-01T10:00:00.000Z";
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.groupMember.findFirst.mockResolvedValue({ id: membershipId });
    prisma.user.findUnique.mockResolvedValue(member);
    prisma.groupMember.create.mockResolvedValue({
      id: membershipId,
      groupId,
      userId: memberId,
      joinedAt: new Date(joinedAt),
      leftAt: null,
      user: member,
    });

    const response = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set("Authorization", authorization)
      .send({ email: " JORDAN@EXAMPLE.COM ", joinedAt });

    expect(response.status).toBe(201);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "jordan@example.com" } }),
    );
    expect(prisma.groupMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          groupId,
          userId: memberId,
          joinedAt: new Date(joinedAt),
        },
      }),
    );
  });

  it("returns a conflict for an existing active member", async () => {
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.groupMember.findFirst.mockResolvedValue({ id: membershipId });
    prisma.user.findUnique.mockResolvedValue(member);
    prisma.groupMember.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );

    const response = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set("Authorization", authorization)
      .send({ email: member.email });

    expect(response.status).toBe(409);
  });
});

describe("DELETE /api/groups/:groupId/members/:userId", () => {
  it("closes the active membership without deleting its history", async () => {
    const joinedAt = new Date("2026-05-01T10:00:00.000Z");
    const leftAt = "2026-06-01T10:00:00.000Z";
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.groupMember.findFirst
      .mockResolvedValueOnce({ id: "admin-membership" })
      .mockResolvedValueOnce({ id: membershipId, joinedAt });
    prisma.groupMember.update.mockResolvedValue({
      id: membershipId,
      joinedAt,
      leftAt: new Date(leftAt),
      user: member,
    });

    const response = await request(app)
      .delete(`/api/groups/${groupId}/members/${memberId}`)
      .set("Authorization", authorization)
      .send({ leftAt });

    expect(response.status).toBe(200);
    expect(prisma.groupMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: membershipId },
        data: { leftAt: new Date(leftAt) },
      }),
    );
    expect(prisma.groupMember).not.toHaveProperty("delete");
  });

  it("prevents removal of the group creator", async () => {
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.groupMember.findFirst.mockResolvedValueOnce({ id: "admin-membership" });

    const response = await request(app)
      .delete(`/api/groups/${groupId}/members/${creatorId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(409);
    expect(prisma.groupMember.update).not.toHaveBeenCalled();
  });

  it("rejects a leave date before the recorded join date", async () => {
    prisma.group.findUnique.mockResolvedValue(group);
    prisma.groupMember.findFirst
      .mockResolvedValueOnce({ id: "admin-membership" })
      .mockResolvedValueOnce({
        id: membershipId,
        joinedAt: new Date("2026-06-01T10:00:00.000Z"),
      });

    const response = await request(app)
      .delete(`/api/groups/${groupId}/members/${memberId}`)
      .set("Authorization", authorization)
      .send({ leftAt: "2026-05-01T10:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(prisma.groupMember.update).not.toHaveBeenCalled();
  });
});
