import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/layouts/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { ChatsPage } from "@/pages/ChatsPage";
import { NewConversationPage } from "@/pages/NewConversationPage";
import { SettingsPage } from "@/pages/SettingsPage";

export function App() {
 useEffect(() => { document.documentElement.classList.add("loaded"); }, []);
 const protectedRoute = (element: ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;
 return <Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/chats" element={protectedRoute(<ChatsPage />)} />
  <Route path="/chats/new" element={protectedRoute(<NewConversationPage />)} />
  <Route path="/chats/:conversationId" element={protectedRoute(<ChatsPage />)} />
  <Route path="/settings" element={protectedRoute(<SettingsPage />)} />
  <Route path="*" element={<Navigate to="/chats" replace />} />
 </Routes>;
}

