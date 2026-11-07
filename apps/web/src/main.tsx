import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bodoni-moda/wght.css';
import '@fontsource-variable/bodoni-moda/wght-italic.css';
import '@fontsource-variable/geist-mono/wght.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import { App } from './App.tsx';
import './tokens.css';
import './styles.css';
import { initTheme } from './theme.ts';

// Light, dark or follow the OS; also keeps AG Grid's colour mode in step with the same switch.
initTheme();

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
