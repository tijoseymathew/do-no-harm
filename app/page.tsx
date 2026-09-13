"use client";

import { useEffect, useState } from "react";
import { Bedside } from "../client/src/App.js";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return mounted ? (
    <Bedside />
  ) : (
    <main className="simulator">
      <p role="status">Loading deterministic bedside…</p>
    </main>
  );
}
