import React, { createContext, useContext, useState, useEffect } from "react";

type Theme = "dark" | "light";
interface ThemeCtx { theme: Theme; toggle: () => void; }

const PortfolioThemeContext = createContext<ThemeCtx>({ theme: "dark", toggle: () => {} });

export const PortfolioThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stored = (typeof localStorage !== "undefined" && localStorage.getItem("portfolio-theme")) as Theme | null;
  const [theme, setTheme] = useState<Theme>(stored ?? "dark");

  const toggle = () => setTheme(t => {
    const next = t === "dark" ? "light" : "dark";
    localStorage.setItem("portfolio-theme", next);
    return next;
  });

  useEffect(() => {
    localStorage.setItem("portfolio-theme", theme);
  }, [theme]);

  return (
    <PortfolioThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </PortfolioThemeContext.Provider>
  );
};

export const usePortfolioTheme = () => useContext(PortfolioThemeContext);
