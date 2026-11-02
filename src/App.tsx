import { useEffect } from 'react';
import { HashRouter, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { useSettings } from './app/progress';
import { Home } from './features/home/Home';
import { ItemPage } from './features/item/ItemPage';
import { MapPage } from './features/map/MapPage';
import { ProgressPage } from './features/progress/ProgressPage';
import { SourcesPage } from './features/progress/SourcesPage';
import { Session } from './features/session/Session';
import { WordsPage } from './features/words/WordsPage';
import { ReaderPage } from './features/reading/ReaderPage';
import { ReadingsPage } from './features/reading/ReadingsPage';

const TABS = [
  { to: '/', han: '今', label: 'Hoy', end: true },
  { to: '/mapa', han: '字', label: 'Caracteres' },
  { to: '/palabras', han: '词', label: 'Palabras' },
  { to: '/progreso', han: '进', label: 'Progreso' },
];

function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    // (scrollTo devuelve una promesa en navegadores recientes: no puede ser el valor de retorno del efecto)
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <div className="shell">
        <Outlet />
      </div>
      <nav className="tabbar" aria-label="Secciones">
        <ul>
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <span className="han" aria-hidden="true">
                  {t.han}
                </span>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function useTheme() {
  const { theme } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
}

export default function App() {
  useTheme();
  return (
    <HashRouter>
      <Routes>
        <Route path="/sesion/:mode" element={<Session />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="mapa" element={<MapPage />} />
          <Route path="palabras" element={<WordsPage />} />
          <Route path="progreso" element={<ProgressPage />} />
          <Route path="fuentes" element={<SourcesPage />} />
          <Route path="ficha/:kind/:key" element={<ItemPage />} />
          <Route path="lecturas" element={<ReadingsPage />} />
          <Route path="lectura/:id" element={<ReaderPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
