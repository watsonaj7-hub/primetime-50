import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { readNutrition,mutateNutrition } from "@/lib/services/nutrition";
import { checkOrigin,errorResponse,readJson } from "@/lib/http/errors";
const headers={"Cache-Control":"no-store"};
function privateError(error:unknown){const response=errorResponse(error);response.headers.set("Cache-Control","no-store");return response;}
export async function GET(request:Request){
 try {return NextResponse.json(await readNutrition(Object.fromEntries(new URL(request.url).searchParams)),{headers});}
 catch(error){return privateError(error);}
}
export async function POST(request:Request){
 try {checkOrigin(request);await requireUser();return NextResponse.json(await mutateNutrition(await readJson(request)),{headers});}
 catch(error){return privateError(error);}
}
