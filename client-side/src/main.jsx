import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { Provider } from "react-redux";
import { store } from "./store/store.js";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Home from "./pages/Home.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ProblemDetail from "./pages/ProblemDetail.jsx";
import PrivateRoute from "./components/PrivateRoute.jsx";
import ProgressPage from "./pages/ProgressPage.jsx";
import ContestListPage from "./pages/ContestListPage.jsx";
import ContestDetailPage from "./pages/ContestDetailPage.jsx";
import LeaderboardPage from "./pages/LeaderboardPage.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      {
        path: "/contests",
        element: <ContestListPage />,
      },
      {
        path: "/contests/:contestId",
        element: <ContestDetailPage />,
      },
      {
        path: "/contests/:contestId/leaderboard",
        element: <LeaderboardPage />,
      },
      {
        path:"/contests/:contestId/problems/:problemId",
        element: (
          <PrivateRoute>
            <ProblemDetail />
          </PrivateRoute>
        ),
      },

      // protected problem detail:
      {
        path: "/problems/:id",
        element: (
          <PrivateRoute>
            <ProblemDetail />
          </PrivateRoute>
        ),
      },
      // protected progress page:
      {
        path: "/my-progress",
        element: (
          <PrivateRoute>
            <ProgressPage />
          </PrivateRoute>
        ),
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </React.StrictMode>
);
