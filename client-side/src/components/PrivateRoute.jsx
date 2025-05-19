// client/src/components/PrivateRoute.jsx
import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

export default function PrivateRoute({ children }) {
  const { status } = useSelector((s) => s.auth);
  const location = useLocation();

  if (!status) {
    // redirect to /login, preserve where we came from
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
