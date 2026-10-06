const destinations = ["/", "/onboarding", "/settings", "/workout", "/nutrition", "/progress", "/coach", "/library", "/subscription", "/admin"];

export function safeNext(value: unknown, fallback = "/onboarding") {
  return typeof value === "string" && destinations.includes(value) ? value : fallback;
}
