export const API = "http://localhost:8080";

export async function signIn(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", 
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
}

export async function fetchChannels() {
  const res = await fetch(`${API}/channels`, { credentials: "include" });
  return res.json();
}