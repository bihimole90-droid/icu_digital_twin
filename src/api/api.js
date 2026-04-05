const BASE = import.meta.env.VITE_API_BASE || "https://avinashmaharoliya-medi.hf.space";

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export function getPatients() {
  return request("/patients");
}

export function getStats() {
  return request("/stats");
}

export function getRecommendation(id) {
  return request(`/recommend/${id}`);
}

export function getNetwork() {
  return request("/network");
}

export function runSimulation() {
  return request("/simulate/step", {
    method: "POST",
  });
}
