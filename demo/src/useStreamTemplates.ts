// SPDX-License-Identifier: Apache-2.0
/**
 * Issue #117 – Stream templates / presets (off-chain, localStorage).
 *
 * Templates are never stored on-chain. They live in localStorage so they
 * persist across sessions without any network cost.
 */

import { useState, useCallback } from "react";
import { CONFIG } from "./config";

export interface StreamTemplate {
  id: string;
  name: string;
  token: string;
  deposit: string;
  rate: string;
  stopTime: string;
  createdAt: number;
}

const STORAGE_KEY = "paystream-templates";

function load(): StreamTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persist(templates: StreamTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function useStreamTemplates() {
  const [templates, setTemplates] = useState<StreamTemplate[]>([]);

  // Issue #240: load from localStorage after mount only (SSR-safe)
  useEffect(() => {
    setTemplates(load());
  }, []);

  const save = useCallback((tpl: Omit<StreamTemplate, "id" | "createdAt">) => {
    const next: StreamTemplate = {
      ...tpl,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    setTemplates((prev) => {
      const updated = [...prev, next];
      persist(updated);
      return updated;
    });
    return next;
  }, []);

  const remove = useCallback((id: string) => {
    setTemplates((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      persist(updated);
      return updated;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<StreamTemplate, "id" | "createdAt">>) => {
    setTemplates((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      persist(updated);
      return updated;
    });
  }, []);

  return { templates, save, remove, update };
}

/** Default starter templates shown on first use. */
export const DEFAULT_TEMPLATES: Omit<StreamTemplate, "id" | "createdAt">[] = [
  {
    name: "Full-time employee (USDC)",
    token: CONFIG.defaultToken,
    deposit: "5000",
    rate: "1157",   // ~100 USDC/day in stroops/sec
    stopTime: "0",
  },
  {
    name: "Part-time contractor (USDC)",
    token: CONFIG.defaultToken,
    deposit: "2000",
    rate: "578",    // ~50 USDC/day
    stopTime: "0",
  },
];
