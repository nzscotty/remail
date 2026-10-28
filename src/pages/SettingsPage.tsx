import "./SettingsPage.scss";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { getConversationCacheOwner, isDemoMode, signOut, type AuthSession } from "@/services/api";
import { authSessionQueryKey, signedOutAuthSession } from "@/hooks/useAuthSession";
import { conversationsQueryKey } from "@/hooks/useConversations";
import { mailContactsQueryKey } from "@/hooks/useMailContacts";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AppShell } from "@/layouts/AppShell";
import { Avatar } from "@/components/Avatar";
import { clearConversationCache } from "@/services/conversationCache";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading, isError: isUserError } = useCurrentUser();
  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      if (isDemoMode) return;
      const session = queryClient.getQueryData<AuthSession>(authSessionQueryKey);
      const owner = session ? getConversationCacheOwner(session) : null;
      queryClient.setQueryData(authSessionQueryKey, signedOutAuthSession);
      await queryClient.cancelQueries({ queryKey: conversationsQueryKey });
      await queryClient.cancelQueries({ queryKey: mailContactsQueryKey });
      if (owner) clearConversationCache(owner);
      queryClient.removeQueries({ queryKey: conversationsQueryKey });
      queryClient.removeQueries({ queryKey: mailContactsQueryKey });
    },
  });
  return (
    <AppShell>
      <div className="settings-page">
        <div className="settings-head">
          <Link to="/chats" className="back-button">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1>Settings</h1>
          </div>
        </div>
        <section className="settings-card">
          <div className="profile">
            {user ? (
              <>
                <Avatar name={user.name} image={user.avatar} />
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
              </>
            ) : (
              <span>{isUserLoading ? "Loading profile…" : isUserError ? "Couldn’t load profile" : ""}</span>
            )}
          </div>
          <div className="settings-divider" />
          <div className="setting-row">
            <div>
              <strong>Email connection</strong>
              <span>Your remail chats are synced from your connected provider.</span>
            </div>
            <span className="connected-pill">
              <span className="status-dot" /> Connected
            </span>
          </div>
          <div className="settings-divider" />
          <button
            className="signout-button"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            <LogOut size={17} /> {signOutMutation.isPending ? "Signing out…" : "Sign out"}
          </button>
          {signOutMutation.isError && <p className="send-error" role="alert">Could not sign out. Please try again.</p>}
        </section>
        <p className="settings-caption">
          Remail only shows messages with <strong>[remail]</strong> in the
          subject, between you and one other person.
        </p>
      </div>
    </AppShell>
  );
}
