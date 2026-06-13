import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be at most 72 bytes",
  });

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).refine((password) => Buffer.byteLength(password, "utf8") <= 72),
});
