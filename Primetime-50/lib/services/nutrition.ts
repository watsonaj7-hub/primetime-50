import "server-only";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import { nutritionMutation, nutritionQuery } from "@/lib/validation/nutrition";
function storageError(error:{code?:string}) {
 if(error.code==="P1101")return new AppError(409,"This entry or retry identity changed. Reload saved entries and compare before making a new change.");
 if(error.code==="P0002")return new AppError(404,"The owned entry was not found. Reload saved entries.");
 if(["22023","22007","22008","22P02","23514"].includes(error.code??""))return new AppError(422,"Please check the date, timezone and entry values.");
 return new AppError(503,"Saved nutrition records could not be confirmed. Retain your entries and retry.");
}
export async function readNutrition(input:unknown){
 const {supabase}=await requireUser();const payload=nutritionQuery.parse(input);
 const {data,error}=await supabase.rpc("read_nutrition_day",{payload});if(error)throw storageError(error);return data;
}
export async function mutateNutrition(input:unknown){
 const {supabase}=await requireUser();const payload=nutritionMutation.parse(input);
 const {data,error}=await supabase.rpc("mutate_nutrition_record",{payload});if(error)throw storageError(error);return data;
}
