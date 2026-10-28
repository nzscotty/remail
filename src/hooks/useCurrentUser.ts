import { useAuthSession } from "@/hooks/useAuthSession";

export function useCurrentUser() {
  const query = useAuthSession();
  return { ...query, data: query.data?.user ?? undefined };
}
