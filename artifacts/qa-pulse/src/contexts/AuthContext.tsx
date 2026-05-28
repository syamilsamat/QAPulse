import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("qa_pulse_token");
    const storedUser = localStorage.getItem("qa_pulse_user");

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        setAuthTokenGetter(() => localStorage.getItem("qa_pulse_token"));
      } catch (e) {
        localStorage.removeItem("qa_pulse_token");
        localStorage.removeItem("qa_pulse_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newUser: User, newToken: string) => {
    localStorage.setItem("qa_pulse_token", newToken);
    localStorage.setItem("qa_pulse_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setAuthTokenGetter(() => newToken);
  };

  const logout = () => {
    localStorage.removeItem("qa_pulse_token");
    localStorage.removeItem("qa_pulse_user");
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
