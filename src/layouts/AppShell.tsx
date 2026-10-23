import "./AppShell.scss";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mail, RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Avatar } from "@/components/Avatar";

export function AppShell({
  children,
  onRefresh,
  isRefreshing,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const { data: user } = useCurrentUser();
  return (
    <div className="app-shell flex min-h-0 w-full flex-col">
      <header className="topbar">
        <Link to="/chats" className="brand">
          <span className="brand-dot">
            <Mail size={16} />
          </span>
          <span>remail</span>
        </Link>
        <div className="mail-status topbar-status mobile-hide">
          <span className="status-dot" /> Email connected
        </div>
        <div className="top-actions">
          {onRefresh && (
            <button
              className="icon-button"
              onClick={onRefresh}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={18} className={isRefreshing ? "spin" : ""} />
            </button>
          )}
          <Link to="/settings" className="user-chip">
            <Avatar name={user?.name ?? ""} image={user?.avatar} small />
            {user && <span>{user.name.split(" ")[0]}</span>}
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
