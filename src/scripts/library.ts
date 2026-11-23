import { getClientT } from './client-i18n';
import { $, $$, copyText } from './utils';

const grid = $<HTMLElement>('#dataset-grid');
if (grid) {
  void getClientT().then((t) => initLibrary(t));
}

function initLibrary(t: Awaited<ReturnType<typeof getClientT>>): void {
  const gridEl = $<HTMLElement>('#dataset-grid');
  const form = $<HTMLFormElement>('#filter-form');
  const search = $<HTMLInputElement>('#library-search');
  const sort = $<HTMLSelectElement>('#library-sort');
  const resultCount = $<HTMLElement>('[data-result-count]');
  const emptyState = $<HTMLElement>('[data-empty-state]');
  const activeFilters = $<HTMLElement>('[data-active-filters]');
  const sidebar = $<HTMLElement>('#library-filters');
  const openFilters = $<HTMLButtonElement>('.js-open-filters');
  const closeFilters = $<HTMLButtonElement>('.js-close-filters');
  const filterCount = $<HTMLElement>('.js-filter-count');
  const checkboxes = $$<HTMLInputElement>('input[type="checkbox"][data-filter-group]', form ?? document);
  const clearButtons = $$<HTMLButtonElement>('.js-clear-filters');
  const copyViewButtons = $$<HTMLButtonElement>('.js-copy-view');

  if (!gridEl || !form || !search || !sort) return;
  const cards = $$<HTMLElement>('.dataset-card', gridEl);

  const attrForGroup: Record<string, string> = {
    format: 'format',
    mc: 'mc',
    mod: 'mod',
    env: 'env',
    verify: 'verify',
    task: 'task',
    dim: 'dim',
    use: 'use',
    quality: 'quality',
    license: 'license',
    size: 'sizeRange',
    access: 'access',
  };

  function checkedSelections(): Record<string, Set<string>> {
    const selections: Record<string, Set<string>> = {};
    for (const checkbox of checkboxes) {
      if (!checkbox.checked) continue;
      const key = checkbox.dataset.filterGroup || '';
      if (!key) continue;
      selections[key] ??= new Set();
      selections[key].add(checkbox.dataset.filterValue || '');
    }
    return selections;
  }

  function cardMatches(card: HTMLElement, selections: Record<string, Set<string>>, terms: string[]): boolean {
    if (terms.length) {
      const haystack = (card.dataset.search || '').toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }

    for (const [group, selected] of Object.entries(selections)) {
      if (selected.size === 0) continue;
      if (group === 'video' || group === 'events') {
        if (card.dataset[group] !== 'true') return false;
        continue;
      }
      const attr = attrForGroup[group];
      if (!attr) continue;
      const values = (card.dataset[attr] || '').split('|').filter(Boolean);
      if (!values.some((value) => selected.has(value))) return false;
    }
    return true;
  }

  function updateFilterCounts(): void {
    for (const details of $$<HTMLDetailsElement>('.filter-group[data-filter-group]')) {
      const group = details.dataset.filterGroup || '';
      const local = $$<HTMLInputElement>('input[type="checkbox"]:checked', details).length;
      const count = $<HTMLElement>(`[data-group-count="${group}"]`, details);
      if (count) {
        count.textContent = String(local);
        count.hidden = local === 0;
      }
    }

    if (filterCount) {
      const selected = checkboxes.filter((checkbox) => checkbox.checked).length;
      filterCount.textContent = selected > 0 ? String(selected) : '';
      filterCount.hidden = selected === 0;
    }
  }

  function buildActiveChips(): void {
    if (!activeFilters) return;
    activeFilters.innerHTML = '';
    const query = search?.value.trim() || '';

    if (query) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--active';
      chip.dataset.removeSearch = 'true';
      chip.innerHTML = `<span></span><span class="chip__remove" aria-hidden="true">×</span>`;
      chip.querySelector('span')!.textContent = `“${query}”`;
      chip.addEventListener('click', () => {
        if (search) search.value = '';
        applyAndSync();
      });
      activeFilters.append(chip);
    }

    for (const checkbox of checkboxes) {
      if (!checkbox.checked) continue;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--active';
      chip.dataset.removeGroup = checkbox.dataset.filterGroup || '';
      chip.dataset.removeValue = checkbox.dataset.filterValue || '';
      chip.innerHTML = '<span></span><span class="chip__remove" aria-hidden="true">×</span>';
      chip.querySelector('span')!.textContent = checkbox.dataset.filterLabel || checkbox.value;
      chip.title = t('library.activeFilters');
      chip.addEventListener('click', () => {
        checkbox.checked = false;
        applyAndSync();
      });
      activeFilters.append(chip);
    }

    updateFilterCounts();
  }

  function updateUrl(): void {
    const params = new URLSearchParams();
    const query = search?.value.trim() || '';
    if (query) params.set('q', query);

    for (const checkbox of checkboxes) {
      if (!checkbox.checked) continue;
      const group = checkbox.dataset.filterGroup || '';
      const value = checkbox.dataset.filterValue || '';
      if (!group || !value) continue;
      if (group === 'video' || group === 'events') {
        params.set(group, '1');
      } else {
        params.append(group, value);
      }
    }

    if (sort && sort.value && sort.value !== 'latest') params.set('sort', sort.value);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      history.replaceState(null, '', next);
    }
  }

  function applySort(): void {
    if (!sort) return;
    const sorted = [...cards].sort((a, b) => {
      switch (sort.value) {
        case 'updated':
          return (b.dataset.updated || '').localeCompare(a.dataset.updated || '');
        case 'likes':
          return Number(b.dataset.likes || 0) - Number(a.dataset.likes || 0);
        case 'comments':
          return Number(b.dataset.comments || 0) - Number(a.dataset.comments || 0);
        case 'size':
          return Number(b.dataset.size || 0) - Number(a.dataset.size || 0);
        case 'latest':
        default:
          return (
            (b.dataset.created || '').localeCompare(a.dataset.created || '') ||
            (b.dataset.updated || '').localeCompare(a.dataset.updated || '')
          );
      }
    });
    for (const card of sorted) gridEl!.append(card);
  }

  function apply(): void {
    const selections = checkedSelections();
    const terms = (search?.value || '')
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const matches = cardMatches(card, selections, terms);
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    applySort();
    if (resultCount) resultCount.textContent = t('library.results', { count: visible });
    if (emptyState) emptyState.classList.toggle('is-visible', visible === 0);
    buildActiveChips();
    for (const button of copyViewButtons) button.dataset.copyValue = window.location.href;
  }

  let urlTimer: number | undefined;
  function applyAndSync(): void {
    apply();
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(updateUrl, 140);
  }

  function setFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q') || '';
    if (search) search.value = query;

    for (const checkbox of checkboxes) {
      const group = checkbox.dataset.filterGroup || '';
      const value = checkbox.dataset.filterValue || '';
      const values = params.getAll(group);
      checkbox.checked = group === 'video' || group === 'events'
        ? values.includes('1')
        : values.includes(value);
    }

    const requestedSort = params.get('sort') || 'latest';
    if (sort && [...sort.options].some((option) => option.value === requestedSort)) {
      sort.value = requestedSort;
    }
  }

  form.addEventListener('change', applyAndSync);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyAndSync();
  });

  let searchTimer: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(applyAndSync, 120);
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyAndSync();
    }
  });
  sort.addEventListener('change', () => {
    apply();
    updateUrl();
  });

  for (const clearButton of clearButtons) {
    clearButton.addEventListener('click', () => {
      for (const checkbox of checkboxes) checkbox.checked = false;
      if (search) search.value = '';
      applyAndSync();
      openFilterPanel(false);
    });
  }

  for (const copyView of copyViewButtons) {
    copyView.addEventListener('click', async () => {
      updateUrl();
      await copyText(window.location.href, t('library.copiedView'), t('copy.failed'));
    });
  }

  function openFilterPanel(open: boolean): void {
    if (!sidebar) return;
    sidebar.classList.toggle('is-open', open);
    openFilters?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }

  openFilters?.addEventListener('click', () => openFilterPanel(true));
  closeFilters?.addEventListener('click', () => openFilterPanel(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar?.classList.contains('is-open')) openFilterPanel(false);
  });

  setFromUrl();
  apply();
  updateUrl();
}
