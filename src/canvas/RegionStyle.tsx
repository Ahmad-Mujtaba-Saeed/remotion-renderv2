import React, { createContext, useContext } from 'react';

/**
 * Style contract between the canvas journey and the shared slot components.
 * In slides mode nothing provides this context and components keep their panel.
 * Inside a frameless canvas region, media is a near-square-cornered rectangle
 * and text drops its surface entirely so copy sits straight on the world's
 * colour field — no cards, no borders, no shadows.
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
