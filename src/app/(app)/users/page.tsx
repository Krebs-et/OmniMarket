import { redirect } from "next/navigation";
import { UsersView } from "@presentation/components/users/users-view";
import { getSession } from "@lib/auth";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");
  return <UsersView />;
}
