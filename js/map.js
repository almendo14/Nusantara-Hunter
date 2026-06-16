/**
 * map.js — DataLoader
 * Bertanggung jawab atas semua I/O data game.
 * Baca JSON via fetch, simpan di cache internal, expose API ke modul lain.
 *
 * Prinsip: modul lain TIDAK boleh fetch langsung — semua lewat DataLoader.
 */

const DataLoader = (() => {
  // ─── Private Cache ───────────────────────────────────────────────
  const _cache = {
    islands: null,    // Array<Island>
    monsters: null,   // Array<Monster>
  };

  // Index cepat: id → object (dibangun setelah data masuk)
  const _index = {
    islands: {},    // { [island_id]: Island }
    monsters: {},   // { [monster_id]: Monster }
  };

  // ─── Helpers ─────────────────────────────────────────────────────

  /**
   * Fetch satu JSON file dan parse hasilnya.
   * Lempar Error jika response bukan OK.
   * @param {string} path - path relatif dari root project
   * @returns {Promise<any>}
   */
  async function _fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`[DataLoader] Gagal load "${path}" — HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Bangun index id → object dari sebuah array.
   * @param {Array<{id: string}>} arr
   * @returns {Object}
   */
  function _buildIndex(arr) {
    return arr.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }

  // ─── Public API ──────────────────────────────────────────────────

  /**
   * Load semua data sekaligus (paralel via Promise.all).
   * Panggil ini sekali di game bootstrap.
   * @returns {Promise<{ islands: Island[], monsters: Monster[] }>}
   */
  async function loadAll() {
    console.log("[DataLoader] Mulai load semua data...");

    const [islands, monsters] = await Promise.all([
      _fetchJSON("data/islands.json"),
      _fetchJSON("data/monsters.json"),
    ]);

    // Simpan ke cache
    _cache.islands  = islands;
    _cache.monsters = monsters;

    // Bangun index untuk O(1) lookup
    _index.islands  = _buildIndex(islands);
    _index.monsters = _buildIndex(monsters);

    console.log(
      `[DataLoader] Selesai — ${islands.length} pulau, ${monsters.length} monster dimuat.`
    );

    return { islands, monsters };
  }

  /**
   * Ambil semua pulau.
   * @returns {Island[]}
   */
  function getIslands() {
    if (!_cache.islands) throw new Error("[DataLoader] Data belum dimuat. Panggil loadAll() dulu.");
    return _cache.islands;
  }

  /**
   * Ambil satu pulau by ID.
   * @param {string} id
   * @returns {Island | undefined}
   */
  function getIslandById(id) {
    return _index.islands[id];
  }

  /**
   * Ambil semua monster.
   * @returns {Monster[]}
   */
  function getMonsters() {
    if (!_cache.monsters) throw new Error("[DataLoader] Data belum dimuat. Panggil loadAll() dulu.");
    return _cache.monsters;
  }

  /**
   * Ambil satu monster by ID.
   * @param {string} id
   * @returns {Monster | undefined}
   */
  function getMonsterById(id) {
    return _index.monsters[id];
  }

  /**
   * Ambil semua monster yang terdaftar di monster_pool sebuah pulau.
   * Berguna untuk SpawnSystem saat generate encounter.
   * @param {string} islandId
   * @returns {Monster[]}
   */
  function getMonstersForIsland(islandId) {
    const island = getIslandById(islandId);
    if (!island) {
      console.warn(`[DataLoader] Island "${islandId}" tidak ditemukan.`);
      return [];
    }
    return island.monster_pool
      .map(mId => _index.monsters[mId])
      .filter(Boolean); // filter kalau ada id yang belum ada di monsters.json
  }

  /**
   * Cek apakah data sudah loaded.
   * @returns {boolean}
   */
  function isReady() {
    return _cache.islands !== null && _cache.monsters !== null;
  }

  // Expose public API
  return {
    loadAll,
    isReady,
    getIslands,
    getIslandById,
    getMonsters,
    getMonsterById,
    getMonstersForIsland,
  };
})();

// ─── Map Manager ────────────────────────────────────────────────────────────
const mapManager = {
  matrix: null,
  mapSize: 10,
  tileSize: 32,
  TILE_WALL: 0,
  TILE_GROUND: 1,
  TILE_PORTAL: 2,

  isTileWalkable: function(x, y) {
    if (x < 0 || x >= this.mapSize || y < 0 || y >= this.mapSize) return false;
    return this.matrix && this.matrix[y][x] !== this.TILE_WALL;
  },

  generateMap: function() {
    const size = this.mapSize;
    this.matrix = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        if (r === 0 || r === size - 1 || c === 0 || c === size - 1) {
          row.push(this.TILE_WALL);
        } else {
          row.push(this.TILE_GROUND);
        }
      }
      this.matrix.push(row);
    }
    // Tempatkan portal di (8, 8)
    this.matrix[8][8] = this.TILE_PORTAL;
  }
};