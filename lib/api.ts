const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!API_URL) return null;
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

export const websocketUrl = (path: string) => {
  if (!API_URL) return null;
  return `${API_URL.replace(/^http/, "ws")}${path}`;
};
