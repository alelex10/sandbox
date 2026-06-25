import type { CreateItemRequest, ItemResponse } from "shared";

const API = "http://localhost:3000";

export const createItem = (body: CreateItemRequest): Promise<ItemResponse> =>
  fetch(`${API}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const listItems = (): Promise<ItemResponse[]> =>
  fetch(`${API}/items`).then((r) => r.json());
