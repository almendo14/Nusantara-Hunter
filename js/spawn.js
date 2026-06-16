/**
 * js/spawn.js — SpawnSystem
 *
 * Mengatur logic pemunculan monster (spawning) dan pembagian drop reward (loot/berry).
 *
 * Dependency:
 *   - DataLoader (js/map.js)
 */

const SpawnSystem = (() => {
  // ─── Private Helpers ───────────────────────────────────────────────
  
  /**
   * Helper untuk memilih elemen acak dari array.
   * @param {Array} arr 
   * @returns {*}
   */
  function _choice(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ─── Public API ──────────────────────────────────────────────────

  /**
   * Roll loot dropped oleh musuh berdasarkan `loot_table` miliknya.
   * @param {Object} enemy - Instance musuh yang dikalahkan
   * @returns {string[]} Array berisikan item_id yang berhasil di-drop
   */
  function rollLoot(enemy) {
    const reward = [];
    if (enemy && Array.isArray(enemy.loot_table)) {
      for (const entry of enemy.loot_table) {
        if (Math.random() < entry.chance) {
          reward.push(entry.item_id);
        }
      }
    }
    return reward;
  }

  /**
   * Roll jumlah berry (currency) yang diperoleh saat mengalahkan musuh.
   * @param {Object} enemy - Instance musuh
   * @returns {number} Jumlah koin/berry yang di-drop
   */
  function rollBerry(enemy) {
    let min = 5;
    let max = 15;

    // Gunakan reward bawaan musuh jika terdefinisi
    if (enemy && enemy.berry_reward && typeof enemy.berry_reward.min === "number" && typeof enemy.berry_reward.max === "number") {
      min = enemy.berry_reward.min;
      max = enemy.berry_reward.max;
    } else if (enemy && enemy.type) {
      // Fallback berdasarkan jenis tipe musuh jika berry_reward tidak lengkap
      if (enemy.type === "elite") {
        min = 30;
        max = 80;
      } else if (enemy.type === "boss") {
        min = 150;
        max = 400;
      }
    }

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Mengembalikan konfigurasi preview untuk lantai tertentu pada pulau tertentu.
   * @param {string} islandId 
   * @param {number} floor 
   * @returns {{ monsterCount: { min: number, max: number }, eliteChance: number, scaleFactor: number }}
   */
  function previewFloor(islandId, floor) {
    const island = DataLoader.getIslandById(islandId);
    const difficulty = island ? island.difficulty : 1;

    // Skala peningkatan stats musuh: +15% per tingkat lantai setelah F1
    const scaleFactor = 1.0 + (floor - 1) * 0.15;

    // Peluang munculnya musuh elite: bertambah seiring lantai & difficulty (maks 40%)
    const eliteChance = Math.min(0.40, 0.05 + (floor - 1) * 0.03 + difficulty * 0.02);

    // Sesuai requirement: Batasi agar memilih 2-3 monster secara acak
    const minCount = 2;
    const maxCount = 3;

    return {
      monsterCount: { min: minCount, max: maxCount },
      eliteChance,
      scaleFactor
    };
  }

  /**
   * Menghasilkan EncounterResult untuk pertarungan di lantai tertentu.
   * @param {string} islandId 
   * @param {number} floor 
   * @returns {{ islandId: string, floor: number, monsters: Object[], hasElite: boolean }}
   */
  function generateEncounter(islandId, floor) {
    const preview = previewFloor(islandId, floor);
    
    // Temukan konfigurasi pulau aktif
    const island = DataLoader.getIslandById(islandId);
    if (!island) {
      console.warn(`[SpawnSystem] Konfigurasi pulau "${islandId}" tidak ditemukan.`);
      return {
        islandId,
        floor,
        monsters: [],
        hasElite: false
      };
    }

    // Filter monster yang tersedia di region/pulau ini berdasarkan poolnya
    const pool = DataLoader.getMonstersForIsland(islandId);
    if (!pool || pool.length === 0) {
      console.warn(`[SpawnSystem] Monster pool kosong untuk pulau "${islandId}".`);
      return {
        islandId,
        floor,
        monsters: [],
        hasElite: false
      };
    }

    // Pisahkan tipe monster normal dan elite
    const normals = pool.filter(m => m.type === "normal" || !m.type);
    const elites = pool.filter(m => m.type === "elite");

    // Tentukan apakah encounter ini memiliki setidaknya satu musuh elite
    let hasElite = Math.random() < preview.eliteChance && elites.length > 0;
    
    // Roll jumlah musuh (memilih 2-3 monster secara acak)
    const count = Math.floor(Math.random() * (preview.monsterCount.max - preview.monsterCount.min + 1)) + preview.monsterCount.min;
    
    const chosenTemplates = [];
    
    if (hasElite) {
      // Tambahkan 1 elite monster
      chosenTemplates.push(_choice(elites));
      // Sisa slot diisi monster normal (atau apa pun yang tersedia)
      const normalPool = normals.length > 0 ? normals : pool;
      for (let i = 1; i < count; i++) {
        chosenTemplates.push(_choice(normalPool));
      }
    } else {
      // Seluruh slot diisi monster normal (atau apa pun yang tersedia)
      const normalPool = normals.length > 0 ? normals : pool;
      for (let i = 0; i < count; i++) {
        chosenTemplates.push(_choice(normalPool));
      }
    }

    // Buat deep copy dan terapkan penskalaan stats musuh serta parameter runtime
    const monsters = chosenTemplates.map(template => {
      const instance = JSON.parse(JSON.stringify(template));
      
      // Simpan reference ID cetak biru asal
      instance.templateId = template.id;
      
      // Penskalaan stats berdasarkan tingkat lantai
      const scale = preview.scaleFactor;
      if (instance.stats) {
        instance.stats.hp  = Math.round(instance.stats.hp * scale);
        instance.stats.atk = Math.round(instance.stats.atk * scale);
        instance.stats.def = Math.round(instance.stats.def * scale);
        instance.stats.spd = Math.round(instance.stats.spd * scale);
      }

      // Penskalaan hadiah EXP dan Berry
      if (typeof instance.exp_reward === "number") {
        instance.exp_reward = Math.round(instance.exp_reward * scale);
      }
      if (instance.berry_reward) {
        if (typeof instance.berry_reward.min === "number") {
          instance.berry_reward.min = Math.round(instance.berry_reward.min * scale);
        }
        if (typeof instance.berry_reward.max === "number") {
          instance.berry_reward.max = Math.round(instance.berry_reward.max * scale);
        }
      }

      // Set parameter runtime combat instance
      instance.currentHp = instance.stats ? instance.stats.hp : 10;
      instance.isAlive = true;

      return instance;
    });

    return {
      islandId,
      floor,
      monsters,
      hasElite
    };
  }

  return {
    rollLoot,
    rollBerry,
    previewFloor,
    generateEncounter
  };
})();
