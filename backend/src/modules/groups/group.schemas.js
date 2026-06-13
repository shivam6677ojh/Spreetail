import { z } from "zod";

const uuidSchema = z.string().uuid();
const historicalDateSchema = z.coerce.date().refine((date) => date <= new Date(), {
  message: "Date cannot be in the future",
});

export const groupIdParamsSchema = z.object({
  groupId: uuidSchema,
});

export const memberParamsSchema = z.object({
  groupId: uuidSchema,
  userId: uuidSchema,
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});

export const updateGroupSchema = createGroupSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  { message: "At least one field is required" },
);

export const addMemberSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  joinedAt: historicalDateSchema.optional(),
});

export const removeMemberSchema = z.object({
  leftAt: historicalDateSchema.optional(),
});

