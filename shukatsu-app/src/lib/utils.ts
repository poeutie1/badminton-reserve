export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function toDateInputValue(date?: Date | null): string {
  const d = date ? new Date(date) : new Date();
  return d.toISOString().split("T")[0];
}

export function tierLabel(tier: number): string {
  const labels: Record<number, string> = {
    1: "★★★★★",
    2: "★★★★",
    3: "★★★",
    4: "★★",
    5: "★",
  };
  return labels[tier] || "★★★";
}

export function resultColor(result: string): string {
  switch (result) {
    case "通過":
      return "text-green-600 bg-green-50";
    case "落ち":
      return "text-red-600 bg-red-50";
    default:
      return "text-yellow-600 bg-yellow-50";
  }
}

export function resultBadgeClass(result: string): string {
  switch (result) {
    case "通過":
      return "badge-pass";
    case "落ち":
      return "badge-fail";
    default:
      return "badge-pending";
  }
}
