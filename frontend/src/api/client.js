/**
 * API Client for FastAPI backend.
 * All endpoints match app/main.py precisely.
 */

const BASE_URL = '/api';

export async function fetchSchema() {
  const res = await fetch(`${BASE_URL}/schema`);
  if (!res.ok) throw new Error(`Failed to load schema: ${res.statusText}`);
  return res.json();
}

export async function fetchModelInfo() {
  const res = await fetch(`${BASE_URL}/model`);
  if (!res.ok) throw new Error(`Failed to load model info: ${res.statusText}`);
  return res.json();
}

export async function fetchSampleClaims() {
  const res = await fetch(`${BASE_URL}/sample`);
  if (!res.ok) throw new Error(`Failed to load sample claims: ${res.statusText}`);
  return res.json();
}

export async function scoreSingleClaim(claimData) {
  const res = await fetch(`${BASE_URL}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim: claimData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Scoring failed');
  }
  return res.json();
}

export async function uploadBatchFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/batch`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Batch upload failed');
  }
  return res.json();
}

export async function fetchDecisions() {
  const res = await fetch(`${BASE_URL}/decisions`);
  if (!res.ok) throw new Error(`Failed to load decisions: ${res.statusText}`);
  return res.json();
}

export async function saveDecision({ claim_id, decision, note = '', score = null }) {
  const res = await fetch(`${BASE_URL}/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim_id, decision, note, score }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Saving decision failed');
  }
  return res.json();
}

export async function deleteDecision(claim_id) {
  const res = await fetch(`${BASE_URL}/decisions/${encodeURIComponent(claim_id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete decision: ${res.statusText}`);
  return res.json();
}

export const DOWNLOAD_URLS = {
  templateCsv: `${BASE_URL}/template.csv`,
  sampleCsv: `${BASE_URL}/sample.csv`,
  decisionsCsv: `${BASE_URL}/decisions.csv`,
};
