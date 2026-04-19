import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { useLogout, useUser } from "./api";
import type { User } from "./api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isFetching, isError } = useUser();
  const logoutMutation = useLogout();

  const user = isError ? null : (data ?? null);
  // First load only — don't keep flashing "loading" on background refetches.
  const loading = isLoading && isFetching;

  const logout = async () => {
    return new Promise<void>((resolve) => {
      logoutMutation.mutate({}, {
        onSettled: () => resolve(),
      });
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
