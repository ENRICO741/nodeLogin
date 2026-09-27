import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// O service worker não existe no jsdom: o aviso de atualização começa "sem atualização".
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(() => ({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() })),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});
