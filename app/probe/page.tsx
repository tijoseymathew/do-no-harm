"use client";

import { useEffect, useState } from "react";
import { Probe } from "../../client/src/Probe.js";

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return mounted ? <Probe /> : <p role="status">Loading API probe…</p>;
}
