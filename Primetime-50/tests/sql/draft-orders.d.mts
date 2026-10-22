import type { Sql } from "postgres";
export function completeProfile(db: Sql, payload: unknown): ReturnType<Sql["unsafe"]>;
export function runDraftOrderCases(connect: () => Sql, users: string[], payload: unknown): Promise<string[]>;
