import React, { createContext, useContext } from 'react';

/**
 * Style contract between the canvas journey and the shared slot components.
 * In slides mode nothing provides this context and components keep their
 * classic look. Inside a frameless canvas region, media masks itself with big
 * soft-rounded corners + a deep shadow, and text panels drop their surface so
 * copy floats directly on the world background — no cards, no borders.
 */
export interface RegionStyle {
  frameless: boolean;
  mediaRadius: number;
  /** The region's w/h aspect, so layouts can compose for its real shape. */
  aspect?: number;
}

const RegionStyleContext = createContext<RegionStyle>({ frameless: false, mediaRadius: 0 });

export const RegionStyleProvider: React.FC<{ value: RegionStyle; children: React.ReactNode }> = ({
  value,
  children,
}) => <RegionStyleContext.Provider value={value}>{children}</RegionStyleContext.Provider>;

export const useRegionStyle = (): RegionStyle => useContext(RegionStyleContext);
