import React, { createContext, useContext } from 'react';
import { Theme, DEFAULT_THEME } from './types';

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const ThemeProvider: React.FC<{ theme?: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => <ThemeContext.Provider value={theme ?? DEFAULT_THEME}>{children}</ThemeContext.Provider>;

export const useTheme = (): Theme => useContext(ThemeContext);
