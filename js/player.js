/**
 * js/player.js
 *
 * Sistem Karakter Pemain (Player System) untuk Nusantara Hunter.
 * Mengatur koordinat, stats, saving data, dan rendering sprite teranimasi.
 */

// Load sprite utama player
const playerSprite = new Image();
playerSprite.src = 'assets/sprites/adventurer.png';

// Helper to remove white backgrounds (chroma keying) programmatically from sprite sheets
const transparentCache = {};
window.processWhiteBackground = function(img) {
  if (!img || !img.complete || img.naturalWidth === 0) return img;
  const src = img.src;
  if (transparentCache[src]) return transparentCache[src];

  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Key color: white (R=255, G=255, B=255)
    // Threshold handles slight variations in compression
    const threshold = 15;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      if (r >= 255 - threshold && g >= 255 - threshold && b >= 255 - threshold) {
        data[i+3] = 0; // Alpha to 0 (fully transparent)
      }
    }
    ctx.putImageData(imgData, 0, 0);
    transparentCache[src] = canvas;
    return canvas;
  } catch (e) {
    console.error("[processWhiteBackground] Error during transparency processing:", e);
    return img;
  }
};

class PlayerSystem {
  constructor() {
    this.currentPlayer = null;
    this.storageKey = 'nusantara_hunter_player_save';
  }

  /**
   * Membuat karakter pemain baru dengan statistik dasar dan koordinat awal.
   */
  createPlayer(name = "Pemburu") {
    this.currentPlayer = {
      name: name,
      level: 1,
      exp: 0,
      maxExp: 100,
      hp: 500,
      maxHp: 500,
      attack: 15,
      defense: 5,
      gold: 0,
      x: 1,
      y: 1,
      createdAt: new Date().toISOString()
    };

    console.log(`Karakter baru berhasil dibuat: ${this.currentPlayer.name}`);
    this.savePlayer();
    return this.currentPlayer;
  }

  /**
   * Menggerakkan pemain berdasarkan arah input setelah divalidasi oleh MapSystem dan CombatSystem.
   */
  move(dx, dy) {
    if (!this.currentPlayer) return;

    const targetX = this.currentPlayer.x + dx;
    const targetY = this.currentPlayer.y + dy;

    // 1. CEK PERTARUNGAN: Apakah ada musuh di koordinat tujuan?
    const encounteredEnemy = enemyManager.activeEnemies.find(enemy => enemy.x === targetX && enemy.y === targetY);
    if (encounteredEnemy) {
      GameController.startBattle(encounteredEnemy);
      return; // Gagalkan perpindahan jalan karena langkah ini digunakan untuk menyerang
    }

    // 2. CEK DINDING: Jika tidak ada musuh, cek apakah jalannya terhalang tembok?
    if (mapManager.isTileWalkable(targetX, targetY)) {
      this.currentPlayer.x = targetX;
      this.currentPlayer.y = targetY;
      
      // Cek jika menginjak portal pusaka
      if (mapManager.matrix[targetY][targetX] === mapManager.TILE_PORTAL) {
        GameController.advanceFloor();
      }
    } else {
      console.log("Pergerakan diblokir: Terbentur dinding candi!");
    }
  }

  /**
   * Menggambar objek visual player ke atas Canvas menggunakan sprite teranimasi.
   * @param {CanvasRenderingContext2D} ctx 
   * @param {number} tileSize - Ukuran pixel per tile dari map
   */
  drawPlayer(ctx, tileSize) {
    if (!this.currentPlayer || !ctx) return;

    const px = this.currentPlayer.x * tileSize;
    const py = this.currentPlayer.y * tileSize;

    // Periksa apakah sprite sudah dimuat dengan benar
    if (playerSprite.complete && playerSprite.naturalWidth !== 0) {
      // Proses background putih agar transparan
      const renderedImg = window.processWhiteBackground(playerSprite);

      // Hitung indeks bingkai animasi (0-3) secara dinamis menggunakan ticker global
      const frameIndex = Math.floor((window.globalFrameTicker || 0) / 15) % 4;
      
      const imgWidth = playerSprite.naturalWidth;
      const imgHeight = playerSprite.naturalHeight;
      
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
      // Fallback visual jika berkas gambar belum siap (Kotak Biru Mistis + Gold Border)
      ctx.fillStyle = '#0077b6';
      ctx.fillRect(px + 4, py + 4, tileSize - 8, tileSize - 8);

      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
    }
  }

  /**
   * Menyimpan player ke LocalStorage
   */
  savePlayer() {
    if (!this.currentPlayer) return false;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.currentPlayer));
      return true;
    } catch (e) { 
      return false; 
    }
  }

  /**
   * Memuat player dari LocalStorage
   */
  loadPlayer() {
    try {
      const savedData = localStorage.getItem(this.storageKey);
      if (!savedData) return null;
      this.currentPlayer = JSON.parse(savedData);
      return this.currentPlayer;
    } catch (e) { 
      return null; 
    }
  }
}

// Inisialisasi global instance playerManager
const playerManager = new PlayerSystem();