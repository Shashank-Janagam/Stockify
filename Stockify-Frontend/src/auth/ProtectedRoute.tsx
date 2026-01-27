import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "./AuthProvider";
import type  { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useContext(AuthContext);

  // ⏳ Wait until Firebase finishes restoring session
  if (loading) {
    return null; // or spinner
  }

  // ❌ Not logged in
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // ✅ Logged in
  return children;
}

export default ProtectedRoute;
