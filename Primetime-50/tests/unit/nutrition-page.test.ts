import { expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const identity=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/auth/require-user",()=>({requireUser:identity.read}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT ${url}`);}}));
vi.mock("@/components/app-shell",()=>({AppShell:({children}:{children:React.ReactNode})=>children}));
import Page from "@/app/app/nutrition/page";
it("server-gates the requested /app/nutrition route before rendering",async()=>{identity.read.mockRejectedValueOnce(new Error("unavailable"));await expect(Page()).rejects.toThrow("REDIRECT /login?next=/app/nutrition");});
it("renders the owned target-free logger for the verified identity",async()=>{identity.read.mockResolvedValueOnce({user:{id:"synthetic-A"}});const html=renderToStaticMarkup(await Page());expect(html).toContain("Nutrition log");expect(html).not.toContain("1,920");});
