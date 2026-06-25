import { useEffect, useState } from "react";
import { createItem, listItems } from "./api.js";
import type { ItemResponse } from "shared";

export function App() {
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);

  const refresh = () => listItems().then(setItems);
  useEffect(() => {
    refresh();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createItem({ name, amount });
    setName("");
    setAmount(0);
    refresh();
  };

  return (
    <main>
      <h1>Sandbox</h1>
      <form onSubmit={onSubmit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          placeholder="amount"
        />
        <button type="submit">Create</button>
      </form>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            {it.name} — {it.amount}
          </li>
        ))}
      </ul>
    </main>
  );
}
