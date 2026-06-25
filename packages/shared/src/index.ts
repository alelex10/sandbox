import { z } from "zod";

export const CreateItemRequest = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
});
export type CreateItemRequest = z.infer<typeof CreateItemRequest>;

export const ItemResponse = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number(),
  createdAt: z.string().datetime(),
});
export type ItemResponse = z.infer<typeof ItemResponse>;
