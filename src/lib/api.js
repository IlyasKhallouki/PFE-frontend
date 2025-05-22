export const api = async (url, opts = {}, parseJson = true) => {
  const res = await fetch(`http://localhost:8080${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });

  if (res.status === 401) {
    window.location.href = "/signin";
    return;
  }
  return parseJson ? res.json() : res;
};

/* ---------- typed one‑shot helpers ---------- */
export const signIn        = (body)           => api("/auth/login", { method: "POST", body: JSON.stringify(body) }, false);
export const listChannels  = ()               => api("/channels");
export const listUsers     = ()               => api("/users/");            // [{id,email,role}]
export const listRecipients= ()               => api("/dms/recipients");   // [id, id, …]  (excludes “me”)
export const openDm        = (otherId)        => api(`/dms/${otherId}`, { method: "POST" });
