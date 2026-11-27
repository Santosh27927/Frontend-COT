/** Internal mock-store format. Never decode this shape from a player request. */
export function encodeData(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint")
      return { $cot: "bigint", value: String(item) };
    if (item instanceof Map) return { $cot: "map", value: [...item] };
    if (item instanceof Set) return { $cot: "set", value: [...item] };
    return item;
  });
}

export function decodeData(text: string): unknown {
  return JSON.parse(text, (_key, item) => {
    if (item && typeof item === "object" && "$cot" in item) {
      if (
        item.$cot === "bigint" &&
        typeof item.value === "string" &&
        /^-?\d+$/.test(item.value)
      )
        return BigInt(item.value);
      if (item.$cot === "map" && Array.isArray(item.value))
        return new Map(item.value);
      if (item.$cot === "set" && Array.isArray(item.value))
        return new Set(item.value);
      throw new Error("Invalid mock store data tag.");
    }
    return item;
  });
}
