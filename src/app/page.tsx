import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(hasPermission(user, "SCHEDULE_VIEW") ? "/schedule" : "/dashboard");
}
