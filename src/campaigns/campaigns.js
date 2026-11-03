/**
 * HIGHVERZ — Campaign Breakdowns Module
 * Premium editorial movie campaign intelligence experience.
 * GSAP-powered animations, TMDB API integration, cinematic modal.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  getPopularMovies,
  getTrendingMovies,
  getMovieDetails,
  getMovieCredits,
  getMovieVideos,
  searchMovies,
  fetchBackendMovies,
  getPosterUrl,
  getBackdropUrl,
  extractYear,
  formatRuntime,
  formatRating,
  formatGenres,
  getDirector,
  getTopCast,
  getBestTrailer,
  isApiKeyConfigured
} from '../services/tmdb.js';
import {
  getCampaignData,
  hasCampaignData,
  getFeaturedMovieIds,
  getCampaignLabel
} from './campaignData.js';
import { browserCache } from '../services/cache.js';

gsap.registerPlugin(ScrollTrigger);

// ─── Genre Map for TMDB ID Lookups ───
const GENRE_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
};

// ─── Filter Constants ───
const GENRES = [
  { id: 'all', name: 'All Genres' },
  { id: '28', name: 'Action' },
  { id: '878', name: 'Sci-Fi' },
  { id: '18', name: 'Drama' },
  { id: '35', name: 'Comedy' },
  { id: '53', name: 'Thriller' },
  { id: '27', name: 'Horror' },
  { id: '12', name: 'Adventure' },
  { id: '16', name: 'Animation' },
  { id: '80', name: 'Crime' },
  { id: '14', name: 'Fantasy' },
  { id: '10749', name: 'Romance' },
  { id: '9648', name: 'Mystery' },
  { id: '99', name: 'Documentary' },
  { id: '36', name: 'History' }
];

const YEARS = [
  { id: 'all', name: 'All Years' },
  { id: '2025', name: '2025' },
  { id: '2024', name: '2024' },
  { id: '2023', name: '2023' },
  { id: '2022', name: '2022' },
  { id: '2021', name: '2021' },
  { id: '2020', name: '2020' },
  { id: '2019', name: '2019' },
  { id: '2015-2018', name: '2015–2018' },
  { id: '2010-2014', name: '2010–2014' },
  { id: '2000-2009', name: '2000s' },
  { id: 'pre-2000', name: 'Classics' }
];

const SORT_OPTIONS = [
  { id: 'popularity.desc', name: 'Most Popular' },
  { id: 'vote_average.desc', name: 'Highest Rated' },
  { id: 'primary_release_date.desc', name: 'Newest Releases' },
  { id: 'campaigns', name: 'Featured Campaigns' }
];

// Campaign metadata changes infrequently. Keep it in the browser cache long
// enough that navigating away and back does not refetch the same catalogue or
// dossier, while the API's stale-while-revalidate headers keep it fresh.
const CAMPAIGN_DOSSIER_CACHE_TTL = 60 * 60 * 1000;

// ─── State ───
const state = {
  page: 1,
  limit: 12,
  query: '',
  filter: 'all',
  genre: 'all',
  year: 'all',
  sortBy: 'popularity.desc',
  totalPages: 1,
  totalResults: 0,
  isLoading: false,
  abortController: null,
  searchDebounceTimer: null
};

let currentMovies = [];
let modalOpen = false;
let pendingMovieFocus = null;

/**
 * Initialize the campaigns page.
 */
export function initCampaignsPage(isFromTransition = false) {
  const pageContent = document.getElementById('page-content');
  if (pageContent?.dataset.campaignsInitialized === 'true') return;
  if (pageContent) pageContent.dataset.campaignsInitialized = 'true';

  // Home movie case studies link here with ?movie=... . Keep the normal
  // catalogue/search flow, then open the exact matching dossier once its
  // result is available.
  const requestedMovie = new URLSearchParams(window.location.search).get('movie')?.trim() || '';
  pendingMovieFocus = requestedMovie || null;
  state.page = 1;
  state.query = requestedMovie;
  state.genre = 'all';
  state.year = 'all';
  state.sortBy = 'popularity.desc';

  animateHero(isFromTransition);
  initSearch();
  initFilters();
  const searchInput = document.getElementById('campaign-search-input');
  if (searchInput && requestedMovie) searchInput.value = requestedMovie;
  renderActiveTags();
  loadMovies();
  setupModal();
}

// ==========================================================================
// HERO ANIMATIONS
// ==========================================================================
function animateHero(isFromTransition = false) {
  const campaignHero = document.querySelector('.campaign-hero');
  if (!campaignHero) return;
  campaignHero.dataset.heroAnimated = 'true';
  // Note: Hero headline word-by-word reveal followed by supporting components entrance
  // (tags, pillars, search console, cards) is centrally coordinated by triggerPageHeroEntrance
  // in main.js to guarantee the exact reveal hierarchy on both direct loads and transitions.
}

// ==========================================================================
// SEARCH WITH PROPER DEBOUNCING & ABORTION
// ==========================================================================
function initSearch() {
  const input = document.getElementById('campaign-search-input');
  const clearBtn = document.getElementById('campaign-search-clear');
  const spinner = document.getElementById('campaign-search-spinner');
  if (!input) return;

  const triggerSearch = (immediate = false) => {
    const rawVal = input.value;
    const query = rawVal.trim();

    if (clearBtn) {
      clearBtn.classList.toggle('visible', rawVal.length > 0);
    }

    clearTimeout(state.searchDebounceTimer);

    if (immediate) {
      if (spinner) spinner.classList.add('active');
      state.query = query;
      state.page = 1;
      loadMovies();
      return;
    }

    // Visual debounce feedback
    if (query.length >= 2 && spinner) {
      spinner.classList.add('active');
    }

    // 350ms Debounce Delay
    state.searchDebounceTimer = setTimeout(() => {
      if (query.length >= 2) {
        state.query = query;
        state.page = 1;
        loadMovies();
      } else if (query.length === 0 && state.query !== '') {
        state.query = '';
        state.page = 1;
        loadMovies();
      } else {
        if (spinner) spinner.classList.remove('active');
      }
    }, 350);
  };

  input.addEventListener('input', () => {
    triggerSearch(false);
    renderActiveTags();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch(true);
      renderActiveTags();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = '';
      if (clearBtn) clearBtn.classList.remove('visible');
      if (spinner) spinner.classList.remove('active');
      clearTimeout(state.searchDebounceTimer);
      if (state.query !== '') {
        state.query = '';
        state.page = 1;
        renderActiveTags();
        loadMovies();
      }
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.remove('visible');
      if (spinner) spinner.classList.remove('active');
      clearTimeout(state.searchDebounceTimer);
      state.query = '';
      state.page = 1;
      renderActiveTags();
      loadMovies();
    });
  }
}

// ==========================================================================
// GLASSMORPHIC FILTER DROPDOWNS & ACTIVE TAGS
// ==========================================================================
function initFilters() {
  const genrePopover = document.getElementById('genre-dropdown-popover');
  const yearPopover = document.getElementById('year-dropdown-popover');
  const sortPopover = document.getElementById('sort-dropdown-popover');

  const genreTrigger = document.getElementById('genre-dropdown-trigger');
  const yearTrigger = document.getElementById('year-dropdown-trigger');
  const sortTrigger = document.getElementById('sort-dropdown-trigger');

  const genreOptions = document.getElementById('genre-options-container');
  const yearOptions = document.getElementById('year-options-container');
  const sortOptions = document.getElementById('sort-options-container');

  const resetBtn = document.getElementById('campaign-reset-btn');
  const CHECK_SVG_HTML = '<span class="glass-option-check"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 5"/></svg></span>';

  // Populate Genre Options
  if (genreOptions) {
    genreOptions.innerHTML = GENRES.map(g => `
      <button type="button" class="glass-option-item ${state.genre === g.id ? 'is-selected' : ''}" data-value="${g.id}">
        <span class="glass-option-name">${escapeHtml(g.name)}</span>
        ${state.genre === g.id ? CHECK_SVG_HTML : ''}
      </button>
    `).join('');

    genreOptions.querySelectorAll('.glass-option-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-value');
        setGenre(val);
        closeAllDropdowns();
        state.page = 1;
        loadMovies(true);
      });
    });
  }

  // Populate Year Options
  if (yearOptions) {
    yearOptions.innerHTML = YEARS.map(y => `
      <button type="button" class="glass-option-item ${state.year === y.id ? 'is-selected' : ''}" data-value="${y.id}">
        <span class="glass-option-name">${escapeHtml(y.name)}</span>
        ${state.year === y.id ? CHECK_SVG_HTML : ''}
      </button>
    `).join('');

    yearOptions.querySelectorAll('.glass-option-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-value');
        setYear(val);
        closeAllDropdowns();
        state.page = 1;
        loadMovies(true);
      });
    });
  }

  // Populate Sort Options
  if (sortOptions) {
    sortOptions.innerHTML = SORT_OPTIONS.map(s => `
      <button type="button" class="glass-option-item ${state.sortBy === s.id ? 'is-selected' : ''}" data-value="${s.id}">
        <span class="glass-option-name">${escapeHtml(s.name)}</span>
        ${state.sortBy === s.id ? CHECK_SVG_HTML : ''}
      </button>
    `).join('');

    sortOptions.querySelectorAll('.glass-option-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-value');
        setSort(val);
        closeAllDropdowns();
        state.page = 1;
        loadMovies(true);
      });
    });
  }

  // Isolate scroll containers from Lenis and parent scroll hijacking
  [genrePopover, yearPopover, sortPopover].forEach(p => {
    if (!p) return;
    p.setAttribute('data-lenis-prevent', 'true');
    p.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });
    p.addEventListener('touchmove', (e) => {
      e.stopPropagation();
    }, { passive: true });
  });

  [genreOptions, yearOptions, sortOptions].forEach(opt => {
    if (!opt) return;
    opt.setAttribute('data-lenis-prevent', 'true');
    opt.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });
    opt.addEventListener('touchmove', (e) => {
      e.stopPropagation();
    }, { passive: true });
  });

  function closeAllDropdowns() {
    [genrePopover, yearPopover, sortPopover].forEach(p => {
      if (p) p.classList.remove('is-open');
    });
    [genreTrigger, yearTrigger, sortTrigger].forEach(t => {
      if (t) {
        t.setAttribute('aria-expanded', 'false');
        t.closest('.glass-dropdown')?.classList.remove('is-open');
      }
    });
    document.getElementById('campaign-glass-console')?.classList.remove('has-open-dropdown');
  }

  function toggleDropdown(trigger, popover) {
    if (!trigger || !popover) return;
    const isOpen = popover.classList.contains('is-open');
    closeAllDropdowns();
    if (!isOpen) {
      popover.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      trigger.closest('.glass-dropdown')?.classList.add('is-open');
      document.getElementById('campaign-glass-console')?.classList.add('has-open-dropdown');

      // Ensure the currently active item is visible in the scroll container
      const selected = popover.querySelector('.glass-option-item.is-selected');
      if (selected) {
        requestAnimationFrame(() => {
          selected.scrollIntoView({ block: 'nearest' });
        });
      }
    }
  }

  if (genreTrigger) {
    genreTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(genreTrigger, genrePopover);
    });
  }

  if (yearTrigger) {
    yearTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(yearTrigger, yearPopover);
    });
  }

  if (sortTrigger) {
    sortTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(sortTrigger, sortPopover);
    });
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.glass-dropdown')) {
      closeAllDropdowns();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdowns();
    }
  });

  // Close open dropdowns on page scroll
  window.addEventListener('scroll', () => {
    if (genrePopover?.classList.contains('is-open') || 
        yearPopover?.classList.contains('is-open') || 
        sortPopover?.classList.contains('is-open')) {
      closeAllDropdowns();
    }
  }, { passive: true });

  if (window.lenis) {
    window.lenis.on('scroll', () => {
      if (genrePopover?.classList.contains('is-open') || 
          yearPopover?.classList.contains('is-open') || 
          sortPopover?.classList.contains('is-open')) {
        closeAllDropdowns();
      }
    });
  }

  // Global Reset Button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      setGenre('all');
      setYear('all');
      setSort('popularity.desc');
      state.query = '';
      const inp = document.getElementById('campaign-search-input');
      if (inp) inp.value = '';
      const clr = document.getElementById('campaign-search-clear');
      if (clr) clr.classList.remove('visible');
      closeAllDropdowns();
      state.page = 1;
      renderActiveTags();
      loadMovies(true);
    });
  }
}

function setGenre(genreId) {
  state.genre = genreId;
  const label = document.getElementById('genre-current-label');
  const trigger = document.getElementById('genre-dropdown-trigger');
  const dot = document.getElementById('genre-active-indicator') || document.getElementById('genre-active-dot');
  const gObj = GENRES.find(g => g.id === genreId);

  if (label) {
    label.textContent = genreId === 'all' ? 'Genre' : (gObj ? gObj.name : 'Genre');
  }
  if (trigger) {
    trigger.classList.toggle('is-active', genreId !== 'all');
  }
  if (dot) {
    dot.classList.toggle('visible', genreId !== 'all');
  }

  document.querySelectorAll('#genre-options-container .glass-option-item').forEach(el => {
    const isMatch = el.getAttribute('data-value') === genreId;
    el.classList.toggle('is-selected', isMatch);
    let check = el.querySelector('.glass-option-check');
    if (isMatch && !check) {
      const c = document.createElement('span');
      c.className = 'glass-option-check';
      c.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 5"/></svg>';
      el.appendChild(c);
    } else if (!isMatch && check) {
      check.remove();
    }
  });

  renderActiveTags();
}

function setYear(yearId) {
  state.year = yearId;
  const label = document.getElementById('year-current-label');
  const trigger = document.getElementById('year-dropdown-trigger');
  const dot = document.getElementById('year-active-indicator') || document.getElementById('year-active-dot');
  const yObj = YEARS.find(y => y.id === yearId);

  if (label) {
    label.textContent = yearId === 'all' ? 'Year' : (yObj ? yObj.name : 'Year');
  }
  if (trigger) {
    trigger.classList.toggle('is-active', yearId !== 'all');
  }
  if (dot) {
    dot.classList.toggle('visible', yearId !== 'all');
  }

  document.querySelectorAll('#year-options-container .glass-option-item').forEach(el => {
    const isMatch = el.getAttribute('data-value') === yearId;
    el.classList.toggle('is-selected', isMatch);
    let check = el.querySelector('.glass-option-check');
    if (isMatch && !check) {
      const c = document.createElement('span');
      c.className = 'glass-option-check';
      c.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 5"/></svg>';
      el.appendChild(c);
    } else if (!isMatch && check) {
      check.remove();
    }
  });

  renderActiveTags();
}

function setSort(sortId) {
  state.sortBy = sortId;
  const label = document.getElementById('sort-current-label');
  const trigger = document.getElementById('sort-dropdown-trigger');
  const dot = document.getElementById('sort-active-indicator') || document.getElementById('sort-active-dot');
  const sObj = SORT_OPTIONS.find(s => s.id === sortId);

  if (label) {
    label.textContent = sortId === 'popularity.desc' ? 'Sort' : (sObj ? sObj.name : 'Sort');
  }
  if (trigger) {
    trigger.classList.toggle('is-active', sortId !== 'popularity.desc');
  }
  if (dot) {
    dot.classList.toggle('visible', sortId !== 'popularity.desc');
  }

  document.querySelectorAll('#sort-options-container .glass-option-item').forEach(el => {
    const isMatch = el.getAttribute('data-value') === sortId;
    el.classList.toggle('is-selected', isMatch);
    let check = el.querySelector('.glass-option-check');
    if (isMatch && !check) {
      const c = document.createElement('span');
      c.className = 'glass-option-check';
      c.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 5"/></svg>';
      el.appendChild(c);
    } else if (!isMatch && check) {
      check.remove();
    }
  });

  renderActiveTags();
}

function renderActiveTags() {
  const container = document.getElementById('campaign-active-tags');
  const resetBtn = document.getElementById('campaign-reset-btn');
  if (!container) return;

  const tags = [];

  if (state.query) {
    tags.push({ type: 'query', label: `Search: "${state.query}"`, key: 'query' });
  }

  if (state.genre !== 'all') {
    const g = GENRES.find(item => item.id === state.genre);
    if (g) tags.push({ type: 'genre', label: `Genre: ${g.name}`, key: 'genre' });
  }

  if (state.year !== 'all') {
    const y = YEARS.find(item => item.id === state.year);
    if (y) tags.push({ type: 'year', label: `Year: ${y.name}`, key: 'year' });
  }

  if (state.sortBy !== 'popularity.desc') {
    const s = SORT_OPTIONS.find(item => item.id === state.sortBy);
    if (s) tags.push({ type: 'sortBy', label: `Sort: ${s.name}`, key: 'sortBy' });
  }

  const hasAnyFilter = tags.length > 0;
  if (resetBtn) {
    resetBtn.classList.toggle('is-active', hasAnyFilter);
  }

  if (!hasAnyFilter) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = tags.map(t => `
    <span class="campaign-tag-pill" data-filter-type="${t.type}">
      <span>${escapeHtml(t.label)}</span>
      <button type="button" class="campaign-tag-remove" data-remove="${t.key}" aria-label="Remove filter ${escapeHtml(t.label)}">✕</button>
    </span>
  `).join('');

  container.querySelectorAll('.campaign-tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.getAttribute('data-remove');
      if (key === 'query') {
        state.query = '';
        const inp = document.getElementById('campaign-search-input');
        if (inp) inp.value = '';
        const clr = document.getElementById('campaign-search-clear');
        if (clr) clr.classList.remove('visible');
      } else if (key === 'genre') {
        setGenre('all');
      } else if (key === 'year') {
        setYear('all');
      } else if (key === 'sortBy') {
        setSort('popularity.desc');
      }
      state.page = 1;
      loadMovies(true);
    });
  });
}

function getFilterContextText() {
  const parts = [];
  if (state.year !== 'all') {
    const yObj = YEARS.find(y => y.id === state.year);
    if (yObj) parts.push(yObj.name);
  }
  if (state.genre !== 'all') {
    const gObj = GENRES.find(g => g.id === state.genre);
    if (gObj) parts.push(gObj.name);
  }
  if (state.sortBy !== 'popularity.desc') {
    const sObj = SORT_OPTIONS.find(s => s.id === state.sortBy);
    if (sObj) parts.push(`(${sObj.name})`);
  }
  return parts.length ? ` · ${parts.join(' ')}` : '';
}

// ==========================================================================
// LOAD MOVIES (BACKEND PAGINATED WITH EXACT LIMIT & FILTERS)
// ==========================================================================
async function loadMovies(scrollToGrid = false) {
  const grid = document.getElementById('campaign-grid');
  const label = document.getElementById('campaign-featured-label');
  const spinner = document.getElementById('campaign-search-spinner');
  const pagination = document.getElementById('campaign-pagination');
  if (!grid) return;

  // Abort previous in-flight request
  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();
  const { signal } = state.abortController;

  state.isLoading = true;
  if (spinner) spinner.classList.add('active');

  // Only show skeletons on initial empty load to avoid jarring card flashes
  if (grid.querySelectorAll('.campaign-movie-card, .campaign-card').length === 0) {
    renderSkeletons(grid, state.limit);
  }

  if (state.query) {
    if (label) label.innerHTML = `Searching for <span>"${escapeHtml(state.query)}"</span>${escapeHtml(getFilterContextText())}...`;
  }

  try {
    const data = await fetchBackendMovies({
      page: state.page,
      limit: state.limit,
      query: state.query,
      filter: state.filter,
      genre: state.genre,
      year: state.year,
      sortBy: state.sortBy,
      signal
    });

    state.totalPages = data.total_pages || 1;
    state.totalResults = data.total_results || 0;
    currentMovies = data.results || [];

    if (currentMovies.length === 0) {
      if (state.query || state.genre !== 'all' || state.year !== 'all') {
        const filterDesc = [state.query ? `"${state.query}"` : '', getFilterContextText().replace(/^ · /, '')].filter(Boolean).join(' in ');
        renderEmptyState(
          grid,
          'No movies found',
          `We couldn't find any movies matching ${filterDesc || 'your selection'}. Try adjusting your search query, genre, or release year.`
        );
        if (label) label.innerHTML = `0 results for <span>${escapeHtml(filterDesc || 'selected filters')}</span>`;
      } else {
        renderEmptyState(
          grid,
          'No campaigns loaded',
          'Ensure the backend server is running and your TMDB credentials are set.'
        );
      }
      if (pagination) {
        pagination.innerHTML = '';
        pagination.style.display = 'none';
      }
    } else {
      renderMovieCards(grid, currentMovies);

      const filterContext = getFilterContextText();
      if (state.query) {
        if (label) {
          label.innerHTML = `${state.totalResults} results for <span>"${escapeHtml(state.query)}"</span>${escapeHtml(filterContext)} ${state.totalPages > 1 ? `· Page ${state.page} of ${state.totalPages}` : ''}`;
        }
      } else if (filterContext) {
        if (label) {
          label.innerHTML = `Showing <span>${escapeHtml(filterContext.replace(/^ · /, ''))}</span> Movies · ${state.totalResults} found ${state.totalPages > 1 ? `· Page ${state.page} of ${state.totalPages}` : ''}`;
        }
      } else {
        if (label) {
          label.innerHTML = `Featured <span>Campaign Breakdowns</span> & Trending Movies ${state.totalPages > 1 ? `· Page ${state.page} of ${state.totalPages}` : ''}`;
        }
      }

      renderPagination(pagination, state);

      if (pendingMovieFocus) {
        const requested = pendingMovieFocus.toLowerCase();
        const exactMatch = currentMovies.find((movie) =>
          String(movie.title || '').trim().toLowerCase() === requested
        );
        const partialMatch = currentMovies.find((movie) =>
          String(movie.title || '').toLowerCase().includes(requested) || requested.includes(String(movie.title || '').toLowerCase())
        );
        // Never open an unrelated result when a title cannot be resolved. The
        // filtered catalogue remains visible so the user can choose the exact
        // film instead.
        const targetMovie = exactMatch || partialMatch;
        pendingMovieFocus = null;
        if (targetMovie?.id) {
          window.setTimeout(() => openMovieModal(targetMovie.id), 0);
        }
      }

      if (scrollToGrid) {
        const gridTop = document.querySelector('.campaign-grid-section');
        if (gridTop) {
          gridTop.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // Intentionally aborted by newer search stroke
      return;
    }
    console.error('[Campaigns] Load error:', err);
    renderEmptyState(grid, 'Unable to Load Movies', 'Backend service unavailable. Please check your connection.');
    if (pagination) {
      pagination.innerHTML = '';
      pagination.style.display = 'none';
    }
  } finally {
    state.isLoading = false;
    if (spinner) spinner.classList.remove('active');
  }
}

// ==========================================================================
// RENDER MOVIE CARDS
// ==========================================================================
function renderMovieCards(container, movies) {
  container.innerHTML = movies.map(movie => {
    const poster = getPosterUrl(movie.poster_path);
    const year = extractYear(movie.release_date);
    const rating = formatRating(movie.vote_average);

    let genres = '—';
    if (movie.genres && Array.isArray(movie.genres)) {
      genres = formatGenres(movie.genres, 2);
    } else if (movie.genre_ids && Array.isArray(movie.genre_ids) && movie.genre_ids.length > 0) {
      genres = movie.genre_ids.slice(0, 2).map(id => GENRE_MAP[id] || '').filter(Boolean).join(' · ');
      if (!genres) genres = '—';
    }

    const hasAnalysis = movie.hasCampaign !== undefined ? movie.hasCampaign : hasCampaignData(movie.id);

    return `
      <article class="campaign-movie-card" data-movie-id="${movie.id}" data-cursor="EXPLORE">
        <div class="campaign-card-image-wrap">
          ${poster
            ? `<img src="${poster}" alt="${escapeHtml(movie.title)}" class="campaign-card-image" loading="lazy" />`
            : `<div class="campaign-card-image" style="background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:2rem;">🎬</div>`
          }
          <div class="campaign-card-overlay"></div>
          <div class="campaign-card-info">
            <h3 class="campaign-card-title">${escapeHtml(movie.title)}</h3>
            <div class="campaign-card-meta">
              <span>${year}</span>
              ${genres && genres !== '—' ? `<span class="campaign-card-meta-dot"></span><span>${genres}</span>` : ''}
              <span class="campaign-card-meta-dot"></span>
              <span class="campaign-card-rating">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                ${rating}
              </span>
            </div>
            <div class="campaign-card-cta">
              ${hasAnalysis ? 'View Breakdown' : 'Explore'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Animate cards in with subtle, stable reveal
  const cards = container.querySelectorAll('.campaign-movie-card');
  gsap.killTweensOf(cards);
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const themeSettledEntrance = isMobile &&
    document.querySelector('.campaign-hero')?.dataset.entrySettledByTheme === 'true';
  if (!themeSettledEntrance) {
    gsap.from(cards, {
      opacity: 0,
      y: isMobile ? 0 : 12,
      duration: isMobile ? 0.35 : 0.45,
      stagger: isMobile ? 0.02 : 0.03,
      ease: 'power2.out',
      clearProps: isMobile ? 'opacity' : 'transform,opacity',
      overwrite: 'auto',
    });
  }

  // Attach click handlers
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.movieId, 10);
      openMovieModal(id);
    });
  });
}

// ==========================================================================
// PAGINATION CONTROLS
// ==========================================================================
function renderPagination(container, pState) {
  if (!container) return;

  if (pState.totalResults === 0 || pState.totalPages <= 1) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  const { page, totalPages, limit, totalResults } = pState;
  const startCount = (page - 1) * limit + 1;
  const endCount = Math.min(page * limit, totalResults);

  // Generate smart page numbers with ellipsis
  const pages = [];
  const delta = 1;
  const left = page - delta;
  const right = page + delta + 1;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i < right)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  const pagesHtml = pages.map(p => {
    if (p === '...') {
      return `<span class="campaign-page-ellipsis">…</span>`;
    }
    const isActive = p === page;
    return `
      <button
        class="campaign-page-num ${isActive ? 'active' : ''}"
        data-page="${p}"
        aria-label="Page ${p}"
        data-cursor="CLICK"
        ${isActive ? 'aria-current="page"' : ''}
      >
        ${p}
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="campaign-pagination-inner">
      <div class="campaign-pagination-info">
        Showing <span>${startCount}–${endCount}</span> of <span>${totalResults}</span> titles
      </div>
      <div class="campaign-pagination-controls">
        <button
          class="campaign-page-nav campaign-page-prev"
          ${page <= 1 ? 'disabled' : ''}
          data-page="${page - 1}"
          aria-label="Previous page"
          data-cursor="CLICK"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          <span>Prev</span>
        </button>

        <div class="campaign-page-numbers">
          ${pagesHtml}
        </div>

        <button
          class="campaign-page-nav campaign-page-next"
          ${page >= totalPages ? 'disabled' : ''}
          data-page="${page + 1}"
          aria-label="Next page"
          data-cursor="CLICK"
        >
          <span>Next</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  `;

  // Attach click events
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPage = parseInt(btn.dataset.page, 10);
      if (targetPage && targetPage !== page && targetPage >= 1 && targetPage <= totalPages) {
        state.page = targetPage;
        loadMovies(true);
      }
    });
  });
}

function renderSkeletons(container, count) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="campaign-skeleton">
      <div class="campaign-skeleton-image"></div>
      <div class="campaign-skeleton-body">
        <div class="campaign-skeleton-line"></div>
        <div class="campaign-skeleton-line"></div>
      </div>
    </div>
  `).join('');
}

function renderEmptyState(container, title, desc) {
  container.innerHTML = `
    <div class="campaign-empty-state">
      <div class="campaign-empty-icon">🎬</div>
      <h3 class="campaign-empty-title">${title}</h3>
      <p class="campaign-empty-desc">${desc}</p>
    </div>
  `;
}

// ==========================================================================
// MOVIE DETAIL MODAL & TRAILER PLAYER
// ==========================================================================
let trailerModalOpen = false;

function setupModal() {
  const backdrop = document.getElementById('campaign-modal-backdrop');
  const closeBtn = document.getElementById('campaign-modal-close');
  const trailerBackdrop = document.getElementById('campaign-trailer-backdrop');
  const trailerCloseBtn = document.getElementById('campaign-trailer-close');
  if (!backdrop) return;

  // Prevent wheel/touch events inside modal from being captured or cancelled by Lenis/window
  backdrop.addEventListener('wheel', (e) => {
    e.stopPropagation();
  }, { passive: true });

  backdrop.addEventListener('touchmove', (e) => {
    e.stopPropagation();
  }, { passive: true });

  // Close modal on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeMovieModal();
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMovieModal);
  }

  // Trailer modal listeners
  if (trailerBackdrop) {
    trailerBackdrop.addEventListener('click', (e) => {
      if (e.target === trailerBackdrop) closeTrailerModal();
    });
  }
  if (trailerCloseBtn) {
    trailerCloseBtn.addEventListener('click', closeTrailerModal);
  }

  // ESC key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (trailerModalOpen) {
        closeTrailerModal();
      } else if (modalOpen) {
        closeMovieModal();
      }
    }
  });
}

function openTrailerModal(trailerKey) {
  const trailerBackdrop = document.getElementById('campaign-trailer-backdrop');
  const trailerContainer = document.getElementById('campaign-trailer-container');
  if (!trailerBackdrop || !trailerContainer || !trailerKey) return;

  trailerModalOpen = true;
  trailerContainer.innerHTML = `
    <iframe
      src="https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1"
      title="Official Trailer"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  `;
  trailerBackdrop.classList.add('is-open');
}

function closeTrailerModal() {
  const trailerBackdrop = document.getElementById('campaign-trailer-backdrop');
  const trailerContainer = document.getElementById('campaign-trailer-container');
  if (!trailerBackdrop) return;

  trailerModalOpen = false;
  trailerBackdrop.classList.remove('is-open');
  if (trailerContainer) {
    trailerContainer.innerHTML = '';
  }
}

async function openMovieModal(movieId) {
  const backdrop = document.getElementById('campaign-modal-backdrop');
  const modalContent = document.getElementById('campaign-modal-content');
  if (!backdrop || !modalContent) return;

  modalOpen = true;

  // Lock outer window scroll cleanly
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  if (window.lenis) {
    try { window.lenis.stop(); } catch (_) {}
  }

  // Reset modal scroll position to top
  backdrop.scrollTop = 0;

  // 1. Check browser-level cache for instant dossier rendering (zero network delay)
  const cacheKey = `movie_dossier_${movieId}`;
  const cachedDossier = browserCache.get(cacheKey);

  if (cachedDossier && cachedDossier.details) {
    const campaign = getCampaignData(movieId);
    renderModalContent(modalContent, cachedDossier.details, cachedDossier.credits, cachedDossier.videos, campaign);
    backdrop.scrollTop = 0;
    backdrop.classList.add('is-open');
    attachModalInteractiveHandlers(modalContent, cachedDossier.videos, cachedDossier.details);
    initModalCalculator(modalContent, cachedDossier.details);
    requestAnimationFrame(() => animateModalSections());
    return;
  }

  // Show luxury loading state
  modalContent.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:75vh;gap:1.25rem;">
      <div class="campaign-search-spinner active" style="position:static;display:block;width:36px;height:36px;margin:0;border-width:3px;"></div>
      <div style="color:var(--text-muted);font-family:var(--font-body);font-size:0.85rem;letter-spacing:0.1em;text-transform:uppercase;">Assembling campaign dossier...</div>
    </div>
  `;

  // Reveal modal backdrop
  backdrop.classList.add('is-open');

  try {
    let details = null;
    let credits = null;
    let videos = null;

    try {
      const response = await fetch(`/api/movies/${movieId}`);
      if (response.ok) {
        const json = await response.json();
        if (json.success && json.movie) {
          details = json.movie;
          credits = json.movie.credits || { cast: [], crew: [] };
          videos = json.movie.videos || { results: [] };
        }
      }
    } catch (_) {}

    if (!details) {
      const [fDetails, fCredits, fVideos] = await Promise.all([
        getMovieDetails(movieId),
        getMovieCredits(movieId),
        getMovieVideos(movieId)
      ]);
      details = fDetails;
      credits = fCredits;
      videos = fVideos;
    }

    const campaign = getCampaignData(movieId);
    renderModalContent(modalContent, details, credits, videos, campaign);

    // Save to browser cache (campaign dossiers are stable and safe to reuse).
    if (details) {
      browserCache.set(cacheKey, { details, credits, videos }, CAMPAIGN_DOSSIER_CACHE_TTL);
    }

    // Ensure scroll starts at the absolute top
    backdrop.scrollTop = 0;

    // Attach interactive buttons (trailer player & request buttons)
    attachModalInteractiveHandlers(modalContent, videos, details);
    initModalCalculator(modalContent, details);

    // Animate modal sections after render
    requestAnimationFrame(() => {
      animateModalSections();
    });
  } catch (err) {
    console.error('[Campaigns] Modal load error:', err);
    modalContent.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
        <div style="text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
          <div style="color:var(--text-primary);font-size:1.1rem;font-weight:700;">Failed to load movie dossier</div>
          <div style="color:var(--text-muted);font-size:0.85rem;margin-top:0.5rem;">Check your connection and try again.</div>
        </div>
      </div>
    `;
  }
}

function closeMovieModal() {
  const backdrop = document.getElementById('campaign-modal-backdrop');
  if (!backdrop) return;

  modalOpen = false;
  backdrop.classList.remove('is-open');

  // Restore outer window scroll
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  if (window.lenis) {
    try { window.lenis.start(); } catch (_) {}
  }
}

function formatMoney(amount) {
  if (!amount || amount <= 0) return 'Undisclosed';
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatBudgetShorthand(amount) {
  if (!amount || amount <= 0) return '$80M';
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) {
    const val = amount / 1e6;
    return Number.isInteger(val) ? `$${val}M` : `$${val.toFixed(1)}M`;
  }
  if (amount >= 1e3) return `$${Math.round(amount / 1e3)}K`;
  return `$${Math.round(amount).toLocaleString()}`;
}

function formatViewsShorthand(views) {
  if (views >= 1e9) {
    const val = views / 1e9;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)}B+`;
  }
  if (views >= 1e6) {
    const val = views / 1e6;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)}M+`;
  }
  if (views >= 1e3) {
    return `${Math.round(views / 1e3)}K+`;
  }
  return `${Math.round(views)}+`;
}

function formatPostsShorthand(posts) {
  if (posts >= 1e6) {
    return `${(posts / 1e6).toFixed(1)}M+`;
  }
  if (posts >= 1e3) {
    const val = posts / 1e3;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)}K+`;
  }
  return `${Math.round(posts)}+`;
}

function renderDistributionCalculator(movie) {
  let prodBudget = movie.budget;
  let isEstimated = false;
  if (!prodBudget || prodBudget <= 0) {
    if (movie.revenue && movie.revenue > 0) {
      prodBudget = Math.max(30000000, Math.round(movie.revenue * 0.35));
    } else {
      prodBudget = 100000000;
    }
    isEstimated = true;
  }

  const prodBudgetStr = formatBudgetShorthand(prodBudget);
  const revStr = formatBudgetShorthand(movie.revenue || (prodBudget * 2.5));
  const defaultPct = 1.15;
  const initialBudget = prodBudget * (defaultPct / 100);
  const initialPosts = Math.round(initialBudget / 40);
  const initialViews = initialBudget * 1000;

  const isHit = movie.revenue && prodBudget && movie.revenue >= prodBudget * 2.2;
  const outcomeText = isHit
    ? `grossed ${revStr} on a ${prodBudgetStr} budget. A box office success.`
    : `grossed ${revStr} on a ${prodBudgetStr} budget. A box office miss.`;

  return `
    <!-- DISTRIBUTION BUDGET CALCULATOR -->
    <div class="modal-calculator-section" id="modal-calculator-section">
      <div class="modal-calc-container">
        <div class="modal-calc-left">
          <div class="modal-section-tag" style="margin-bottom:0.25rem;">Attention Economics & Distribution</div>
          <h3 class="modal-calc-headline">
            They spent ${prodBudgetStr} making it.<br/>
            <span style="color:var(--accent-cyan);text-shadow:0 0 35px rgba(35,199,216,0.35);">But not enough marketing it.</span>
          </h3>
          <p class="modal-calc-subtext">
            ${escapeHtml(movie.title)} ${outcomeText} Put even 1% of that production budget into Highverz and the opening weekend looks completely different.
          </p>
          <a href="index.html#contact" class="modal-hero-btn-primary" style="margin-top:0.75rem; width:fit-content; text-decoration:none;" data-cursor="ACTION">
            <span>Get Your Playbook</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </a>
        </div>

        <div class="modal-calc-card">
          <div class="modal-calc-budget-header">
            <div>
              <div class="modal-calc-label">Production Budget ${isEstimated ? '(Est.)' : ''}</div>
              <div class="modal-calc-prod-budget">${prodBudgetStr}</div>
            </div>
            <div class="modal-calc-pct-badge">1.15 %</div>
          </div>

          <div class="modal-calc-slider-wrap">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
              <span class="modal-calc-label" style="font-size:0.78rem;color:rgba(255,255,255,0.85);">% Allocated to Highverz</span>
              <span style="font-family:var(--font-body);font-size:0.75rem;color:var(--text-muted);">Benchmark: 1.0% – 5.0%</span>
            </div>
            <input 
              type="range" 
              class="modal-calc-range" 
              min="0.20" 
              max="6.00" 
              step="0.05" 
              value="1.15" 
              aria-label="Percentage allocated to Highverz distribution"
            />
          </div>

          <div class="modal-calc-stats-grid">
            <div class="modal-calc-stat-box">
              <span class="modal-calc-stat-lbl">Budget</span>
              <span class="modal-calc-stat-val calc-val-budget">${formatBudgetShorthand(initialBudget)}</span>
            </div>
            <div class="modal-calc-stat-box">
              <span class="modal-calc-stat-lbl">Posts</span>
              <span class="modal-calc-stat-val calc-val-posts">${formatPostsShorthand(initialPosts)}</span>
            </div>
            <div class="modal-calc-stat-box">
              <span class="modal-calc-stat-lbl">Views</span>
              <span class="modal-calc-stat-val calc-val-views" style="color:var(--accent-cyan);">${formatViewsShorthand(initialViews)}</span>
            </div>
            <div class="modal-calc-stat-box">
              <span class="modal-calc-stat-lbl">CPM</span>
              <span class="modal-calc-stat-val">$1.00</span>
            </div>
          </div>

          <div class="modal-calc-callout">
            Box office gross: <strong>${revStr}</strong> on a <strong>${prodBudgetStr}</strong> budget. The film found its audience ${isHit ? 'partially through standard media and word-of-mouth' : 'eventually through word of mouth'}. Highverz would've made that happen before the credits rolled on opening night.
          </div>
        </div>
      </div>
    </div>

    <!-- CREATIVE CONTENT FORMATS PILLARS -->
    <div class="modal-formats-section">
      <div class="modal-formats-header">
        <div class="modal-section-tag">Highverz Content Distribution</div>
        <h3 class="modal-formats-headline">We don't promote films. We turn them into conversations.</h3>
        <p style="font-family:var(--font-body);font-size:0.95rem;color:var(--text-secondary);max-width:680px;margin-top:0.75rem;line-height:1.65;">
          Traditional trailer drops get passively viewed. Highverz content formats get clipped, debated, and shared organically across millions of algorithmic FYP feeds.
        </p>
      </div>

      <div class="modal-formats-grid">
        <div class="modal-format-card">
          <div class="modal-format-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="9" y1="9" x2="15" y2="9"/>
              <line x1="9" y1="13" x2="13" y2="13"/>
            </svg>
          </div>
          <h4 class="modal-format-title">Monologue Moments</h4>
          <p class="modal-format-desc">
            Isolated dialogue scenes with emotional weight, the kind that stop the scroll and drive intense comment section debates.
          </p>
        </div>

        <div class="modal-format-card">
          <div class="modal-format-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="m16 3 4 4-4 4"/>
              <path d="M20 7H4"/>
              <path d="m8 21-4-4 4-4"/>
              <path d="M4 17h16"/>
            </svg>
          </div>
          <h4 class="modal-format-title">Plot Twist Teasers</h4>
          <p class="modal-format-desc">
            Clips that cut right before the reveal. Driving comments, saves, and uncontrollable "I need to watch this now" behavior.
          </p>
        </div>

        <div class="modal-format-card">
          <div class="modal-format-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          </div>
          <h4 class="modal-format-title">Sonic Hooks & Memes</h4>
          <p class="modal-format-desc">
            Isolating soundtrack motifs and audio punches into original TikTok & Reel sounds, turning dialogue into viral cultural trends.
          </p>
        </div>

        <div class="modal-format-card">
          <div class="modal-format-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
              <line x1="7" y1="2" x2="7" y2="22"/>
              <line x1="17" y1="2" x2="17" y2="22"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <line x1="2" y1="7" x2="7" y2="7"/>
              <line x1="2" y1="17" x2="7" y2="17"/>
              <line x1="17" y1="17" x2="22" y2="17"/>
              <line x1="17" y1="7" x2="22" y2="7"/>
            </svg>
          </div>
          <h4 class="modal-format-title">Culture-First Screenings</h4>
          <p class="modal-format-desc">
            Creator-exclusive preview experiences engineered to generate organic reaction reels and surge opening night ticket sales.
          </p>
        </div>
      </div>
    </div>
  `;
}

function initModalCalculator(container, movie) {
  const slider = container.querySelector('.modal-calc-range');
  const pctBadge = container.querySelector('.modal-calc-pct-badge');
  const budgetVal = container.querySelector('.calc-val-budget');
  const postsVal = container.querySelector('.calc-val-posts');
  const viewsVal = container.querySelector('.calc-val-views');
  if (!slider) return;

  // Resolve base production budget
  let prodBudget = movie.budget;
  if (!prodBudget || prodBudget <= 0) {
    if (movie.revenue && movie.revenue > 0) {
      prodBudget = Math.max(30000000, Math.round(movie.revenue * 0.35));
    } else {
      prodBudget = 100000000;
    }
  }

  const updateCalc = () => {
    const pct = parseFloat(slider.value);
    const min = parseFloat(slider.min) || 0.2;
    const max = parseFloat(slider.max) || 6.0;
    const pctPos = ((pct - min) / (max - min)) * 100;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const unselectedTrack = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)';
    slider.style.background = `linear-gradient(to right, #23c7d8 0%, #23c7d8 ${pctPos}%, ${unselectedTrack} ${pctPos}%, ${unselectedTrack} 100%)`;

    if (pctBadge) pctBadge.textContent = `${pct.toFixed(2)} %`;

    const allocatedBudget = prodBudget * (pct / 100);
    const postsCount = Math.round(allocatedBudget / 40); // ~$40 per high-impact creator post
    const viewsCount = allocatedBudget * 1000; // $1.00 CPM benchmark -> 1000 views per $1

    if (budgetVal) budgetVal.textContent = formatBudgetShorthand(allocatedBudget);
    if (postsVal) postsVal.textContent = formatPostsShorthand(postsCount);
    if (viewsVal) viewsVal.textContent = formatViewsShorthand(viewsCount);
  };

  slider.addEventListener('input', updateCalc);
  updateCalc();
}

function generateAutomatedStrategy(movie) {
  const genres = (movie.genres || []).map(g => g.name || '');
  const hasG = (name) => genres.some(g => g.toLowerCase().includes(name.toLowerCase()));

  let audience = 'Global Theatrical & Streaming Audiences, 18–45 Cultural Trendsetters';
  let hook = 'Visual Spectacle & Narrative Momentum';
  let platformMix = [
    { platform: 'TikTok & Short-Form Video', share: '35%', strategy: 'Viral soundbite clips, character dialogue hooks, and UGC reactions' },
    { platform: 'YouTube & Cinematic Drops', share: '30%', strategy: 'High-definition trailers, behind-the-scenes craft reels, and director breakdown interviews' },
    { platform: 'Creator & VIP Screenings', share: '20%', strategy: 'Early access screenings for film critics and niche culture creators' },
    { platform: 'Digital PR & Out-of-Home', share: '15%', strategy: 'High-impact editorial features and premiere red-carpet livestream events' }
  ];

  if (hasG('Animation') || hasG('Family')) {
    audience = 'Multi-Generational Families, Co-Viewing Audiences, Animation Enthusiasts (All Ages)';
    hook = 'Emotional Heart & Character-Driven Brand Affinity';
    platformMix[0].share = '40%';
    platformMix[0].strategy = 'Wholesome character memes, family trend audio, and interactive filters';
  } else if (hasG('Horror') || hasG('Thriller')) {
    audience = 'Gen Z & Millennials (16–30), Experiential Jump-Scare Enthusiasts, Horror Community';
    hook = 'Visceral Dread, Mystery-Box Trailers, and Social Challenge Momentum';
    platformMix[0].share = '45%';
    platformMix[0].strategy = 'Dark teaser drops, influencer theater reaction cameras, and nighttime viral challenges';
  } else if (hasG('Sci-Fi') || hasG('Fantasy') || hasG('Adventure')) {
    audience = 'World-Building Cinephiles, Franchise Lore Enthusiasts, Premium Format Theatrical Goers (IMAX/Dolby)';
    hook = 'Immersive Mythos, Visual FX Mastery, and Event Theatrical Urgency';
    platformMix[1].share = '35%';
    platformMix[1].strategy = 'VFX process breakdowns, world map teasers, and Dolby/IMAX experiential promos';
  } else if (hasG('Action') || hasG('War')) {
    audience = 'Mass Commercial Spectacle Audiences, 18–49 Demographic, Global Action Fans';
    hook = 'Stunt Authenticity, High-Stakes Set Pieces, and Adrenaline-Pumping Audio';
  }

  return { audience, hook, platformMix };
}

// ==========================================================================
// RENDER MODAL CONTENT
// ==========================================================================
function renderModalContent(container, movie, credits, videos, campaign) {
  const backdrop = getBackdropUrl(movie.backdrop_path);
  const year = extractYear(movie.release_date);
  const runtime = formatRuntime(movie.runtime);
  const rating = formatRating(movie.vote_average);

  let genres = 'Cinema';
  if (movie.genres && Array.isArray(movie.genres) && movie.genres.length > 0) {
    genres = movie.genres.map(g => g.name).slice(0, 3).join(' · ');
  } else if (movie.genre_ids && Array.isArray(movie.genre_ids) && movie.genre_ids.length > 0) {
    genres = movie.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 3).join(' · ') || 'Cinema';
  }

  const director = getDirector(credits);
  const trailer = getBestTrailer(videos);
  const topCast = getTopCast(credits, 6);

  // Financial Metrics
  const boxOfficeStr = formatMoney(movie.revenue);
  const budgetStr = formatMoney(movie.budget);
  let multiplierStr = 'Theatrical Release';
  if (movie.revenue && movie.budget && movie.budget > 0) {
    const mult = (movie.revenue / movie.budget).toFixed(2);
    multiplierStr = `${mult}x Box Office Multiple`;
  }

  const studios = (movie.production_companies || []).slice(0, 2).map(c => c.name).join(', ') || 'Independent Studio';

  let html = '';

  // ─── 1. HERO SECTION ───
  html += `
    <div class="modal-hero">
      ${backdrop ? `<img src="${backdrop}" alt="${escapeHtml(movie.title)}" class="modal-hero-backdrop" />` : ''}
      <div class="modal-hero-gradient"></div>
      <div class="modal-hero-content">
        <div class="modal-hero-meta">
          <span class="modal-hero-meta-item">${year}</span>
          <span class="modal-hero-meta-dot"></span>
          <span class="modal-hero-meta-item">${genres}</span>
          <span class="modal-hero-meta-dot"></span>
          <span class="modal-hero-meta-item">${runtime}</span>
          <span class="modal-hero-meta-dot"></span>
          <span class="modal-hero-rating">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${rating}
          </span>
          ${director !== '—' ? `<span class="modal-hero-meta-dot"></span><span class="modal-hero-meta-item">Dir. ${escapeHtml(director)}</span>` : ''}
        </div>

        <h2 class="modal-hero-title">${escapeHtml(movie.title)}</h2>

        ${movie.tagline ? `<p class="modal-hero-tagline">“${escapeHtml(movie.tagline)}”</p>` : ''}

        <p class="modal-hero-overview">${escapeHtml(movie.overview || 'Comprehensive film analysis and distribution dossier curated by Highverz.')}</p>

        <div class="modal-hero-actions">
          ${trailer ? `
            <button class="modal-hero-btn-primary btn-play-trailer" data-trailer-key="${trailer.key}" data-cursor="PLAY">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg>
              <span class="modal-btn-label"><span>Watch Official Trailer</span><span aria-hidden="true">Watch Official Trailer</span></span>
            </button>
          ` : ''}

          <button class="modal-hero-btn-secondary" onclick="document.getElementById('modal-calculator-section').scrollIntoView({behavior:'smooth'})" data-cursor="SCROLL">
            <span class="modal-btn-label"><span>Budget Calculator</span><span aria-hidden="true">Budget Calculator</span></span><span class="modal-btn-arrow" aria-hidden="true">↓</span>
          </button>

          ${campaign ? `
            <button class="modal-hero-btn-secondary" onclick="document.getElementById('modal-campaign-analysis').scrollIntoView({behavior:'smooth'})" data-cursor="SCROLL">
              <span class="modal-btn-label"><span>Marketing Strategy</span><span aria-hidden="true">Marketing Strategy</span></span><span class="modal-btn-arrow" aria-hidden="true">↓</span>
            </button>
          ` : `
            <button class="modal-hero-btn-secondary" onclick="document.getElementById('modal-intelligence-section').scrollIntoView({behavior:'smooth'})" data-cursor="SCROLL">
              <span class="modal-btn-label"><span>Distribution Intelligence</span><span aria-hidden="true">Distribution Intelligence</span></span><span class="modal-btn-arrow" aria-hidden="true">↓</span>
            </button>
          `}
        </div>
      </div>
    </div>
  `;

  // ─── 2. COMMERCIAL & PRODUCTION METRICS ───
  html += `
    <div class="modal-section" id="modal-metrics-section">
      <div class="modal-section-tag">Market Performance</div>
      <h3 class="modal-section-title">Commercial & Distribution Metrics</h3>
      <div class="modal-metrics-grid">
        <div class="modal-metric-card">
          <span class="modal-metric-label">Worldwide Box Office</span>
          <span class="modal-metric-value">${boxOfficeStr}</span>
          <span class="modal-metric-sub">Global Gross Revenue</span>
        </div>

        <div class="modal-metric-card">
          <span class="modal-metric-label">Production Budget</span>
          <span class="modal-metric-value">${budgetStr}</span>
          <span class="modal-metric-sub">Declared Physical Budget</span>
        </div>

        <div class="modal-metric-card">
          <span class="modal-metric-label">Commercial Velocity</span>
          <span class="modal-metric-value">${multiplierStr}</span>
          <span class="modal-metric-sub">Audience Rating: ${rating} / 10</span>
        </div>

        <div class="modal-metric-card">
          <span class="modal-metric-label">Production & Studio</span>
          <span class="modal-metric-value" style="font-size:1.05rem;">${escapeHtml(studios)}</span>
          <span class="modal-metric-sub">Status: ${escapeHtml(movie.status || 'Released')}</span>
        </div>
      </div>
    </div>
  `;

  // ─── 3. DYNAMIC DISTRIBUTION BUDGET CALCULATOR & CREATIVE FORMATS ───
  html += renderDistributionCalculator(movie);

  // ─── 3. TOP CAST & FILMMAKERS ───
  if (topCast.length > 0) {
    html += `
      <div class="modal-section">
        <div class="modal-section-tag">Talent & Creators</div>
        <h3 class="modal-section-title">Key Cast & Filmmakers</h3>
        <div class="modal-cast-grid">
          ${topCast.map(actor => {
            const photo = actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null;
            return `
              <div class="modal-cast-card">
                <div class="modal-cast-photo-wrap">
                  ${photo ? `<img src="${photo}" alt="${escapeHtml(actor.name)}" class="modal-cast-photo" loading="lazy" />` : '👤'}
                </div>
                <div class="modal-cast-info">
                  <span class="modal-cast-name">${escapeHtml(actor.name)}</span>
                  <span class="modal-cast-role">${escapeHtml(actor.character || 'Cast')}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ─── 4. HIGHVERZ CAMPAIGN STRATEGY SECTION ───
  if (campaign) {
    // ─── BESPOKE CAMPAIGN ANALYSIS ───
    html += `
      <div class="modal-section" id="modal-campaign-analysis">
        <div class="modal-section-tag">The Big Idea</div>
        <h3 class="modal-section-title">How This Movie Won Global Attention</h3>
        <blockquote class="modal-big-idea-quote">
          ${escapeHtml(campaign.campaignSummary)}
        </blockquote>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Campaign Overview</div>
        <h3 class="modal-section-title">The Marketing Strategy At a Glance</h3>
        <div class="modal-overview-grid">
          <div class="modal-overview-card">
            <div class="modal-overview-card-label">Campaign Goal</div>
            <div class="modal-overview-card-value">${escapeHtml(campaign.campaignGoal)}</div>
          </div>
          <div class="modal-overview-card">
            <div class="modal-overview-card-label">Primary Audience</div>
            <div class="modal-overview-card-value">${escapeHtml(campaign.targetAudience)}</div>
          </div>
          <div class="modal-overview-card">
            <div class="modal-overview-card-label">Campaign Duration</div>
            <div class="modal-overview-card-value">${escapeHtml(campaign.campaignDuration)}</div>
          </div>
          <div class="modal-overview-card">
            <div class="modal-overview-card-label">Primary Platforms</div>
            <div class="modal-platforms-row">
              ${campaign.platforms.map(p => `<span class="modal-platform-chip">${escapeHtml(p)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Promotion Strategy</div>
        <h3 class="modal-section-title">How The Campaign Was Executed</h3>
        <div class="modal-strategy-grid">
          ${campaign.promotionStrategies.map(s => `
            <div class="modal-strategy-card">
              <div class="modal-strategy-card-icon">${s.icon}</div>
              <h4 class="modal-strategy-card-title">${escapeHtml(s.title)}</h4>
              <p class="modal-strategy-card-desc">${escapeHtml(s.description)}</p>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Platform Breakdown</div>
        <h3 class="modal-section-title">Where The Campaign Lived</h3>
        <div class="modal-platform-grid">
          ${campaign.platformBreakdown.map(p => `
            <div class="modal-platform-card">
              <div class="modal-platform-card-name">${escapeHtml(p.platform)}</div>
              <p class="modal-platform-card-strategy">${escapeHtml(p.strategy)}</p>
              <div class="modal-platform-content-list">
                ${p.contentTypes.map(ct => `<span class="modal-platform-content-tag">${escapeHtml(ct)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Content Engine</div>
        <h3 class="modal-section-title">How Content Multiplied Distribution</h3>
        <p class="modal-section-desc">Every piece of media was engineered to spin off into sub-assets across platforms — transforming one master clip into a viral ecosystem.</p>
        <div class="modal-content-engine" id="modal-content-engine">
          ${campaign.contentEngine.map((node, i) => `
            ${i > 0 ? '<div class="modal-content-connector"></div>' : ''}
            <div class="modal-content-node">
              <span class="modal-content-node-type">${escapeHtml(node.type)}</span>
              <span class="modal-content-node-label">${escapeHtml(node.label)}</span>
            </div>
          `).join('')}
        </div>
        <div class="modal-content-philosophy">
          <span class="modal-content-philosophy-item">Content</span>
          <span class="modal-content-philosophy-arrow">→</span>
          <span class="modal-content-philosophy-item">Distribution</span>
          <span class="modal-content-philosophy-arrow">→</span>
          <span class="modal-content-philosophy-item">Culture</span>
          <span class="modal-content-philosophy-arrow">→</span>
          <span class="modal-content-philosophy-item">Growth</span>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Campaign Timeline</div>
        <h3 class="modal-section-title">Roadmap to Box Office Opening</h3>
        <div class="modal-timeline" id="modal-timeline">
          ${campaign.timeline.map(t => `
            <div class="modal-timeline-item">
              <div class="modal-timeline-phase">${escapeHtml(t.phase)}</div>
              <h4 class="modal-timeline-title">${escapeHtml(t.title)}</h4>
              <p class="modal-timeline-desc">${escapeHtml(t.description)}</p>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Attention Economics</div>
        <h3 class="modal-section-title">Marketing Resource Allocation</h3>
        <div class="modal-budget-total">
          <span class="modal-budget-amount">${escapeHtml(campaign.estimatedBudget.total)}</span>
          <span class="modal-budget-label">${escapeHtml(campaign.estimatedBudget.label)}</span>
        </div>
        <div class="modal-budget-bars" id="modal-budget-bars">
          ${campaign.estimatedBudget.breakdown.map(b => `
            <div class="modal-budget-bar-item">
              <span class="modal-budget-bar-name">${escapeHtml(b.category)}</span>
              <div class="modal-budget-bar-track">
                <div class="modal-budget-bar-fill" data-percentage="${b.percentage}"></div>
              </div>
              <span class="modal-budget-bar-pct">${b.percentage}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Analysis</div>
        <h3 class="modal-section-title">Why The Campaign Broke Through</h3>
        <div class="modal-reasons-list">
          ${campaign.whyItWorked.map(r => `
            <div class="modal-reason-item">
              <span class="modal-reason-number">${r.number}</span>
              <div class="modal-reason-content">
                <h4 class="modal-reason-title">${escapeHtml(r.title)}</h4>
                <p class="modal-reason-desc">${escapeHtml(r.description)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Highverz Intelligence</div>
        <h3 class="modal-section-title">Actionable Takeaways For Brands</h3>
        <div class="modal-takeaway-grid">
          ${campaign.highverzTakeaways.map(t => `
            <div class="modal-takeaway-card">
              <div class="modal-takeaway-pillar">${escapeHtml(t.pillar)}</div>
              <p class="modal-takeaway-insight">${escapeHtml(t.insight)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    // ─── DYNAMIC HIGHVERZ STRATEGY INTELLIGENCE MATRIX ───
    const autoStrategy = generateAutomatedStrategy(movie);

    html += `
      <div class="modal-section" id="modal-intelligence-section">
        <div class="modal-ai-badge">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <span>Highverz Distribution Intelligence Matrix</span>
        </div>
        <h3 class="modal-section-title">Target Audience & Market Strategy</h3>
        <blockquote class="modal-big-idea-quote">
          To market <em>${escapeHtml(movie.title)}</em> effectively, the distribution architecture must anchor on <strong>${escapeHtml(autoStrategy.hook)}</strong>, mobilizing early taste-maker communities before expanding into wide theatrical momentum.
        </blockquote>

        <div class="modal-overview-grid" style="margin-top:2rem;">
          <div class="modal-overview-card">
            <div class="modal-overview-card-label">Primary Audience Persona</div>
            <div class="modal-overview-card-value">${escapeHtml(autoStrategy.audience)}</div>
          </div>
          <div class="modal-overview-card">
            <div class="modal-overview-card-label">Strategic Narrative Hook</div>
            <div class="modal-overview-card-value">${escapeHtml(autoStrategy.hook)}</div>
          </div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-tag">Distribution Architecture</div>
        <h3 class="modal-section-title">Recommended Multi-Platform Channel Mix</h3>
        <div class="modal-platform-grid">
          ${autoStrategy.platformMix.map(pm => `
            <div class="modal-platform-card">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                <div class="modal-platform-card-name" style="margin:0;">${escapeHtml(pm.platform)}</div>
                <span style="font-family:var(--font-display);font-weight:700;color:var(--accent-cyan);font-size:1.1rem;">${pm.share}</span>
              </div>
              <p class="modal-platform-card-strategy">${escapeHtml(pm.strategy)}</p>
            </div>
          `).join('')}
        </div>

        <div class="modal-request-box">
          <div style="font-size:2.5rem;">📊</div>
          <h4 class="modal-request-title">Want the Full 360° Campaign Breakdown?</h4>
          <p class="modal-request-desc">
            Our entertainment intelligence team analyzes marketing timelines, creator activations, and influencer spend for major releases. Request this title to prioritize an in-depth breakdown.
          </p>
          <button type="button" class="btn-request-breakdown" data-cursor="REQUEST">
            Request In-Depth Case Study
          </button>
        </div>
      </div>
    `;
  }

  // ─── MODAL FOOTER ───
  html += renderModalFooter();

  container.innerHTML = html;
}

function attachModalInteractiveHandlers(container, videos, movie) {
  // Trailer buttons
  container.querySelectorAll('.btn-play-trailer').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.dataset.trailerKey;
      if (key) openTrailerModal(key);
    });
  });

  // Request breakdown button
  const reqBtn = container.querySelector('.btn-request-breakdown');
  if (reqBtn) {
    reqBtn.addEventListener('click', () => {
      reqBtn.classList.add('requested');
      reqBtn.innerHTML = `✓ Breakdown Requested (Priority Queue)`;
      reqBtn.disabled = true;
    });
  }
}

function renderModalFooter() {
  return `
    <div class="modal-footer-brand">
      <p class="modal-footer-brand-text">
        Campaign intelligence by <span>Highverz</span> — Turn Content Into Reach. Turn Your Name Into a Brand.
      </p>
    </div>
  `;
}

// ==========================================================================
// MODAL ANIMATIONS
// ==========================================================================
function animateModalSections() {
  const modalBackdrop = document.getElementById('campaign-modal-backdrop');
  if (!modalBackdrop) return;

  // Content engine nodes — stagger reveal
  const nodes = modalBackdrop.querySelectorAll('.modal-content-node');
  if (nodes.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { root: modalBackdrop, threshold: 0.3 });

    nodes.forEach((node, i) => {
      setTimeout(() => observer.observe(node), i * 80);
    });
  }

  // Timeline items — scroll reveal
  const timelineItems = modalBackdrop.querySelectorAll('.modal-timeline-item');
  if (timelineItems.length > 0) {
    const timelineObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          entry.target.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
          timelineObserver.unobserve(entry.target);
        }
      });
    }, { root: modalBackdrop, threshold: 0.2 });

    timelineItems.forEach((item, i) => {
      setTimeout(() => timelineObserver.observe(item), i * 60);
    });
  }

  // Budget bars — animate width
  const budgetBars = modalBackdrop.querySelectorAll('.modal-budget-bar-fill');
  if (budgetBars.length > 0) {
    const budgetObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pct = entry.target.dataset.percentage;
          setTimeout(() => {
            entry.target.style.width = pct + '%';
          }, 200);
          budgetObserver.unobserve(entry.target);
        }
      });
    }, { root: modalBackdrop, threshold: 0.1 });

    budgetBars.forEach(bar => budgetObserver.observe(bar));
  }
}

// ==========================================================================
// UTILITY
// ==========================================================================
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
