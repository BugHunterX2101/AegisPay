import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

// AG Grid follows the OS colour scheme, like the rest of the page.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyMode = () => { document.body.dataset.agThemeMode = dark.matches ? 'dark' : 'light'; };
applyMode();
dark.addEventListener('change', applyMode);

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
