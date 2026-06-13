import { z } from "zod";

const uuidSchema = z.string().uuid();
const moneySchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((value) => /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(value), {
    message: "Amount must be a positive decimal with at most four decimal places",
  });
const splitValueSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((value) => /^(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$/.test(value), {
    message: "Split value must be a decimal with at most four decimal places",
  });
const expenseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value, context) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid expense date" });
      return z.NEVER;
    }

    return date;
  });

const commonExpenseFields = {
  description: z.string().trim().min(1).max(200),
  amount: moneySchema,
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("USD"),
  paidById: uuidSchema,
  expenseDate: expenseDateSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
};

const equalSplitSchema = z.object({
  ...commonExpenseFields,
  splitMethod: z.literal("EQUAL"),
  participants: z.array(z.object({ userId: uuidSchema })).min(1).max(100),
});

const exactSplitSchema = z.object({
  ...commonExpenseFields,
  splitMethod: z.literal("EXACT"),
  participants: z
    .array(z.object({ userId: uuidSchema, amount: moneySchema }))
    .min(1)
    .max(100),
});

const percentageSplitSchema = z.object({
  ...commonExpenseFields,
  splitMethod: z.literal("PERCENTAGE"),
  participants: z
    .array(z.object({ userId: uuidSchema, percentage: splitValueSchema }))
    .min(1)
    .max(100),
});

const customSplitSchema = z.object({
  ...commonExpenseFields,
  splitMethod: z.literal("CUSTOM"),
  participants: z
    .array(z.object({ userId: uuidSchema, weight: splitValueSchema }))
    .min(1)
    .max(100),
});

export const createExpenseSchema = z.discriminatedUnion("splitMethod", [
  equalSplitSchema,
  exactSplitSchema,
  percentageSplitSchema,
  customSplitSchema,
]);

export const updateExpenseSchema = z
  .object({
    description: commonExpenseFields.description.optional(),
    amount: moneySchema.optional(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
    paidById: uuidSchema.optional(),
    expenseDate: expenseDateSchema.optional(),
    notes: commonExpenseFields.notes,
    splitMethod: z.enum(["EQUAL", "EXACT", "PERCENTAGE", "CUSTOM"]).optional(),
    participants: z.array(z.record(z.string(), z.unknown())).min(1).max(100).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required",
  })
  .superRefine((input, context) => {
    const changesSplit = input.amount || input.splitMethod || input.participants;

    if (changesSplit && (!input.splitMethod || !input.participants)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Changing amount or split requires splitMethod and participants",
      });
    }
  });

export const expenseParamsSchema = z.object({
  groupId: uuidSchema,
  expenseId: uuidSchema,
});

export const expenseGroupParamsSchema = z.object({
  groupId: uuidSchema,
});

export const listExpensesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

