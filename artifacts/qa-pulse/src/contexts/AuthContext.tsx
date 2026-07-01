import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import type { User } from "@workspace/api-client-react";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string, refreshToken: string, remember: boolean) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY_TOKEN    = "qa_pulse_token";
const STORAGE_KEY_USER     = "qa_pulse_user";
const STORAGE_KEY_REFRESH  = "qa_pulse_refresh_token";
const STORAGE_KEY_REDMINE  = "qa_pulse_redmine_key";
const STORAGE_KEY_REMEMBER = "qa_pulse_remember_me";

function getStorage(): Storage {
  return localStorage.getItem(STORAGE_KEY_REMEMBER) === "true" ? localStorage : sessionStorage;
}

function clearAllStorage() {
  [STORAGE_KEY_TOKEN, STORAGE_KEY_USER, STORAGE_KEY_REFRESH, STORAGE_KEY_REDMINE].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  localStorage.removeItem(STORAGE_KEY_REMEMBER);
}

function readStoredValue(key: string): string | null {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const performLogout = (currentToken?: string | null, currentRefresh?: string | null) => {
    const accessToken = currentToken ?? token;
    const rt = currentRefresh ?? refreshToken;
    fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
    clearAllStorage();
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setAuthTokenGetter(null);
    setUnauthorizedHandler(null);
    setLocation("/login");
  };

  // CR007-2: Validate token on startup — don't trust localStorage blindly
  useEffect(() => {
    const storedToken   = readStoredValue(STORAGE_KEY_TOKEN);
    const storedRefresh = readStoredValue(STORAGE_KEY_REFRESH);
    const storedUser    = readStoredValue(STORAGE_KEY_USER);

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid");
        const userData = await res.json();
        setToken(storedToken);
        setRefreshToken(storedRefresh);
        setUser(userData);
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const key = parsed?.redmineApiKey;
          if (key) localStorage.setItem(STORAGE_KEY_REDMINE, key);
        }
        setAuthTokenGetter(() => readStoredValue(STORAGE_KEY_TOKEN));
        setUnauthorizedHandler(() => performLogout(storedToken, storedRefresh));
      })
      .catch(() => {
        clearAllStorage();
        setLocation("/login");
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CR007-3 & CR007-7: Silent refresh loop + expiry warning toast
  useEffect(() => {
    if (!token || !refreshToken) return;

    let payload: { exp: number };
    try {
      payload = JSON.parse(atob(token.split(".")[1]));
    } catch {
      return;
    }

    const expiresAt  = payload.exp * 1000;
    const refreshAt  = expiresAt - 2 * 60 * 1000;  // 2 min before expiry
    const warnAt     = expiresAt - 5 * 60 * 1000;  // 5 min before expiry

    const doSilentRefresh = () => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("refresh failed");
          const data = await res.json();
          const storage = getStorage();
          storage.setItem(STORAGE_KEY_TOKEN, data.token);
          storage.setItem(STORAGE_KEY_REFRESH, data.refreshToken);
          setToken(data.token);
          setRefreshToken(data.refreshToken);
          setAuthTokenGetter(() => readStoredValue(STORAGE_KEY_TOKEN));
        })
        .catch(() => performLogout())
        .finally(() => { refreshInFlight.current = null; });
    };

    const timers: ReturnType<typeof setTimeout>[] = [];

    const refreshDelay = refreshAt - Date.now();
    if (refreshDelay <= 0) {
      doSilentRefresh();
    } else {
      timers.push(setTimeout(doSilentRefresh, refreshDelay));
    }

    const warnDelay = warnAt - Date.now();
    if (warnDelay > 0) {
      timers.push(setTimeout(() => {
        toast({
          title: "Session expiring soon",
          description: "Your session will expire in 5 minutes. Click to stay logged in.",
        });
      }, warnDelay));
    }

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // CR007-5: login accepts remember flag and refreshToken
  const login = (newUser: User, newToken: string, newRefreshToken: string, remember: boolean) => {
    localStorage.setItem(STORAGE_KEY_REMEMBER, String(remember));
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(STORAGE_KEY_TOKEN, newToken);
    storage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    storage.setItem(STORAGE_KEY_REFRESH, newRefreshToken);
    const key = (newUser as any)?.redmineApiKey;
    if (key) localStorage.setItem(STORAGE_KEY_REDMINE, key);
    else localStorage.removeItem(STORAGE_KEY_REDMINE);
    setToken(newToken);
    setRefreshToken(newRefreshToken);
    setUser(newUser);
    setAuthTokenGetter(() => readStoredValue(STORAGE_KEY_TOKEN));
    setUnauthorizedHandler(() => performLogout(newToken, newRefreshToken));
  };

  const logout = () => performLogout();

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
