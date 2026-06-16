/**
 * js/enemy.js
 *
 * Sistem Musuh (Enemy System) untuk Nusantara Hunter.
 * Mengatur pemuatan data monster via AJAX, spawning acak di area peta,
 * serta manajemen visualisasi musuh di atas Canvas menggunakan 2D sprite sheet.
 */

// Pemetaan ID Monster ke berkas gambar spritenya
const monsterIdToPath = {
  'enemy_03_pocong': 'assets/sprites/buto_ijo.png',
  'enemy_04_naga_toba': 'assets/sprites/naga_toba.png',
  'mob_seagull_bandit': 'assets/sprites/monsters/seagull_bandit.png',
  'mob_coral_crab': 'assets/sprites/monsters/coral_crab.png',
  'mob_reef_shark': 'assets/sprites/monsters/reef_shark.png',
  'mob_ironback_boar': 'assets/sprites/monsters/ironback_boar.png',
  'mob_vine_serpent': 'assets/sprites/monsters/vine_serpent.png',
  'mob_forest_bandit': 'assets/sprites/monsters/forest_bandit.png',
  'mob_mushroom_golem': 'assets/sprites/monsters/mushroom_golem.png',
  'mob_lava_lizard': 'assets/sprites/monsters/lava_lizard.png',
  'mob_ash_golem': 'assets/sprites/monsters/ash_golem.png',
  'mob_pyroclast_drake': 'assets/sprites/monsters/pyroclast_drake.png',
  'mob_sea_zombie': 'assets/sprites/monsters/sea_zombie.png',
  'mob_ruin_guardian': 'assets/sprites/monsters/ruin_guardian.png',
  'mob_storm_hawk': 'assets/sprites/monsters/storm_hawk.png',
  'mob_tempest_wyrm': 'assets/sprites/monsters/tempest_wyrm.png'
};

// Cache internal untuk memuat gambar agar tidak terjadi I/O berulang setiap frame
const spriteCache = {};

/**
 * Mendapatkan atau membuat instance gambar sprite untuk monster tertentu
 * @param {Object} enemy - Data instance musuh
 * @returns {HTMLImageElement}
 */
function getMonsterSprite(enemy) {
  const id = enemy.templateId || enemy.id;
  let path = monsterIdToPath[id];
  
  if (!path) {
    // Fallback path jika ID tidak terdaftar di pemetaan keras
    path = enemy.sprite || `assets/sprites/monsters/${id}.png`;
  }
  
  if (!spriteCache[path]) {
    const img = new Image();
    img.src = path;
    spriteCache[path] = img;
  }
  return spriteCache[path];
}

class EnemySystem {
  constructor() {
    this.monsterDatabase = []; // Tempat menyimpan cetak biru monster dari JSON
    this.activeEnemies = [];   // Daftar monster yang sedang hidup di map saat ini
  }

  /**
   * Memuat data monster dari server/berkas lokal menggunakan AJAX jQuery.
   * @returns {Promise} Mengembalikan promise agar engine tahu kapan data selesai dimuat.
   */
  loadMonsterData() {
    return $.ajax({
      url: 'data/monsters.json',
      dataType: 'json',
      success: (data) => {
        this.monsterDatabase = data;
        console.log("Database Monster berhasil dimuat via AJAX:", this.monsterDatabase);
      },
      error: (xhr, status, error) => {
        console.error("Gagal memuat data/monsters.json. Pastikan menggunakan Live Server/HTTP Server.", error);
      }
    });
  }

  /**
   * Memunculkan (Spawn) sejumlah monster secara acak di atas peta.
   * Hanya memilih tile berjenis GROUND dan memastikan tidak menimpa posisi koordinat pemain.
   * @param {number} count - Jumlah musuh yang ingin dimunculkan di dalam peta.
   */
  spawnRandomEnemies(count = 3) {
    this.activeEnemies = []; // Reset daftar musuh aktif sebelum spawning baru

    if (this.monsterDatabase.length === 0) {
      console.log("[EnemySpawningDebug] checking DataLoader:", typeof DataLoader, typeof DataLoader !== 'undefined' ? DataLoader.isReady() : 'undefined');
      if (typeof DataLoader !== 'undefined' && DataLoader.isReady()) {
        this.monsterDatabase = DataLoader.getMonsters();
        console.log("[EnemySpawningDebug] loaded from DataLoader. count:", this.monsterDatabase.length);
      } else {
        console.warn("Gagal Spawning: Database monster kosong atau belum dimuat.");
        return;
      }
    }

    let spawned = 0;
    let attempts = 0; // Batasan percobaan agar tidak terjadi infinite loop jika map penuh
    const maxAttempts = 200;

    // Ambil koordinat pemain saat ini untuk menghindari spawn instan di atas pemain
    const playerX = playerManager.currentPlayer ? playerManager.currentPlayer.x : 1;
    const playerY = playerManager.currentPlayer ? playerManager.currentPlayer.y : 1;

    while (spawned < count && attempts < maxAttempts) {
      attempts++;
      
      // Pilih koordinat acak di dalam area peta (menghindari koordinat dinding luar)
      const randX = Math.floor(Math.random() * (mapManager.mapSize - 2)) + 1;
      const randY = Math.floor(Math.random() * (mapManager.mapSize - 2)) + 1;

      // VALIDASI: Harus berupa GROUND, bukan PORTAL, bukan WALL, dan bukan posisi PLAYER
      const isGround = mapManager.matrix[randY][randX] === mapManager.TILE_GROUND;
      const isNotPlayer = (randX !== playerX || randY !== playerY);
      
      // Pastikan koordinat ini belum ditempati oleh monster lain yang baru di-spawn
      const isTileEmpty = !this.activeEnemies.some(enemy => enemy.x === randX && enemy.y === randY);

      if (isGround && isNotPlayer && isTileEmpty) {
        // Pilih satu template monster secara acak dari database
        const randomTemplate = this.monsterDatabase[Math.floor(Math.random() * this.monsterDatabase.length)];

        // Buat instansiasi objek monster tiruan baru untuk diletakkan di koordinat terpilih
        const newEnemy = JSON.parse(JSON.stringify(randomTemplate));
        newEnemy.x = randX;
        newEnemy.y = randY;

        this.activeEnemies.push(newEnemy);
        spawned++;
      }
    }

    console.log(`Berhasil memunculkan ${spawned} musuh secara acak di peta.`);
  }

  /**
   * Menggabar seluruh musuh yang aktif ke atas Canvas menggunakan sprite sheet 2D.
   * @param {CanvasRenderingContext2D} ctx 
   * @param {number} tileSize 
   */
  drawEnemies(ctx, tileSize) {
    if (!ctx || !this.activeEnemies) return;

    this.activeEnemies.forEach(enemy => {
      const px = enemy.x * tileSize;
      const py = enemy.y * tileSize;

      const img = getMonsterSprite(enemy);

      // Periksa jika gambar sprite telah selesai dimuat
      if (img.complete && img.naturalWidth !== 0) {
        // Proses background putih agar transparan
        const renderedImg = window.processWhiteBackground ? window.processWhiteBackground(img) : img;

        // Siklus indeks bingkai animasi (0-3) menggunakan ticker global
        const frameIndex = Math.floor((window.globalFrameTicker || 0) / 15) % 4;
        
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;

        let sw = 32;
        let sh = 32;
        let sx = 0;
        let sy = 0;

        // Deteksi struktur grid sprite sheet: 4x1 (linear) atau 2x2 (matrix)
        if (imgWidth >= imgHeight * 1.5) {
          // Linear 4-frame strip
          sw = imgWidth / 4;
          sh = imgHeight;

          // Cek toleransi batas frame (persis 32x32) untuk menghindari bleeding grid line
          if (sw > 30 && sw < 34) sw = 32;
          if (sh > 30 && sh < 34) sh = 32;

          sx = frameIndex * sw;
          sy = 0;
        } else {
          // Grid 2x2 sheet
          sw = imgWidth / 2;
          sh = imgHeight / 2;

          // Cek toleransi batas frame (persis 32x32) untuk menghindari bleeding grid line
          if (sw > 30 && sw < 34) sw = 32;
          if (sh > 30 && sh < 34) sh = 32;

          const col = frameIndex % 2;
          const row = Math.floor(frameIndex / 2);
          sx = col * sw;
          sy = row * sh;
        }

        ctx.drawImage(
          renderedImg,
          sx, sy, sw, sh,            // Potongan sumber (source rect)
          px, py, tileSize, tileSize // Gambar di tujuan (dest rect)
        );
      } else {
        // Fallback visual jika berkas gambar belum siap (Kotak Merah Marun Mistis)
        ctx.fillStyle = enemy.type === 'elite' ? '#4a0000' : '#8b0000';
        ctx.fillRect(px + 6, py + 6, tileSize - 12, tileSize - 12);

        // Memberikan aksen mata/core merah terang di tengah kotak musuh
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(
          px + (tileSize / 2) - 3,
          py + (tileSize / 2) - 3,
          6,
          6
        );
      }
    });
  }
}

// Inisialisasi global instance enemyManager
const enemyManager = new EnemySystem();