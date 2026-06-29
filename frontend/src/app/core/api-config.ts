declare global {
  interface Window {
    __EUCLIDA_API_URL__?: string;
  }
}

export const API_URL =
  typeof window !== 'undefined' && window.__EUCLIDA_API_URL__
    ? window.__EUCLIDA_API_URL__
    : 'http://localhost:3000';
