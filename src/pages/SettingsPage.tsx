import "./SettingsPage.scss";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { signOut } from "@/services/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AppShell } from "@/layouts/AppShell";
import { Avatar } from "@/components/Avatar";

export function SettingsPage() {
  const { data: user, isLoading: isUserLoading, isError: isUserError } = useCurrentUser();
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
              <strong>Gmail connection</strong>
              <span>Your remail chats are synced from Gmail.</span>
            </div>
            <span className="connected-pill">
              <span className="status-dot" /> Connected
            </span>
          </div>
          <div className="settings-divider" />
          <button className="signout-button" onClick={() => signOut()}>
            <LogOut size={17} /> Sign out
          </button>
        </section>
        <p className="settings-caption">
          Remail only shows messages with <strong>[remail]</strong> in the
          subject, between you and one other person.
        </p>
      </div>
    </AppShell>
  );
}
