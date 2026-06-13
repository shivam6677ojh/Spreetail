import request from "supertest";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/utils/password.js";
import { generateAccessToken } from "../src/utils/token.js";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const userId = "8d0135e4-5012-4d91-92b1-8dfeb0fb20cc";
const user = {
  id: userId,
  name: "Alex Morgan",
  email: "alex@example.com",
  createdAt: new Date("2026-06-13T10:00:00.000Z"),
  updatedAt: new Date("2026-06-13T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("hashes the password, creates the user, and returns a token", async () => {
    prisma.user.create.mockResolvedValue(user);

    const response = await request(app).post("/api/auth/register").send({
      name: "  Alex Morgan ",
      email: " ALEX@EXAMPLE.COM ",
      password: "Secure123",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      id: userId,
      email: "alex@example.com",
    });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
    expect(response.body.data.token).toEqual(expect.any(String));

    const createInput = prisma.user.create.mock.calls[0][0];
    expect(createInput.data).toMatchObject({
      name: "Alex Morgan",
      email: "alex@example.com",
    });
    expect(createInput.data.passwordHash).not.toBe("Secure123");
  });

  it("rejects weak passwords before querying the database", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Alex Morgan",
      email: "alex@example.com",
      password: "weak",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("returns a conflict when the normalized email already exists", async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );

    const response = await request(app).post("/api/auth/register").send({
      name: "Alex Morgan",
      email: "alex@example.com",
      password: "Secure123",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain("already exists");
  });
});

describe("POST /api/auth/login", () => {
  it("returns the user and token for valid credentials", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      passwordHash: await hashPassword("Secure123"),
    });

    const response = await request(app).post("/api/auth/login").send({
      email: "ALEX@EXAMPLE.COM",
      password: "Secure123",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "alex@example.com" },
    });
  });

  it("returns a generic error for invalid credentials", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app).post("/api/auth/login").send({
      email: "missing@example.com",
      password: "Incorrect123",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Invalid email or password");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user for a valid bearer token", async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${generateAccessToken(userId)}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ id: userId });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: userId } }),
    );
  });

  it("rejects missing and invalid bearer tokens", async () => {
    const missingResponse = await request(app).get("/api/auth/me");
    const invalidResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-valid-token");

    expect(missingResponse.status).toBe(401);
    expect(invalidResponse.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a valid token when its user no longer exists", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${generateAccessToken(userId)}`);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("User account no longer exists");
  });
});
