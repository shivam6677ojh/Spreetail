import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("GET /api/health", () => {
  it("reports that the API is healthy", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        status: "ok",
      },
    });
    expect(response.body.data.timestamp).toEqual(expect.any(String));
  });
});

describe("unknown routes", () => {
  it("return a structured 404 response", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain("not found");
  });
});
