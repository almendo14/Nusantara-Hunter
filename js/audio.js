/**
 * js/audio.js — AudioManager
 *
 * Mengelola semua efek suara (SFX) dan musik latar belakang (BGM).
 * Menghindari tumpang tindih BGM yang sama dan mendukung tumpang tindih SFX yang cepat.
 */

const AudioManager = (() => {
  // ─── Pemetaan File Aset Audio ─────────────────────────────────────
  const assets = {
    'bgm_menu': 'assets/audio/bgm_main_menu.mp3',
    'bgm_game': 'assets/audio/bgm_exploration.mp3',
    'sfx_attack': 'assets/audio/sfx_hit.mp3',
    'sfx_hurt': 'assets/audio/sfx_hurt.mp3',
    'sfx_levelup': 'assets/audio/sfx_level_up.mp3'
  };

  // State audio saat ini
  let currentBGMKey = null;
  let currentBGM = null;

  /**
   * Putar BGM secara terus-menerus (loop).
   * Jika lagu yang sama sedang diputar, volume akan disesuaikan saja tanpa memutar ulang.
   * @param {string} key - Kunci aset lagu
   * @param {number} [volume=0.5] - Volume suara (0.0 sampai 1.0)
   */
  function playBGM(key, volume = 0.5) {
    const path = assets[key];
    if (!path) {
      console.warn(`[AudioManager] Aset BGM dengan kunci "${key}" tidak ditemukan.`);
      return;
    }

    // Jika lagu yang sama sedang aktif, hanya sesuaikan volumenya saja
    if (currentBGMKey === key && currentBGM) {
      currentBGM.volume = volume;
      return;
    }

    // Hentikan BGM yang sedang diputar sebelumnya
    stopBGM();

    try {
      currentBGMKey = key;
      currentBGM = new Audio(path);
      currentBGM.loop = true;
      currentBGM.volume = volume;

      // Browser modern memblokir autoplay sebelum interaksi user
      const playPromise = currentBGM.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log("[AudioManager] Autoplay musik latar tertunda oleh kebijakan browser. Menunggu klik.");
          
          // Dengarkan interaksi user pertama kali untuk memicu musik
          const startOnInteraction = () => {
            if (currentBGM && currentBGMKey === key) {
              currentBGM.play().catch(() => {});
            }
            document.removeEventListener('click', startOnInteraction);
            document.removeEventListener('keydown', startOnInteraction);
          };
          document.addEventListener('click', startOnInteraction);
          document.addEventListener('keydown', startOnInteraction);
        });
      }
    } catch (e) {
      console.error("[AudioManager] Gagal memutar BGM:", e);
    }
  }

  /**
   * Hentikan musik latar belakang (BGM) aktif.
   */
  function stopBGM() {
    if (currentBGM) {
      try {
        currentBGM.pause();
        currentBGM.currentTime = 0;
      } catch (e) {}
      currentBGM = null;
      currentBGMKey = null;
    }
  }

  /**
   * Putar efek suara (SFX) secara instan.
   * Mendukung pemutaran tumpang tindih jika dipicu dalam interval singkat.
   * @param {string} key - Kunci aset efek suara
   * @param {number} [volume=0.5] - Volume suara (0.0 sampai 1.0)
   */
  function playSFX(key, volume = 0.5) {
    const path = assets[key];
    if (!path) {
      console.warn(`[AudioManager] Aset SFX dengan kunci "${key}" tidak ditemukan.`);
      return;
    }

    try {
      const sfx = new Audio(path);
      sfx.volume = volume;
      sfx.play().catch(error => {
        // Abaikan error autoplay block untuk SFX
      });
    } catch (e) {
      console.error("[AudioManager] Gagal memutar SFX:", e);
    }
  }

  return {
    playBGM,
    stopBGM,
    playSFX
  };
})();
