export type MutationState = { status: "idle" | "success" | "error"; message?: string; fields?: Record<string, string[] | undefined> };
export const initialState: MutationState = { status: "idle" };
