import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/services/api";

export const currentUserQueryKey = ["currentUser"] as const;

export function useCurrentUser() {
  return useQuery({ queryKey: currentUserQueryKey, queryFn: fetchCurrentUser });
}
