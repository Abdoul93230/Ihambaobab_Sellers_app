import React, { createContext, useContext, useRef, useCallback } from 'react';

const TourTabContext = createContext(null);

// 5 onglets : Dashboard(0) Portefeuille(1) Produits(2) Vente(3) Plus(4)
const TAB_INDEX = {
  tabPortefeuille: 1,
  tabProduits:     2,
  tabVente:        3,
  tabPlus:         4,
};

const TAB_CONTENT_H = 60;

export function TourTabProvider({ children }) {
  const tabBarRef    = useRef(null);
  const listenersRef = useRef([]);
  const measuredRef  = useRef({});

  const onTabBarLayout = useCallback(() => {
    if (!tabBarRef.current) return;
    tabBarRef.current.measureInWindow((barX, barY, barW, barH) => {
      if (barW <= 0 || barH <= 0) return;
      const tabW = barW / 5;
      const tabs = {};
      Object.entries(TAB_INDEX).forEach(([key, idx]) => {
        tabs[key] = { x: barX + idx * tabW, y: barY, width: tabW, height: TAB_CONTENT_H };
      });
      measuredRef.current = tabs;
      listenersRef.current.forEach(fn => fn({ ...tabs }));
    });
  }, []);

  const subscribe = useCallback((fn) => {
    listenersRef.current.push(fn);
    if (Object.keys(measuredRef.current).length > 0) fn({ ...measuredRef.current });
    return () => {
      listenersRef.current = listenersRef.current.filter(f => f !== fn);
    };
  }, []);

  return (
    <TourTabContext.Provider value={{ tabBarRef, onTabBarLayout, subscribe }}>
      {children}
    </TourTabContext.Provider>
  );
}

export function useTourTabContext() {
  return useContext(TourTabContext);
}
