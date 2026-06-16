/**
 * save.js — SaveManager
 * Handles all read/write operations to LocalStorage.
 *
 * RULES:
 *  1. Only SaveManager touches LocalStorage — no other module.
 *  2. We save a lightweight SNAPSHOT, not the raw GameState object.
 *  3. Every save includes a schema version so we can migrate old saves later.
 *  4. Data is sanitized on load to prevent crashes from corrupted saves.
 *
 * Depends on: nothing (zero dependencies — safe to load first).
 */

const SaveManager = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  /** LocalStorage key — change this if you rename the game */
  const SAVE_KEY = 'nusantara_hunter_save';

  /**
   * Schema version. Increment this (e.g. '1.1', '2.0') whenever the
   * save structure changes. _sanitize() uses it to handle old saves.
   */
  const SAVE_VERSION = '1.0';

  // ── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Build a clean snapshot object from GameState.
   * Only plain serialisable values — no functions, no DOM refs.
   *
   * @param {object} state - The live GameState object
   * @returns {object} Snapshot ready for JSON.stringify
   */
  const _buildSnapshot = (state) => ({
    version:   SAVE_VERSION,
    savedAt:   new Date().toISOString(),  // human-readable timestamp

    // ── Run progress ──
    floor:     state.floor  ?? 1,
    turn:      state.turn   ?? 0,

    // ── Player data ──
    // state.player will be a plain object once PlayerManager is built.
    // We spread it here so future player fields are saved automatically.
    player: state.player ? { ...state.player } : null,

    // ── Future expansion slots ──
    // These are empty now; fill them in when the modules are ready.
    inventory: state.inventory ?? [],
    achievements: state.achievements ?? [],
    encyclopedia: state.encyclopedia ?? [],
  });

  /**
   * Validate and fill missing fields in loaded data.
   * Prevents crashes when loading saves from older game versions.
   *
   * @param {object} raw - Parsed JSON from LocalStorage
   * @returns {object|null} Sanitized save object, or null if unrecoverable
   */
  const _sanitize = (raw) => {
    // Must be a non-null object
    if (!raw || typeof raw !== 'object') {
      console.warn('[SaveManager] Save data is not a valid object.');
      return null;
    }

    // Version check — log a warning but still try to load
    if (raw.version !== SAVE_VERSION) {
      console.warn(
        `[SaveManager] Save version mismatch: file=${raw.version}, ` +
        `game=${SAVE_VERSION}. Attempting to load anyway.`
      );
    }

    // Guarantee all expected fields exist (fill with safe defaults)
    return {
      version:      raw.version      ?? SAVE_VERSION,
      savedAt:      raw.savedAt      ?? null,
      floor:        Number(raw.floor ?? 1),
      turn:         Number(raw.turn  ?? 0),
      player:       raw.player       ?? null,
      inventory:    Array.isArray(raw.inventory)    ? raw.inventory    : [],
      achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
      encyclopedia: Array.isArray(raw.encyclopedia) ? raw.encyclopedia : [],
    };
  };

  // ── Public API ───────────────────────────────────────────────────────────

  return {

    /**
     * Save current run to LocalStorage.
     *
     * @param {object} state - The live GameState object
     * @returns {boolean} true if save succeeded, false on error
     */
    save(state) {
      try {
        const snapshot = _buildSnapshot(state);
        localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
        console.log(
          `[SaveManager] Game saved. Floor ${snapshot.floor}, ` +
          `Turn ${snapshot.turn}, at ${snapshot.savedAt}`
        );
        return true;
      } catch (err) {
        // LocalStorage can throw if storage quota is exceeded
        console.error('[SaveManager] Failed to save:', err);
        return false;
      }
    },

    /**
     * Load and sanitize save data from LocalStorage.
     *
     * @returns {object|null} Sanitized save object, or null if no save found
     */
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
          console.log('[SaveManager] No save data found.');
          return null;
        }
        const parsed   = JSON.parse(raw);
        const sanitized = _sanitize(parsed);
        if (sanitized) {
          console.log(
            `[SaveManager] Save loaded. Floor ${sanitized.floor}, ` +
            `Turn ${sanitized.turn}, saved at ${sanitized.savedAt}`
          );
        }
        return sanitized;
      } catch (err) {
        console.error('[SaveManager] Failed to load save:', err);
        return null;
      }
    },

    /**
     * Check whether valid save data exists without fully loading it.
     * Used by Bootstrap to enable/disable the "Lanjutkan" button.
     *
     * @returns {boolean}
     */
    hasSave() {
      try {
        return localStorage.getItem(SAVE_KEY) !== null;
      } catch {
        return false;
      }
    },

    /**
     * Permanently delete save data.
     * Call this when the player starts a New Game over an existing save,
     * or from a "Reset" / "Hapus Data" settings option.
     *
     * @returns {boolean} true if deletion succeeded
     */
    deleteSave() {
      try {
        localStorage.removeItem(SAVE_KEY);
        console.log('[SaveManager] Save data deleted.');
        return true;
      } catch (err) {
        console.error('[SaveManager] Failed to delete save:', err);
        return false;
      }
    },

    /**
     * Return a human-readable summary of the current save.
     * Useful for the "Lanjutkan" button tooltip or a save-info panel.
     *
     * @returns {string|null} e.g. "Lantai 3 • Giliran 42 • 12 Jan 2025"
     */
    getSaveSummary() {
      const data = this.load();
      if (!data) return null;

      const date = data.savedAt
        ? new Date(data.savedAt).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric'
          })
        : 'Tanggal tidak diketahui';

      return `Lantai ${data.floor} • Giliran ${data.turn} • ${date}`;
    },

  };

})();