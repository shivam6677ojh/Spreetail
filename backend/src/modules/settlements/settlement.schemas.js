import { z } from "zod";

export const createSettlementSchema = z.object({
  paidById: z.string().uuid("Invalid payer user ID"),
  paidToId: z.string().uuid("Invalid recipient user ID"),
  amount: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Settlement amount must be greater than zero"),
  currency: z.string().length(3).toUpperCase().default("USD"),
  settledAt: z.string().datetime({ precision: 3 }).or(z.string().date()).optional(),
  notes: z.string().max(500, "Notes cannot exceed 500 characters").optional().nullable(),
}).refine((data) => data.paidById !== data.paidToId, {
  message: "Payer and recipient must be different users",
  path: ["paidToId"],
});
