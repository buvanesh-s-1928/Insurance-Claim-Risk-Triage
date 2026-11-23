/**
 * Claim Triage — Single Page Application Logic
 * Integrates Stitch design system with FastAPI backend.
 */

(function () {
  'use strict';

  // --- Application State ---
  const state = {
    claims: [],
    modelMeta: null,
    schemaMeta: null,
    decisions: [],
    capacityPct: 10,
    activeFilter: 'All',
    searchQuery: '',
    currentPage: 1,
    pageSize: 50,
    selectedClaimIndex: -1,
    currentDecisionSelection: 'Under review',
    user: {
      name: localStorage.getItem('claim_triage_user_name') || 'Claire Vance',
      email: localStorage.getItem('claim_triage_user_email') || 'c.vance@meridian-claims.org'
    },
    tourStep: 1,
    assessDebounce: null,
  };

  // --- Utility Helpers ---
  function formatPct(val, decimals = 1) {
    if (val == null || isNaN(val)) return '0.0%';
    const pct = val <= 1 ? val * 100 : val;
    return pct.toFixed(decimals) + '%';
  }

  function getInitials(name) {
    if (!name) return 'CV';
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item pointer-events-auto px-4 py-3 rounded-lg text-xs sm:text-sm font-label flex items-center gap-2.5 shadow-2xl border transition-all ${
      type === 'success' ? 'bg-risk-low-container border-risk-low text-on-risk-low-container' :
      type === 'error' ? 'bg-risk-high-container border-risk-high text-on-risk-high-container' :
      'bg-surface-container-high border-outline text-on-surface'
    }`;

    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    toast.innerHTML = `
      <span class="material-symbols-outlined text-[18px]">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // --- Routing & View Management ---
  const views = ['landing', 'queue', 'assess', 'model', 'decisions'];

  function switchView(targetView) {
    if (!views.includes(targetView)) targetView = 'queue';

    // Update nav links
    document.querySelectorAll('.nav-pill').forEach(pill => {
      const isCurrent = pill.dataset.nav === targetView;
      pill.classList.toggle('bg-primary', isCurrent);
      pill.classList.toggle('text-on-primary', isCurrent);
      pill.classList.toggle('btn-3d-ion', isCurrent);
      pill.classList.toggle('text-midnight-muted', !isCurrent);
      pill.classList.toggle('hover:text-on-midnight', !isCurrent);
    });

    // Update view panels
    views.forEach(v => {
      const panel = document.getElementById(`${v}-view`);
      if (panel) {
        if (v === targetView) {
          panel.classList.remove('hidden');
          panel.classList.add('view-enter');
        } else {
          panel.classList.add('hidden');
          panel.classList.remove('view-enter');
        }
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Close drawer if open when switching views
    closeDrawer();
  }

  function handleHashChange() {
    const hash = window.location.hash.replace('#', '') || 'landing';
    if (hash.startsWith('claim-')) {
      const claimId = hash.replace('claim-', '');
      switchView('queue');
      openClaimDossier(claimId);
    } else {
      switchView(hash);
    }
  }

  // --- Review Capacity & Band Classification ---
  function computeRiskBand(rank, totalClaims) {
    if (totalClaims <= 0) return 'Low';
    const highCutoff = Math.max(1, Math.round(totalClaims * (state.capacityPct / 100)));
    const mediumCutoff = Math.min(totalClaims, highCutoff + Math.max(1, Math.round(totalClaims * 0.20)));

    if (rank <= highCutoff) return 'High';
    if (rank <= mediumCutoff) return 'Medium';
    return 'Low';
  }

  function updateCapacityReadouts() {
    const total = state.claims.length;
    const highCount = Math.max(1, Math.round(total * (state.capacityPct / 100)));
    const cutoffClaim = state.claims[highCount - 1];
    const cutoffScore = cutoffClaim ? formatPct(cutoffClaim.score) : '—';

    // Interpolate recall from modelMeta capacity curve or empirical rule
    let recall = '69.4%';
    if (state.modelMeta && state.modelMeta.capacity_curve) {
      const curve = state.modelMeta.capacity_curve;
      const share = state.capacityPct / 100;
      let matched = curve.find(pt => Math.abs(pt.share - share) < 0.025);
      if (!matched) {
        matched = curve.reduce((prev, curr) => Math.abs(curr.share - share) < Math.abs(prev.share - share) ? curr : prev);
      }
      if (matched) recall = `~${formatPct(matched.recall)}`;
    }

    const badge = document.getElementById('capacity-badge');
    const cutoffVal = document.getElementById('capacity-cutoff-val');
    const highCountEl = document.getElementById('capacity-high-count');
    const recallVal = document.getElementById('capacity-recall-val');
    const cutoffLine = document.getElementById('spectrum-cutoff-line');

    if (badge) badge.textContent = `${state.capacityPct}%`;
    if (cutoffVal) cutoffVal.textContent = `≥ ${cutoffScore}`;
    if (highCountEl) highCountEl.textContent = `${highCount} claim${highCount === 1 ? '' : 's'}`;
    if (recallVal) recallVal.textContent = recall;

    if (cutoffLine) {
      cutoffLine.style.left = `${state.capacityPct}%`;
    }

    // Refresh spectrum bars and queue table
    renderSpectrumBars();
    renderQueueTable();
  }

  // --- Risk Spectrum Bar Chart ---
  function renderSpectrumBars() {
    const container = document.getElementById('spectrum-bars-container');
    const tooltip = document.getElementById('spectrum-tooltip');
    if (!container) return;

    container.innerHTML = '';
    const total = state.claims.length;
    if (total === 0) return;

    const maxScore = Math.max(...state.claims.map(c => c.score), 0.01);

    // Create fragment for fast batch rendering
    const frag = document.createDocumentFragment();

    state.claims.forEach((claim, idx) => {
      const rank = idx + 1;
      const band = computeRiskBand(rank, total);
      const heightPct = Math.max(8, Math.round((claim.score / maxScore) * 100));

      const bar = document.createElement('div');
      bar.className = `flex-1 h-full flex items-end cursor-pointer group`;
      bar.dataset.claimId = claim.id;
      bar.dataset.rank = rank;
      bar.dataset.score = formatPct(claim.score);
      bar.dataset.band = band;

      const inner = document.createElement('div');
      inner.className = `w-full rounded-t-sm transition-all duration-100 group-hover:opacity-100 ${
        band === 'High' ? 'bg-risk-high group-hover:bg-risk-high-on-light' :
        band === 'Medium' ? 'bg-risk-medium group-hover:bg-amber-400' :
        'bg-risk-bar-low group-hover:bg-slate-400'
      }`;
      inner.style.height = `${heightPct}%`;

      bar.appendChild(inner);

      // Tooltip events
      bar.addEventListener('mouseenter', (e) => {
        if (!tooltip) return;
        const rect = bar.getBoundingClientRect();
        const wrapperRect = container.getBoundingClientRect();
        tooltip.innerHTML = `<strong>#${rank}</strong> ${claim.id} &bull; ${formatPct(claim.score)} (${band} Risk)`;
        tooltip.classList.remove('hidden');

        let leftPos = rect.left - wrapperRect.left - 40;
        leftPos = Math.max(5, Math.min(leftPos, wrapperRect.width - 160));
        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = '6px';
      });

      bar.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.classList.add('hidden');
      });

      bar.addEventListener('click', () => {
        openClaimDossier(claim.id);
      });

      frag.appendChild(bar);
    });

    container.appendChild(frag);
  }

  // --- Queue Table Rendering ---
  function renderQueueTable() {
    const tbody = document.getElementById('queue-table-body');
    const showingText = document.getElementById('queue-showing-text');
    const pageNumber = document.getElementById('queue-page-number');
    const prevBtn = document.getElementById('queue-prev-page');
    const nextBtn = document.getElementById('queue-next-page');

    if (!tbody) return;

    const totalClaims = state.claims.length;

    // Filter claims
    let filtered = state.claims.filter((claim, idx) => {
      const rank = idx + 1;
      const band = computeRiskBand(rank, totalClaims);

      // Band filter
      if (state.activeFilter !== 'All' && band !== state.activeFilter) {
        return false;
      }

      // Search filter
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        const matchId = claim.id.toLowerCase().includes(q);
        const matchMake = (claim.fields?.Make || '').toLowerCase().includes(q);
        const matchPolicy = (claim.fields?.PolicyType || '').toLowerCase().includes(q);
        if (!matchId && !matchMake && !matchPolicy) return false;
      }

      return true;
    });

    // Update filter counts
    const highCutoff = Math.max(1, Math.round(totalClaims * (state.capacityPct / 100)));
    const medCutoff = Math.min(totalClaims, highCutoff + Math.max(1, Math.round(totalClaims * 0.20)));

    const countAll = totalClaims;
    const countHigh = highCutoff;
    const countMed = Math.max(0, medCutoff - highCutoff);
    const countLow = Math.max(0, totalClaims - medCutoff);

    const elAll = document.getElementById('filter-count-all');
    const elHigh = document.getElementById('filter-count-high');
    const elMed = document.getElementById('filter-count-medium');
    const elLow = document.getElementById('filter-count-low');

    if (elAll) elAll.textContent = countAll;
    if (elHigh) elHigh.textContent = countHigh;
    if (elMed) elMed.textContent = countMed;
    if (elLow) elLow.textContent = countLow;

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.currentPage = Math.min(state.currentPage, totalPages);

    const startIndex = (state.currentPage - 1) * state.pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + state.pageSize);

    if (showingText) {
      showingText.textContent = `Showing ${pageItems.length ? startIndex + 1 : 0}–${startIndex + pageItems.length} of ${filtered.length} claims`;
    }
    if (pageNumber) pageNumber.textContent = `Page ${state.currentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = state.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= totalPages;

    // Render Table Rows
    tbody.innerHTML = '';
    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="py-12 text-center text-midnight-muted">
            <span class="material-symbols-outlined text-3xl mb-1">search_off</span>
            <p>No claims match the active filter or search query.</p>
          </td>
        </tr>
      `;
      return;
    }

    const frag = document.createDocumentFragment();

    pageItems.forEach(claim => {
      const originalRank = state.claims.indexOf(claim) + 1;
      const band = computeRiskBand(originalRank, totalClaims);

      // Check existing decision
      const decisionRecord = state.decisions.find(d => d.claim_id === claim.id);

      const topReason = claim.reasons && claim.reasons.length > 0
        ? `${claim.reasons[0].label}: ${claim.reasons[0].value} (${claim.reasons[0].direction === 'raises' ? '+' : ''}${(claim.reasons[0].effect * 100).toFixed(1)}%)`
        : '—';

      const tr = document.createElement('tr');
      tr.className = 'row-interactive border-b border-outline/30 hover:bg-surface-container-high/50 cursor-pointer';

      tr.innerHTML = `
        <td class="py-3 px-4 font-mono text-xs text-midnight-muted">#${originalRank}</td>
        <td class="py-3 px-4 font-mono font-bold text-ion-bright">
          <button type="button" class="underline underline-offset-2 hover:text-white focus:outline-none">${claim.id}</button>
        </td>
        <td class="py-3 px-4 font-mono font-semibold tabular-nums text-on-surface">
          <div class="flex items-center gap-2">
            <span>${formatPct(claim.score)}</span>
            <div class="w-12 h-1.5 rounded-full bg-midnight overflow-hidden hidden sm:block">
              <div class="h-full ${band === 'High' ? 'bg-risk-high' : band === 'Medium' ? 'bg-risk-medium' : 'bg-risk-bar-low'}" style="width: ${Math.min(100, claim.score * 100)}%;"></div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-xs font-label font-semibold ${
            band === 'High' ? 'bg-risk-high/20 border border-risk-high/40 text-risk-high pulse-high-risk' :
            band === 'Medium' ? 'bg-risk-medium/20 border border-risk-medium/40 text-risk-medium' :
            'bg-slate-800 text-slate-300'
          }">
            ${band}
          </span>
        </td>
        <td class="py-3 px-4 text-xs text-on-surface-variant max-w-xs truncate" title="${topReason}">
          ${topReason}
        </td>
        <td class="py-3 px-4 text-xs text-on-surface">
          ${claim.fields?.Make || '—'} <span class="text-midnight-muted">(${claim.fields?.VehicleCategory || '—'})</span>
        </td>
        <td class="py-3 px-4 text-xs font-mono">
          ${
            decisionRecord ? `
              <span class="px-2 py-0.5 rounded text-xs font-label font-semibold ${
                decisionRecord.decision === 'Escalated' ? 'bg-risk-high text-white' :
                decisionRecord.decision === 'Cleared' ? 'bg-risk-low text-white' :
                'bg-primary/20 text-ion-bright border border-ion/40'
              }">${decisionRecord.decision}</span>
            ` : '<span class="text-midnight-muted">—</span>'
          }
        </td>
        <td class="py-3 px-4 text-right">
          <button type="button" class="inspect-btn px-2.5 py-1 rounded bg-surface-container-high border border-outline hover:border-ion text-xs font-label text-on-surface hover:text-white transition-colors">
            Inspect
          </button>
        </td>
      `;

      tr.addEventListener('click', () => {
        openClaimDossier(claim.id);
      });

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  // --- Slide-Out Porcelain Claim Detail Dossier Drawer ---
  function openClaimDossier(claimId) {
    const idx = state.claims.findIndex(c => c.id === claimId);
    if (idx === -1) return;

    state.selectedClaimIndex = idx;
    const claim = state.claims[idx];
    const total = state.claims.length;
    const rank = idx + 1;
    const band = computeRiskBand(rank, total);

    // Update Header
    const idEl = document.getElementById('drawer-claim-id');
    const rankEl = document.getElementById('drawer-rank-badge');
    const shareEl = document.getElementById('drawer-top-share');
    if (idEl) idEl.textContent = `Claim ${claim.id}`;
    if (rankEl) rankEl.textContent = `Rank ${rank} of ${total}`;
    if (shareEl) shareEl.textContent = `Top ${(claim.top_share * 100).toFixed(0)}% of comparable historical claims`;

    // Update Arc Gauge
    const scoreValEl = document.getElementById('drawer-score-val');
    const bandPill = document.getElementById('drawer-band-pill');
    const gaugeArc = document.getElementById('drawer-gauge-arc');
    const compareCount = document.getElementById('drawer-compare-count');

    if (scoreValEl) scoreValEl.textContent = formatPct(claim.score);
    if (compareCount) compareCount.textContent = `${Math.round(claim.score * 100)} in 100`;

    if (bandPill) {
      bandPill.textContent = `${band} risk`;
      bandPill.className = `px-2 py-0.5 rounded-sm font-label text-xs font-semibold w-fit mt-1 ${
        band === 'High' ? 'bg-risk-high text-on-risk-high' :
        band === 'Medium' ? 'bg-risk-medium text-white' :
        'bg-risk-low text-white'
      }`;
    }

    // Semi-circle arc dashoffset animation: length is 151
    if (gaugeArc) {
      const arcLength = 151;
      const strokeVal = Math.min(1, Math.max(0, claim.score));
      const offset = arcLength * (1 - strokeVal);
      gaugeArc.style.strokeDashoffset = offset;
      gaugeArc.setAttribute('stroke', band === 'High' ? '#BE123C' : band === 'Medium' ? '#D97706' : '#059669');
    }

    // Render Diverging SHAP Driver Bars
    const reasonsList = document.getElementById('drawer-reasons-list');
    if (reasonsList) {
      reasonsList.innerHTML = '';
      if (!claim.reasons || claim.reasons.length === 0) {
        reasonsList.innerHTML = '<p class="text-on-porcelain-variant py-2">Baseline average risk profile.</p>';
      } else {
        claim.reasons.forEach(r => {
          const isRaise = r.direction === 'raises';
          const effectPct = (Math.abs(r.effect) * 100);
          const barWidth = Math.min(100, Math.max(10, effectPct * 10));

          const row = document.createElement('div');
          row.className = 'grid grid-cols-12 items-center gap-2 py-2';
          row.innerHTML = `
            <div class="col-span-5 font-body text-xs text-on-porcelain">
              ${r.label}: <span class="font-semibold">${r.value}</span>
            </div>
            <div class="col-span-4 flex items-center">
              ${isRaise ? `
                <div class="w-1/2"></div>
                <div class="w-px h-4 bg-on-porcelain-variant/30"></div>
                <div class="w-1/2 pl-1">
                  <div class="diverge-bar h-2.5 bg-risk-high rounded-sm" style="width: ${barWidth}%;"></div>
                </div>
              ` : `
                <div class="w-1/2 flex justify-end pr-1">
                  <div class="diverge-bar h-2.5 bg-risk-low rounded-sm" style="width: ${barWidth}%;"></div>
                </div>
                <div class="w-px h-4 bg-on-porcelain-variant/30"></div>
                <div class="w-1/2"></div>
              `}
            </div>
            <div class="col-span-3 text-right font-mono text-xs font-semibold tabular-nums ${isRaise ? 'text-risk-high-on-light' : 'text-risk-low-on-light'}">
              ${isRaise ? '+' : '-'}${effectPct.toFixed(1)}%
            </div>
          `;
          reasonsList.appendChild(row);
        });
      }
    }

    // Render Historical Rule Flags
    const flagsList = document.getElementById('drawer-flags-list');
    if (flagsList) {
      flagsList.innerHTML = '';
      if (!claim.flags || claim.flags.length === 0) {
        flagsList.innerHTML = `
          <div class="flex items-center gap-2 p-2.5 rounded bg-on-porcelain/5 border-l-2 border-l-emerald-500 text-xs text-on-porcelain-variant">
            <span class="material-symbols-outlined text-[16px] text-emerald-600">verified</span>
            <span>No heuristic rule triggers detected (policy age > 15 days, address unchanged > 3 years).</span>
          </div>
        `;
      } else {
        claim.flags.forEach(f => {
          const flagCard = document.createElement('div');
          flagCard.className = 'flex items-start gap-2.5 p-3 rounded bg-on-porcelain/5 border-l-2 border-l-risk-high text-xs';
          flagCard.innerHTML = `
            <span class="material-symbols-outlined text-[18px] text-risk-high mt-0.5">warning</span>
            <div class="flex flex-col gap-0.5">
              <span class="font-label font-bold text-on-porcelain">${f.title}</span>
              <span class="text-on-porcelain-variant">In past historical claims, ${formatPct(f.fraud_rate)} matching this trigger were confirmed fraud (baseline: 11.7%).</span>
            </div>
          `;
          flagsList.appendChild(flagCard);
        });
      }
    }

    // Populate Existing Decision if any
    const existingDec = state.decisions.find(d => d.claim_id === claim.id);
    const noteInput = document.getElementById('drawer-note-input');
    state.currentDecisionSelection = existingDec ? existingDec.decision : 'Under review';
    if (noteInput) noteInput.value = existingDec ? existingDec.note || '' : '';

    updateDrawerDecisionPills();

    // Populate All 22 Fields in Accordion
    const fieldsGrid = document.getElementById('drawer-fields-grid');
    if (fieldsGrid && claim.fields) {
      fieldsGrid.innerHTML = '';
      Object.entries(claim.fields).forEach(([k, v]) => {
        const item = document.createElement('div');
        item.className = 'flex justify-between py-1 border-b border-on-porcelain-variant/10';
        item.innerHTML = `
          <span class="text-on-porcelain-variant">${k}</span>
          <span class="font-mono font-medium text-on-porcelain">${v}</span>
        `;
        fieldsGrid.appendChild(item);
      });
    }

    // Prev / Next button states
    const prevBtn = document.getElementById('drawer-prev-btn');
    const nextBtn = document.getElementById('drawer-next-btn');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= total - 1;

    // Show Drawer
    const scrim = document.getElementById('drawer-scrim');
    const drawer = document.getElementById('claim-detail-drawer');
    if (scrim) {
      scrim.classList.remove('opacity-0', 'pointer-events-none');
      scrim.classList.add('opacity-100');
    }
    if (drawer) {
      drawer.classList.remove('closed');
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
  }

  function closeDrawer() {
    const scrim = document.getElementById('drawer-scrim');
    const drawer = document.getElementById('claim-detail-drawer');
    if (scrim) {
      scrim.classList.remove('opacity-100');
      scrim.classList.add('opacity-0', 'pointer-events-none');
    }
    if (drawer) {
      drawer.classList.remove('open');
      drawer.classList.add('closed');
      drawer.setAttribute('aria-hidden', 'true');
    }
    state.selectedClaimIndex = -1;
  }

  function updateDrawerDecisionPills() {
    document.querySelectorAll('.drawer-dec-btn').forEach(btn => {
      const isSelected = btn.dataset.decision === state.currentDecisionSelection;
      btn.classList.toggle('bg-primary', isSelected);
      btn.classList.toggle('text-on-primary', isSelected);
      btn.classList.toggle('btn-3d-ion', isSelected);
      btn.classList.toggle('border', !isSelected);
      btn.classList.toggle('border-on-porcelain-variant/30', !isSelected);
      btn.classList.toggle('text-on-porcelain', !isSelected);
    });
  }

  // --- Assess a Claim Console Logic ---
  function getAssessFormData() {
    const form = document.getElementById('assess-form');
    if (!form) return {};
    const formData = new FormData(form);
    const claim = {};
    for (const [key, val] of formData.entries()) {
      claim[key] = isNaN(val) || val === '' ? val : Number(val);
    }
    // ensure hidden pill inputs are included
    document.querySelectorAll('#assess-form input.assess-field').forEach(inp => {
      claim[inp.name] = isNaN(inp.value) || inp.value === '' ? inp.value : Number(inp.value);
    });
    return claim;
  }

  function setAssessFormData(data) {
    if (!data) return;
    Object.entries(data).forEach(([key, val]) => {
      // update select elements
      const select = document.querySelector(`#assess-form select[name="${key}"]`);
      if (select) select.value = String(val);

      // update hidden inputs
      const hidden = document.querySelector(`#assess-form input[name="${key}"]`);
      if (hidden) hidden.value = String(val);

      // update pill buttons visual state
      const container = document.querySelector(`[data-pill-container="${key}"]`);
      if (container) {
        container.querySelectorAll('.assess-pill').forEach(btn => {
          const match = String(btn.dataset.val) === String(val);
          btn.classList.toggle('bg-primary', match);
          btn.classList.toggle('text-on-primary', match);
          btn.classList.toggle('btn-3d-ion', match);
          btn.classList.toggle('bg-surface-container', !match);
          btn.classList.toggle('text-on-surface-variant', !match);
          btn.classList.toggle('border', !match);
          btn.classList.toggle('border-outline', !match);
        });
      }
    });

    triggerAssessScoring();
  }

  function triggerAssessScoring() {
    clearTimeout(state.assessDebounce);
    state.assessDebounce = setTimeout(async () => {
      const claimData = getAssessFormData();
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claim: claimData })
        });
        if (!res.ok) return;
        const data = await res.json();
        updateAssessResultStage(data.claim);
      } catch (err) {
        console.error('Assess scoring error:', err);
      }
    }, 120);
  }

  function updateAssessResultStage(claim) {
    if (!claim) return;
    const liveScoreEl = document.getElementById('assess-live-score');
    const liveBandEl = document.getElementById('assess-live-band');
    const liveReasonsEl = document.getElementById('assess-live-reasons');
    const liveFlagsEl = document.getElementById('assess-live-flags');

    if (liveScoreEl) liveScoreEl.textContent = formatPct(claim.score);

    const isHigh = claim.score >= 0.18;
    const isMed = claim.score >= 0.08 && claim.score < 0.18;
    const bandLabel = isHigh ? 'High risk' : isMed ? 'Medium risk' : 'Low risk';

    if (liveBandEl) {
      liveBandEl.textContent = bandLabel;
      liveBandEl.className = `px-3 py-1 rounded-sm font-label text-sm font-semibold ${
        isHigh ? 'bg-risk-high text-on-risk-high pulse-high-risk' :
        isMed ? 'bg-risk-medium text-white' :
        'bg-risk-low text-white'
      }`;
    }

    if (liveReasonsEl) {
      liveReasonsEl.innerHTML = '';
      (claim.reasons || []).forEach(r => {
        const isRaise = r.direction === 'raises';
        const effectPct = (Math.abs(r.effect) * 100);
        const barWidth = Math.min(100, Math.max(10, effectPct * 10));

        const item = document.createElement('div');
        item.className = 'grid grid-cols-12 items-center gap-2 py-2';
        item.innerHTML = `
          <div class="col-span-5 font-body text-xs text-on-porcelain truncate">
            ${r.label}: <span class="font-semibold">${r.value}</span>
          </div>
          <div class="col-span-4 flex items-center">
            ${isRaise ? `
              <div class="w-1/2"></div>
              <div class="w-px h-4 bg-on-porcelain-variant/30"></div>
              <div class="w-1/2 pl-1">
                <div class="h-2 bg-risk-high rounded-sm" style="width: ${barWidth}%;"></div>
              </div>
            ` : `
              <div class="w-1/2 flex justify-end pr-1">
                <div class="h-2 bg-risk-low rounded-sm" style="width: ${barWidth}%;"></div>
              </div>
              <div class="w-px h-4 bg-on-porcelain-variant/30"></div>
              <div class="w-1/2"></div>
            `}
          </div>
          <div class="col-span-3 text-right font-mono text-xs font-semibold tabular-nums ${isRaise ? 'text-risk-high-on-light' : 'text-risk-low-on-light'}">
            ${isRaise ? '+' : '-'}${effectPct.toFixed(1)}%
          </div>
        `;
        liveReasonsEl.appendChild(item);
      });
    }

    if (liveFlagsEl) {
      liveFlagsEl.innerHTML = '';
      if (!claim.flags || claim.flags.length === 0) {
        liveFlagsEl.innerHTML = '<span class="text-xs text-on-porcelain-variant">No rules triggered.</span>';
      } else {
        claim.flags.forEach(f => {
          const b = document.createElement('div');
          b.className = 'p-2 rounded bg-on-porcelain/5 border-l-2 border-l-risk-high text-xs text-on-porcelain font-medium';
          b.textContent = f.title;
          liveFlagsEl.appendChild(b);
        });
      }
    }
  }

  // --- Decisions Audit Ledger ---
  async function fetchDecisions() {
    try {
      const res = await fetch('/api/decisions');
      if (!res.ok) return;
      state.decisions = await res.json();
      renderDecisionsView();
      renderQueueTable(); // updates decision status column in queue
    } catch (err) {
      console.error('Failed to load decisions:', err);
    }
  }

  function renderDecisionsView(filter = 'All') {
    const tbody = document.getElementById('decisions-table-body');
    const emptyState = document.getElementById('decisions-empty-state');
    if (!tbody) return;

    // Filter
    const filtered = filter === 'All'
      ? state.decisions
      : state.decisions.filter(d => d.decision === filter);

    // Update KPI counters
    const total = state.decisions.length;
    const escalated = state.decisions.filter(d => d.decision === 'Escalated').length;
    const underReview = state.decisions.filter(d => d.decision === 'Under review').length;
    const cleared = state.decisions.filter(d => d.decision === 'Cleared').length;

    const kpiTotal = document.getElementById('dec-kpi-total');
    const kpiEsc = document.getElementById('dec-kpi-escalated');
    const kpiRev = document.getElementById('dec-kpi-review');
    const kpiClr = document.getElementById('dec-kpi-cleared');

    if (kpiTotal) kpiTotal.textContent = total;
    if (kpiEsc) kpiEsc.textContent = escalated;
    if (kpiRev) kpiRev.textContent = underReview;
    if (kpiClr) kpiClr.textContent = cleared;

    // Update filter tab counts
    const fAll = document.getElementById('dec-filter-count-all');
    const fEsc = document.getElementById('dec-filter-count-escalated');
    const fRev = document.getElementById('dec-filter-count-review');
    const fClr = document.getElementById('dec-filter-count-cleared');

    if (fAll) fAll.textContent = total;
    if (fEsc) fEsc.textContent = escalated;
    if (fRev) fRev.textContent = underReview;
    if (fClr) fClr.textContent = cleared;

    // Badge in nav
    const navBadge = document.getElementById('nav-decisions-badge');
    if (navBadge) {
      navBadge.textContent = total;
      navBadge.classList.toggle('hidden', total === 0);
    }

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    } else {
      if (emptyState) emptyState.classList.add('hidden');
    }

    const frag = document.createDocumentFragment();

    filtered.forEach(d => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-on-porcelain/5 border-b border-on-porcelain-variant/15 text-xs sm:text-sm';

      const formattedDate = d.updated ? new Date(d.updated).toLocaleString() : '—';

      tr.innerHTML = `
        <td class="py-3 px-4 font-mono font-bold text-primary">
          <button type="button" class="underline underline-offset-2 hover:text-on-porcelain focus:outline-none">${d.claim_id}</button>
        </td>
        <td class="py-3 px-4">
          <span class="inline-block px-2.5 py-0.5 rounded text-xs font-label font-semibold ${
            d.decision === 'Escalated' ? 'bg-risk-high text-white' :
            d.decision === 'Cleared' ? 'bg-risk-low text-white' :
            'bg-primary/20 text-primary border border-primary/30'
          }">
            ${d.decision}
          </span>
        </td>
        <td class="py-3 px-4 text-on-porcelain max-w-md truncate" title="${d.note || '—'}">
          ${d.note || '<span class="text-on-porcelain-variant italic">No note recorded</span>'}
        </td>
        <td class="py-3 px-4 font-mono font-semibold tabular-nums text-right text-on-porcelain">
          ${d.score != null ? formatPct(d.score) : '—'}
        </td>
        <td class="py-3 px-4 text-xs text-on-porcelain-variant tabular-nums whitespace-nowrap">
          ${formattedDate}
        </td>
        <td class="py-3 px-4 text-right">
          <button type="button" data-del-claim="${d.claim_id}" class="remove-decision-btn text-xs text-on-porcelain-variant hover:text-risk-high underline underline-offset-2">
            Remove
          </button>
        </td>
      `;

      tr.querySelector('button')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openClaimDossier(d.claim_id);
      });

      tr.querySelector('.remove-decision-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove decision for ${d.claim_id}?`)) {
          await deleteDecision(d.claim_id);
        }
      });

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  async function saveDecision(claimId, decision, note, score) {
    try {
      const res = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId, decision, note, score })
      });
      if (!res.ok) throw new Error('Save failed');

      showToast(`Decision saved for ${claimId}: ${decision}`, 'success');

      const saveStatus = document.getElementById('drawer-save-status');
      if (saveStatus) {
        saveStatus.classList.remove('hidden');
        setTimeout(() => saveStatus.classList.add('hidden'), 2200);
      }

      await fetchDecisions();
    } catch (err) {
      showToast('Failed to save decision.', 'error');
    }
  }

  async function deleteDecision(claimId) {
    try {
      const res = await fetch(`/api/decisions/${claimId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast(`Removed decision for ${claimId}`, 'info');
      await fetchDecisions();
    } catch (err) {
      showToast('Failed to delete decision.', 'error');
    }
  }

  // --- Model & Limits View Data ---
  async function loadModelMeta() {
    try {
      const res = await fetch('/api/model');
      if (!res.ok) return;
      state.modelMeta = await res.json();

      // Update KPI strip
      const recallEl = document.getElementById('model-kpi-recall');
      const praucEl = document.getElementById('model-kpi-prauc');
      const rocaucEl = document.getElementById('model-kpi-rocauc');

      if (state.modelMeta.holdout) {
        if (recallEl) recallEl.textContent = formatPct(state.modelMeta.holdout.recall10);
        if (praucEl) praucEl.textContent = state.modelMeta.holdout.pr_auc.toFixed(3);
        if (rocaucEl) rocaucEl.textContent = state.modelMeta.holdout.roc_auc.toFixed(3);
      }

      // Demographic fairness table
      const fairnessTbody = document.getElementById('fairness-table-body');
      if (fairnessTbody && state.modelMeta.fairness) {
        fairnessTbody.innerHTML = '';
        state.modelMeta.fairness.forEach(row => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-outline/30 hover:bg-surface-container-high/40 text-xs sm:text-sm';
          tr.innerHTML = `
            <td class="py-3 px-4 font-mono font-medium text-ion-bright">${row.attribute}</td>
            <td class="py-3 px-4 text-on-surface font-semibold">${row.group}</td>
            <td class="py-3 px-4 font-mono tabular-nums text-right text-midnight-muted">${row.claims.toLocaleString()}</td>
            <td class="py-3 px-4 font-mono tabular-nums text-right text-on-surface">${formatPct(row.flag_rate)}</td>
            <td class="py-3 px-4 font-mono tabular-nums text-right text-on-surface font-bold">${formatPct(row.recall)}</td>
            <td class="py-3 px-4 text-center">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-label bg-risk-low-container text-on-risk-low-container border border-risk-low/30">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Fair</span>
              </span>
            </td>
          `;
          fairnessTbody.appendChild(tr);
        });
      }

      // Interactive gains dots on capacity curve
      document.querySelectorAll('.gains-dot').forEach(dot => {
        dot.addEventListener('mouseenter', () => {
          const label = dot.dataset.label;
          const readout = document.getElementById('gains-readout');
          if (readout && label) readout.textContent = label;
        });
      });

    } catch (err) {
      console.error('Failed to load model meta:', err);
    }
  }

  // --- Sample & CSV Batch Loading ---
  async function loadSampleBatch() {
    try {
      showToast('Loading 400 sample claims batch...', 'info');
      const res = await fetch('/api/sample');
      if (!res.ok) throw new Error('Sample fetch failed');
      const data = await res.json();
      state.claims = data.claims || [];

      const batchLabel = document.getElementById('nav-batch-label');
      if (batchLabel) batchLabel.textContent = `Batch: Sample ${state.claims.length}`;

      updateCapacityReadouts();
      showToast(`Loaded ${state.claims.length} claims successfully.`, 'success');
    } catch (err) {
      showToast('Failed to load sample claims batch.', 'error');
    }
  }

  async function handleCsvUpload(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      showToast(`Scoring ${file.name}...`, 'info');
      const res = await fetch('/api/batch', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Batch upload failed');
      }
      const data = await res.json();
      state.claims = data.claims || [];

      const batchLabel = document.getElementById('nav-batch-label');
      if (batchLabel) batchLabel.textContent = `Batch: ${file.name} (${state.claims.length})`;

      updateCapacityReadouts();
      showToast(`Successfully scored ${state.claims.length} claims from ${file.name}.`, 'success');
      switchView('queue');
    } catch (err) {
      showToast(err.message || 'Error uploading CSV.', 'error');
    }
  }

  // --- Guided 4-Step Tutorial Modal ---
  const tourSteps = [
    {
      badge: 'Step 1 of 4 — Introduction',
      title: '1. Load Incoming Claims',
      desc: 'Start by uploading any claim intake CSV or loading our standard 400 sample claims batch. The ML model automatically scores and ranks every claim from riskiest to safest.',
      previewHtml: `
        <div class="flex items-center justify-between border-b border-on-porcelain-variant/20 pb-2">
          <span class="font-headline font-bold text-sm text-on-porcelain">Claims Queue</span>
          <span class="font-mono text-[11px] text-on-porcelain-variant">400 Claims Available</span>
        </div>
        <p class="text-on-porcelain-variant text-xs">High rank indicates prioritized review order; claims are never automatically rejected.</p>
        <div class="flex items-center gap-2 pt-2">
          <span class="px-3 py-1.5 rounded bg-primary text-white text-xs font-semibold">Load Sample 400</span>
          <span class="px-3 py-1.5 rounded border border-on-porcelain-variant/30 text-xs">Upload CSV</span>
        </div>
      `
    },
    {
      badge: 'Step 2 of 4 — Capacity',
      title: '2. Dynamic Capacity Slicing',
      desc: 'Use the review capacity slider (1%–50%) to slice the queue according to your team\'s investigation bandwidth. The top 10% slice captures roughly 70% of all fraud.',
      previewHtml: `
        <div class="flex items-center justify-between border-b border-on-porcelain-variant/20 pb-2">
          <span class="font-headline font-bold text-sm text-on-porcelain">Review Capacity: 10%</span>
          <span class="font-mono font-bold text-risk-high text-xs">High Cutoff ≥ 18.5%</span>
        </div>
        <div class="w-full h-3 bg-midnight rounded-full overflow-hidden flex">
          <div class="bg-risk-high h-full w-[10%]"></div>
          <div class="bg-risk-medium h-full w-[20%]"></div>
          <div class="bg-risk-bar-low h-full w-[70%]"></div>
        </div>
        <p class="text-on-porcelain-variant text-xs pt-1">40 claims fall into High risk band &bull; ~69.4% expected fraud capture.</p>
      `
    },
    {
      badge: 'Step 3 of 4 — Explainability',
      title: '3. Inspect SHAP Drivers & Rules',
      desc: 'Click on any claim in the spectrum or table to slide open its Porcelain Dossier. Inspect diverging SHAP bars showing which features increased or decreased the score, alongside historical heuristic flags.',
      previewHtml: `
        <div class="flex items-center justify-between border-b border-on-porcelain-variant/20 pb-2">
          <span class="font-headline font-bold text-sm text-on-porcelain">Claim C-06315</span>
          <span class="px-2 py-0.5 rounded bg-risk-high text-white text-[10px] font-bold">22.7% High Risk</span>
        </div>
        <div class="flex flex-col gap-1 py-1">
          <div class="flex justify-between text-[11px]"><span>Base cover: All Perils</span><span class="text-risk-high font-bold">+6.4%</span></div>
          <div class="flex justify-between text-[11px]"><span>Days to accident: 8-15</span><span class="text-risk-high font-bold">+3.9%</span></div>
          <div class="flex justify-between text-[11px]"><span>Police report filed: Yes</span><span class="text-risk-low font-bold">-2.1%</span></div>
        </div>
      `
    },
    {
      badge: 'Step 4 of 4 — Decisions',
      title: '4. Forensic Audit Trail',
      desc: 'Select an audit decision (Under review, Cleared, Escalated), record your clinical rationale note, and save. All actions are logged into a permanent forensic ledger with 1-click CSV download.',
      previewHtml: `
        <div class="flex items-center gap-2 pb-2 border-b border-on-porcelain-variant/20">
          <span class="px-2.5 py-1 rounded bg-primary text-white font-semibold text-xs">Under review</span>
          <span class="px-2.5 py-1 rounded border border-on-porcelain-variant/30 text-xs">Cleared</span>
          <span class="px-2.5 py-1 rounded border border-on-porcelain-variant/30 text-xs">Escalated</span>
        </div>
        <p class="text-on-porcelain-variant text-xs italic">"Verified address discrepancy with utility bills; requesting shop invoice."</p>
        <span class="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
          <span class="material-symbols-outlined text-[14px]">check</span>
          Saved to Decisions Ledger
        </span>
      `
    }
  ];

  function openTour(step = 1) {
    state.tourStep = step;
    updateTourUI();
    const modal = document.getElementById('tour-modal-scrim');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function closeTour() {
    const modal = document.getElementById('tour-modal-scrim');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  function updateTourUI() {
    const s = tourSteps[state.tourStep - 1];
    if (!s) return;

    const badge = document.getElementById('tour-step-badge');
    const title = document.getElementById('tour-step-title');
    const desc = document.getElementById('tour-step-desc');
    const preview = document.getElementById('tour-step-preview');
    const backBtn = document.getElementById('tour-back-btn');
    const nextBtn = document.getElementById('tour-next-btn');

    if (badge) badge.textContent = s.badge;
    if (title) title.textContent = s.title;
    if (desc) desc.textContent = s.desc;
    if (preview) preview.innerHTML = s.previewHtml;

    if (backBtn) backBtn.disabled = state.tourStep <= 1;
    if (nextBtn) {
      nextBtn.textContent = state.tourStep === 4 ? 'Finish Tour & Open Queue' : 'Next Step';
    }
  }

  // --- Auth Modal & User Profile ---
  function openAuthModal() {
    const modal = document.getElementById('auth-modal-scrim');
    const nameInp = document.getElementById('auth-name-input');
    const emailInp = document.getElementById('auth-email-input');

    if (nameInp) nameInp.value = state.user.name;
    if (emailInp) emailInp.value = state.user.email;

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function closeAuthModal() {
    const modal = document.getElementById('auth-modal-scrim');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  function updateUserData(name, email) {
    state.user.name = name || 'Claire Vance';
    state.user.email = email || 'c.vance@meridian-claims.org';
    localStorage.setItem('claim_triage_user_name', state.user.name);
    localStorage.setItem('claim_triage_user_email', state.user.email);

    const displayName = document.getElementById('user-display-name');
    const mobileName = document.getElementById('mobile-user-name');
    const initials = document.getElementById('user-avatar-initials');

    if (displayName) displayName.textContent = state.user.name;
    if (mobileName) mobileName.textContent = state.user.name;
    if (initials) initials.textContent = getInitials(state.user.name);
  }

  // --- Setup Event Listeners ---
  function initEventListeners() {
    // Hash routing
    window.addEventListener('hashchange', handleHashChange);

    // Mobile nav toggle
    const railToggle = document.getElementById('mobile-rail-toggle');
    const railContent = document.getElementById('mobile-rail-content');
    if (railToggle && railContent) {
      railToggle.addEventListener('click', () => {
        const isHidden = railContent.classList.toggle('hidden');
        railContent.classList.toggle('flex', !isHidden);
        railToggle.setAttribute('aria-expanded', String(!isHidden));
      });
    }

    // Capacity Slider
    const slider = document.getElementById('capacity-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        state.capacityPct = parseInt(e.target.value, 10);
        updateCapacityReadouts();
      });
    }

    // Queue Filter Buttons
    document.querySelectorAll('.queue-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeFilter = btn.dataset.filter;
        document.querySelectorAll('.queue-filter-btn').forEach(b => {
          const active = b === btn;
          b.classList.toggle('bg-primary', active);
          b.classList.toggle('text-on-primary', active);
          b.classList.toggle('btn-3d-ion', active);
          b.classList.toggle('text-midnight-muted', !active);
        });
        state.currentPage = 1;
        renderQueueTable();
      });
    });

    // Queue Search
    const searchInput = document.getElementById('queue-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        state.currentPage = 1;
        renderQueueTable();
      });
    }

    // Queue Pagination buttons
    document.getElementById('queue-prev-page')?.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderQueueTable();
      }
    });

    document.getElementById('queue-next-page')?.addEventListener('click', () => {
      state.currentPage++;
      renderQueueTable();
    });

    // Queue Load Sample & Upload CSV
    document.getElementById('queue-load-sample-btn')?.addEventListener('click', loadSampleBatch);

    const fileInput = document.getElementById('csv-file-input');
    document.getElementById('queue-upload-csv-btn')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCsvUpload(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Drawer Prev / Next / Close
    document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
    document.getElementById('drawer-scrim')?.addEventListener('click', closeDrawer);

    document.getElementById('drawer-prev-btn')?.addEventListener('click', () => {
      if (state.selectedClaimIndex > 0) {
        openClaimDossier(state.claims[state.selectedClaimIndex - 1].id);
      }
    });

    document.getElementById('drawer-next-btn')?.addEventListener('click', () => {
      if (state.selectedClaimIndex < state.claims.length - 1) {
        openClaimDossier(state.claims[state.selectedClaimIndex + 1].id);
      }
    });

    // Drawer Decision buttons
    document.querySelectorAll('.drawer-dec-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentDecisionSelection = btn.dataset.decision;
        updateDrawerDecisionPills();
      });
    });

    // Drawer Decision Form Submit
    document.getElementById('drawer-decision-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.selectedClaimIndex === -1) return;
      const claim = state.claims[state.selectedClaimIndex];
      const note = document.getElementById('drawer-note-input')?.value.trim() || '';
      await saveDecision(claim.id, state.currentDecisionSelection, note, claim.score);
    });

    // Assess Tabs
    document.querySelectorAll('.assess-group-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const group = tab.dataset.group;
        document.querySelectorAll('.assess-group-tab').forEach(t => {
          const active = t === tab;
          t.classList.toggle('bg-primary', active);
          t.classList.toggle('text-on-primary', active);
          t.classList.toggle('btn-3d-ion', active);
          t.classList.toggle('bg-surface-container', !active);
          t.classList.toggle('text-on-surface-variant', !active);
        });

        document.querySelectorAll('.assess-panel').forEach(p => {
          p.classList.toggle('hidden', p.dataset.groupPanel !== group);
          p.classList.toggle('flex', p.dataset.groupPanel === group);
        });
      });
    });

    // Assess Pill buttons
    document.querySelectorAll('.assess-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.parentElement;
        const fieldName = parent.dataset.pillContainer;
        const val = btn.dataset.val;

        // update hidden input
        const hidden = document.querySelector(`#assess-form input[name="${fieldName}"]`);
        if (hidden) hidden.value = val;

        // update visual selection
        parent.querySelectorAll('.assess-pill').forEach(b => {
          const match = b === btn;
          b.classList.toggle('bg-primary', match);
          b.classList.toggle('text-on-primary', match);
          b.classList.toggle('btn-3d-ion', match);
          b.classList.toggle('bg-surface-container', !match);
          b.classList.toggle('text-on-surface-variant', !match);
        });

        triggerAssessScoring();
      });
    });

    // Assess Select field change
    document.querySelectorAll('#assess-form select').forEach(select => {
      select.addEventListener('change', triggerAssessScoring);
    });

    // Assess Presets
    document.getElementById('assess-fill-high-btn')?.addEventListener('click', () => {
      setAssessFormData({
        BasePolicy: 'All Perils',
        Deductible: 400,
        PolicyType: 'Sedan - All Perils',
        AgentType: 'External',
        'AddressChange-Claim': 'under 6 months',
        NumberOfCars: '1 vehicle',
        VehicleCategory: 'Sedan',
        Make: 'Accura',
        VehiclePrice: 'more than 69000',
        AgeOfVehicle: 'new',
        PastNumberOfClaims: '2 to 4',
        'Days:Policy-Accident': '8 to 15',
        AccidentArea: 'Urban',
        Month: 'Oct',
        DayOfWeek: 'Friday',
        WeekOfMonth: 3,
        PoliceReportFiled: 'No',
        WitnessPresent: 'No',
        'Days:Policy-Claim': '8 to 15',
        MonthClaimed: 'Oct',
        DayOfWeekClaimed: 'Monday',
        WeekOfMonthClaimed: 4
      });
      showToast('Populated high-risk archetype profile', 'info');
    });

    document.getElementById('assess-fill-low-btn')?.addEventListener('click', () => {
      setAssessFormData({
        BasePolicy: 'Liability',
        Deductible: 500,
        PolicyType: 'Sedan - Liability',
        AgentType: 'Internal',
        'AddressChange-Claim': 'no change',
        NumberOfCars: '2 vehicles',
        VehicleCategory: 'Sedan',
        Make: 'Toyota',
        VehiclePrice: '20000 to 29000',
        AgeOfVehicle: '5 years',
        PastNumberOfClaims: 'none',
        'Days:Policy-Accident': 'more than 30',
        AccidentArea: 'Rural',
        Month: 'Jun',
        DayOfWeek: 'Wednesday',
        WeekOfMonth: 2,
        PoliceReportFiled: 'Yes',
        WitnessPresent: 'Yes',
        'Days:Policy-Claim': 'more than 30',
        MonthClaimed: 'Jun',
        DayOfWeekClaimed: 'Thursday',
        WeekOfMonthClaimed: 2
      });
      showToast('Populated low-risk archetype profile', 'info');
    });

    document.getElementById('assess-reset-btn')?.addEventListener('click', () => {
      if (state.schemaMeta && state.schemaMeta.defaults) {
        setAssessFormData(state.schemaMeta.defaults);
        showToast('Reset fields to baseline values', 'info');
      }
    });

    // Assess Record Decision CTA
    document.getElementById('assess-record-decision-btn')?.addEventListener('click', () => {
      const claimData = getAssessFormData();
      const tempId = `ASSESS-${Math.floor(1000 + Math.random() * 9000)}`;
      const liveScore = parseFloat(document.getElementById('assess-live-score')?.textContent || '15') / 100;
      saveDecision(tempId, 'Under review', 'Assessed custom profile via interactive console', liveScore);
    });

    // Decisions Filter Tabs
    document.querySelectorAll('.dec-filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const filter = tab.dataset.decFilter;
        document.querySelectorAll('.dec-filter-tab').forEach(t => {
          const match = t === tab;
          t.classList.toggle('border-primary', match);
          t.classList.toggle('text-primary', match);
          t.classList.toggle('border-transparent', !match);
          t.classList.toggle('text-on-porcelain-variant', !match);
        });
        renderDecisionsView(filter);
      });
    });

    // Tour Triggers & Buttons
    document.getElementById('open-tour-btn')?.addEventListener('click', () => openTour(1));
    document.getElementById('mobile-tour-btn')?.addEventListener('click', () => openTour(1));
    document.getElementById('landing-tour-trigger')?.addEventListener('click', () => openTour(1));
    document.getElementById('tour-close-btn')?.addEventListener('click', closeTour);

    document.getElementById('tour-back-btn')?.addEventListener('click', () => {
      if (state.tourStep > 1) {
        state.tourStep--;
        updateTourUI();
      }
    });

    document.getElementById('tour-next-btn')?.addEventListener('click', () => {
      if (state.tourStep < 4) {
        state.tourStep++;
        updateTourUI();
      } else {
        closeTour();
        switchView('queue');
      }
    });

    // Auth Modal Triggers
    document.getElementById('auth-btn')?.addEventListener('click', openAuthModal);
    document.getElementById('mobile-auth-btn')?.addEventListener('click', openAuthModal);
    document.getElementById('auth-modal-close')?.addEventListener('click', closeAuthModal);

    document.getElementById('auth-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('auth-name-input')?.value.trim();
      const email = document.getElementById('auth-email-input')?.value.trim();
      updateUserData(name, email);
      closeAuthModal();
      showToast(`Investigator profile updated to ${name}`, 'success');
    });

    // Keyboard navigation (Esc closes drawer & modal)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        closeTour();
        closeAuthModal();
      }
    });
  }

  // --- Bootstrap Application ---
  async function init() {
    updateUserData(state.user.name, state.user.email);
    initEventListeners();

    // Fetch schema, model metadata and decisions concurrently
    try {
      const [schemaRes] = await Promise.all([
        fetch('/api/schema'),
        loadModelMeta(),
        fetchDecisions()
      ]);
      if (schemaRes.ok) {
        state.schemaMeta = await schemaRes.json();
      }
    } catch (err) {
      console.error('Initialization error:', err);
    }

    // Auto-load sample batch so queue is immediately filled with 400 claims
    await loadSampleBatch();

    // Handle initial hash
    handleHashChange();

    // Trigger initial assess score
    triggerAssessScoring();
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
