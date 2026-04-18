import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./index.css";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./lib/AuthContext";
import Home from "./routes/Home";
import Login from "./routes/Login";
import Deploy from "./routes/Deploy";
import ProjectStatus from "./routes/ProjectStatus";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/deploy" element={<Deploy />} />
            <Route path="/project/:id" element={<ProjectStatus />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
);
