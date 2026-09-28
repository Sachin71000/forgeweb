import type { ProductKind } from "./domain.ts";

const genericEntityKeywords: Array<[RegExp, string]> = [
  [/projects?/i, "Project"],
  [/invoices?|billing/i, "Invoice"],
  [/files?|documents?/i, "FileAsset"],
  [/inventory|stock/i, "InventoryItem"],
  [/teams?|staff/i, "TeamMember"],
  [/schedul|calendar/i, "ScheduleEntry"],
  [/clients?|customers?/i, "Client"],
];

const commerceEntities = ["User", "Product", "Category", "InventoryItem", "Cart", "Wishlist", "Order", "Payment", "Review", "Address"];
const restaurantEntities = ["Customer", "MenuCategory", "MenuItem", "DiningTable", "Reservation", "Order", "Review"];

export function detectProductKind(prompt: string): ProductKind {
  if (/e[- ]?commerce|online (?:shop|store|marketplace)|shopping experience|product catalog|checkout|amazon|flipkart/i.test(prompt)) return "commerce";
  if (/restaurant|dining|menu items?|table reservation|reserve a table|chef|cuisine/i.test(prompt)) return "restaurant";
  if (/inventory|stock management|warehouse/i.test(prompt)) return "inventory";
  if (/schedul|calendar|appointment|booking/i.test(prompt)) return "scheduler";
  if (/client portal|customer portal|member portal/i.test(prompt)) return "portal";
  return "generic";
}

export function inferProductName(prompt: string, kind = detectProductKind(prompt)): string {
  const explicit = prompt.match(/(?:called|named|brand(?:ed)? as)\s+["']?([A-Za-z][A-Za-z0-9 &-]{2,35})/i)?.[1]?.trim()
    ?? prompt.match(/(?:^|\n)\s*name\s*(?:-|:|=)\s*["']?([A-Za-z][A-Za-z0-9 &-]{1,35})/im)?.[1]?.trim();
  if (explicit) return explicit.replace(/\b\w/g, (character) => character.toUpperCase());
  const names: Record<Exclude<ProductKind, "generic">, string[]> = {
    commerce: ["Vela Market", "Luma Cart", "Northstar Shop", "Cartora", "Meridian Market"],
    restaurant: ["Saffron Table", "Ember & Vine", "The Gathered Plate", "Mise Dining", "Cedar Supper Club"],
    inventory: ["Stockwise Inventory", "Depot Flow", "Supply Pilot", "Countgrid", "Ledger Stock"],
    scheduler: ["Tempo Scheduler", "Meetwise", "Calendra", "Slot Pilot", "Rhythm Booking"],
    portal: ["Harbor Client Portal", "Client Bridge", "Northstar Portal", "Partner Dock", "Clearspace Portal"],
  };
  if (kind !== "generic") {
    let hash = 0;
    for (const character of prompt.toLowerCase()) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
    return names[kind][hash % names[kind].length];
  }
  const match = prompt.match(/(?:build|create|make)\s+(?:an?\s+)?([^,.]{3,56})/i);
  const ignored = /^(?:modern|responsive|secure|full[- ]stack|professional|clean|premium|scalable|fast)(?:\s+and)?\s+/i;
  let candidate = match?.[1]?.replace(ignored, "").replace(/\s+(?:with|for|that)\s+.*$/i, "").trim();
  while (candidate && ignored.test(candidate)) candidate = candidate.replace(ignored, "").trim();
  if (!candidate || candidate.length < 3) return "Purpose Built App";
  return candidate.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function inferDomainEntities(prompt: string, kind = detectProductKind(prompt)): string[] {
  if (kind === "commerce") return commerceEntities;
  if (kind === "restaurant") return restaurantEntities;
  const inferred = genericEntityKeywords.filter(([keyword]) => keyword.test(prompt)).map(([, entity]) => entity);
  return [...new Set(["User", ...inferred])];
}
