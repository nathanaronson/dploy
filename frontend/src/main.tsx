import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./index.css";
import { AuthProvider } from "./lib/AuthContext";
import Home from "./routes/Home";
import Login from "./routes/Login";
import Signup from "./routes/Signup";
import ConnectGithub from "./routes/ConnectGithub";
import Deploy from "./routes/Deploy";
import ProjectStatus from "./routes/ProjectStatus";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/connect-github" element={<ConnectGithub />} />
          <Route path="/deploy" element={<Deploy />} />
          <Route path="/project/:id" element={<ProjectStatus />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
