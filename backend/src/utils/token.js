import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const TOKEN_ISSUER = "spreetail-api";
const TOKEN_AUDIENCE = "spreetail-app";

export function generateAccessToken(userId) {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });
}
