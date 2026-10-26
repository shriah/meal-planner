// The user's Gemini key, kept in localStorage only. Every access tolerates blocked storage.
const STORAGE_KEY = 'food-planner.gemini-api-key';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setApiKey(key: string): void {
  const cleaned = key.trim().replace(/^["']+|["']+$/g, '').trim();
  if (!cleaned) return;
  try {
    localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {
    // storage blocked: nothing to do
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: nothing to do
  }
}
