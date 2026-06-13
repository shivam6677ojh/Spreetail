import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user") || "null"));

  useEffect(() => {
    const handleAuthChange = () => {
      setToken(localStorage.getItem("token"));
      setUser(JSON.parse(localStorage.getItem("user") || "null"));
    };

    window.addEventListener("auth-change", handleAuthChange);
    return () => window.removeEventListener("auth-change", handleAuthChange);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  return (
    <Routes>
      {/* Protected Routes Container */}
      {token ? (
        <Route element={<AppLayout user={user} onLogout={handleLogout} />}>
          <Route index element={<DashboardPage />} />
          <Route path="groups/:groupId" element={<GroupDetailPage />} />
          {/* Redirect authenticated users away from auth pages */}
          <Route path="login" element={<Navigate to="/" replace />} />
          <Route path="register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      ) : (
        /* Guest Routes Container */
        <Route element={<AppLayout user={null} onLogout={handleLogout} />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          {/* Redirect unauthenticated users to login for any other path */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      )}
    </Routes>
  );
}
