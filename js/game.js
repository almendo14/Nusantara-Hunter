/**
 * game.js — Bootstrap & Game Loop
 * Entry point utama. Inisialisasi semua sistem setelah data selesai dimuat.
 *
 * Load order di HTML (urutan penting):
 *   1. map.js      → DataLoader
 *   2. spawn.js    → SpawnSystem
 *   3. battle.js   → BattleSystem
 *   4. game.js     → Bootstrap (entry point)
 */

// ─── State Global ────────────────────────────────────────────────────────────

const GameState = {
  currentIslandId : "island_dawn_reef",
  currentFloor    : 1,
  player          : null,   // diisi initPlayer()
  currentBattle   : null,   // BattleResult terakhir
  phase           : 'MENU', // 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER'
};



// ─── Player ───────────────────────────────────────────────────────────────────

/**
 * Buat player default.
 * @returns {Object} PlayerData
 */
function initPlayer() {
  GameState.player = {
    name     : "Nakama",
    stats    : { hp: 500, atk: 60, def: 35, spd: 20 },
    currentHp: 500,
    skills   : ["skill_basic_attack"],
    level    : 1,
    exp      : 0,
    berry    : 0,
    inventory: [],
    x        : 1,
    y        : 1,
  };
  if (typeof playerManager !== 'undefined') {
    playerManager.currentPlayer = GameState.player;
  }
  console.log("[Game] Player siap:", GameState.player.name);
}

// ─── Extends UIManager dengan Log System ─────────────────────────────────────
if (typeof UIManager !== 'undefined' && !UIManager.writeLog) {
  UIManager.writeLog = function(message, type) {
    const $log = $('#combat-log');
    if ($log.length) {
      const dateStr = new Date().toLocaleTimeString('id-ID');
      const logClass = type || 'log-system';
      const line = `<div class="log-line ${logClass}">[${dateStr}] ${message}</div>`;
      $log.append(line);
      $log.scrollTop($log[0].scrollHeight);
    }
    console.log(`[Log] [${type}] ${message}`);
  };
}

// ─── Battle Handlers ──────────────────────────────────────────────────────────

/**
 * Memulai pertempuran melawan monster tertentu secara otomatis.
 */
function triggerMonsterBattle(enemy) {
  GameController.activeEnemyInBattle = enemy;
  
  const monsterInstance = JSON.parse(JSON.stringify(enemy));
  monsterInstance.templateId = enemy.id;
  monsterInstance.currentHp = enemy.stats ? enemy.stats.hp : 50;
  monsterInstance.isAlive = true;

  const encounterData = {
    islandId: GameState.currentIslandId,
    floor: GameState.currentFloor,
    monsters: [monsterInstance],
    hasElite: enemy.type === 'elite'
  };

  // Switch GameState.phase to PAUSED internally to lock input during battle transition
  GameState.phase = 'PAUSED';

  BattleSystem.start(encounterData, GameState.player, {
    onEvent: (event) => {
      switch (event.type) {
        case BattleSystem.EVENT.BATTLE_START:
          // Clear combat log and write battle start message
          $('#combat-log').html('');
          UIManager.writeLog(`⚔️ Pertempuran dimulai melawan ${enemy.name}!`, "log-system");
          UIManager.renderBattleUI();
          break;
          
        case BattleSystem.EVENT.PLAYER_ATTACK:
          const pCrit = event.data.isCrit ? " (CRITICAL HIT!)" : "";
          UIManager.writeLog(`${GameState.player.name} menyerang ${event.data.targetName} sebesar ${event.data.damage} damage!${pCrit}`, "log-combat");
          if (typeof AudioManager !== 'undefined') {
            AudioManager.playSFX('sfx_attack', 0.6);
          }
          UIManager.renderBattleUI();
          break;
          
        case BattleSystem.EVENT.ENEMY_ATTACK:
          const eCrit = event.data.isCrit ? " (CRITICAL!)" : "";
          UIManager.writeLog(`${event.data.enemyName} menyerang balik ${GameState.player.name} sebesar ${event.data.damage} damage!${eCrit}`, "log-enemy");
          if (typeof AudioManager !== 'undefined') {
            AudioManager.playSFX('sfx_hurt', 0.6);
          }
          UIManager.renderBattleUI();
          break;
          
        case BattleSystem.EVENT.ENEMY_DEAD:
          UIManager.writeLog(`${event.data.enemyName} dikalahkan! Memperoleh +${event.data.exp} EXP, +${event.data.berry} Berry, Loot: [${event.data.items.join(", ") || "tidak ada"}]`, "log-victory");
          break;
          
        case BattleSystem.EVENT.PLAYER_DEAD:
          UIManager.writeLog("Karakter Anda telah gugur!", "log-system");
          break;
          
        case BattleSystem.EVENT.PLAYER_FLEE:
          UIManager.writeLog("Berhasil melarikan diri dari pertarungan!", "log-system");
          break;
          
        case BattleSystem.EVENT.FLEE_FAIL:
          UIManager.writeLog("Gagal melarikan diri!", "log-system");
          break;
      }
    },
    onEnd: (result) => {
      GameState.currentBattle = result;

      if (result.outcome === 'victory') {
        // Update player stats in playerManager.currentPlayer
        if (playerManager.currentPlayer) {
          playerManager.currentPlayer.exp += result.expGained;
          playerManager.currentPlayer.gold = (playerManager.currentPlayer.gold || 0) + result.berryGained;
          
          GameState.player.exp = playerManager.currentPlayer.exp;
          GameState.player.berry = playerManager.currentPlayer.gold;
          GameState.player.currentHp = result.playerHpLeft;
          playerManager.currentPlayer.currentHp = result.playerHpLeft;

          // Check level up: e.g. every 100 EXP
          const expNeeded = playerManager.currentPlayer.level * 100;
          let leveledUp = false;
          if (playerManager.currentPlayer.exp >= expNeeded) {
            playerManager.currentPlayer.exp -= expNeeded;
            playerManager.currentPlayer.level += 1;
            
            // Upgrade stats slightly
            playerManager.currentPlayer.stats.hp += 50;
            playerManager.currentPlayer.stats.atk += 8;
            playerManager.currentPlayer.stats.def += 4;
            playerManager.currentPlayer.stats.spd += 2;
            playerManager.currentPlayer.currentHp = playerManager.currentPlayer.stats.hp;
            
            GameState.player.exp = playerManager.currentPlayer.exp;
            GameState.player.level = playerManager.currentPlayer.level;
            GameState.player.currentHp = playerManager.currentPlayer.currentHp;
            leveledUp = true;
          }

          if (leveledUp) {
            UIManager.writeLog(`LEVEL UP! Selamat, level Anda naik ke Level ${playerManager.currentPlayer.level}!`, "log-victory");
            if (typeof AudioManager !== 'undefined') {
              AudioManager.playSFX('sfx_levelup', 0.7);
            }
          }
        }

        // Hapus musuh yang dikalahkan dari peta
        enemyManager.activeEnemies = enemyManager.activeEnemies.filter(e => e !== GameController.activeEnemyInBattle);
        GameController.activeEnemyInBattle = null;

        // Tutup UI Pertarungan, kembalikan phase ke PLAYING, dan render ulang map
        GameState.phase = 'PLAYING';
        startRenderLoop();
        UIManager.renderBattleUI();
        GameController.renderGameSurface();
        UIManager.updateHUD(GameState.player.currentHp, GameState.player.stats.hp, GameState.player.berry, GameState.currentFloor);
        
      } else if (result.outcome === 'defeat') {
        GameController.activeEnemyInBattle = null;
        GameController.triggerGameOver("Gugur dalam pertempuran sengit.");
      } else if (result.outcome === 'fled') {
        GameController.activeEnemyInBattle = null;
        GameState.phase = 'PLAYING';
        startRenderLoop();
        UIManager.renderBattleUI();
        GameController.renderGameSurface();
      }
    }
  });
}

// Keep backward compatible callback redirects
function onBattleEvent(event) {
  // Handled inside triggerMonsterBattle
}
function onBattleEnd(result) {
  // Handled inside triggerMonsterBattle
}

// ─── Floor Navigation ─────────────────────────────────────────────────────────

/**
 * Dipanggil setiap kali player masuk ke lantai baru.
 * @param {string} islandId
 * @param {number} floor
 */
function enterFloor(islandId, floor) {
  GameState.currentIslandId = islandId;
  GameState.currentFloor    = floor;
  GameState.floor           = floor;

  const preview = SpawnSystem.previewFloor(islandId, floor);
  UIManager.writeLog(`Memasuki F${floor} — musuh: ${preview.monsterCount.min}–${preview.monsterCount.max}, elite: ${(preview.eliteChance * 100).toFixed(0)}%`, "log-system");

  // Inisialisasi peta dan musuh di lantai ini
  mapManager.generateMap();
  enemyManager.spawnRandomEnemies(3);

  // Set ulang posisi awal player
  GameState.player.x = 1;
  GameState.player.y = 1;
  if (typeof playerManager !== 'undefined') {
    playerManager.currentPlayer = GameState.player;
  }

  // Perbarui UI dan Render
  GameController.renderGameSurface();
  UIManager.updateHUD(GameState.player.currentHp, GameState.player.stats.hp, GameState.player.berry, GameState.currentFloor);
}

/**
 * Pindah ke lantai berikutnya setelah battle selesai.
 */
function advanceFloor() {
  if (BattleSystem.isActive()) {
    console.warn("[Game] Tidak bisa advance — battle masih berlangsung.");
    return;
  }

  // Increment lantai
  GameState.floor = (GameState.floor || GameState.currentFloor || 1) + 1;
  GameState.currentFloor = GameState.floor;

  if (GameState.currentFloor > 3) {
    UIManager.writeLog("🎉 Pulau Dawn Reef Berhasil Ditaklukkan!", "log-victory");
    // Reset floor to 1 or direct back to main menu
    GameState.floor = 1;
    GameState.currentFloor = 1;
    enterFloor(GameState.currentIslandId, GameState.currentFloor);
    return;
  }

  // Clear old grid, generate fresh layout, reset player to (1,1), spawn 3 enemies, re-render
  enterFloor(GameState.currentIslandId, GameState.currentFloor);
}

// ─── Orchestrator: GameController ──────────────────────────────────────────

const GameController = {
  activeEnemyInBattle: null,

  /**
   * Mulai fase pertarungan terstruktur dengan musuh tertentu
   */
  startBattle: function(enemy) {
    this.activeEnemyInBattle = enemy;
    GameState.phase = 'PAUSED'; // lock input
    triggerMonsterBattle(enemy);
  },

  /**
   * Pemicu layar game over
   */
  triggerGameOver: function(customSummary) {
    GameState.phase = 'GAMEOVER';
    const turns = GameState.currentBattle ? GameState.currentBattle.turnsElapsed : 0;
    const summary = customSummary || `Nakama gugur di lantai F${GameState.currentFloor} setelah berjuang selama ${turns} giliran.`;
    UIManager.showGameOver(summary);
  },

  /**
   * Gambar ulang seluruh elemen game ke atas Canvas
   */
  renderGameSurface: function() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const tileSize = 32;

    // 1. Gambar Ubin Map
    if (mapManager && mapManager.matrix) {
      const rows = mapManager.matrix.length;
      const cols = mapManager.matrix[0] ? mapManager.matrix[0].length : 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tile = mapManager.matrix[r][c];
          if (tile === mapManager.TILE_WALL) {
            ctx.fillStyle = '#1a0a00'; // Dinding
          } else if (tile === mapManager.TILE_PORTAL) {
            ctx.fillStyle = '#06b6d4'; // Portal tangga
          } else {
            ctx.fillStyle = '#2a1a08'; // Tanah
          }
          ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);

          // Grid line halus
          ctx.strokeStyle = '#3d2511';
          ctx.lineWidth = 1;
          ctx.strokeRect(c * tileSize, r * tileSize, tileSize, tileSize);
        }
      }
    }

    // 2. Gambar Musuh
    if (typeof enemyManager !== 'undefined' && typeof enemyManager.drawEnemies === 'function') {
      enemyManager.drawEnemies(ctx, tileSize);
    }

    // 3. Gambar Player
    if (typeof playerManager !== 'undefined' && typeof playerManager.drawPlayer === 'function') {
      playerManager.currentPlayer = GameState.player;
      playerManager.drawPlayer(ctx, tileSize);
    }
  },

  /**
   * Maju ke lantai berikutnya
   */
  advanceFloor: function() {
    advanceFloor();
  },

  /**
   * Handle pergerakan player dan periksa collision musuh
   */
  movePlayer: function(dx, dy) {
    if (GameState.phase !== 'PLAYING' || BattleSystem.isActive()) return;

    if (typeof playerManager !== 'undefined') {
      playerManager.move(dx, dy);
    }
  },

  /**
   * Jeda Permainan (Pause)
   */
  pause: function() {
    if (GameState.phase !== 'PLAYING') return;
    GameState.phase = 'PAUSED';
    UIManager.showPause();
    UIManager.writeLog("Permainan dijeda.", "log-system");
  },

  /**
   * Lanjutkan Permainan (Resume)
   */
  resume: function() {
    if (GameState.phase !== 'PAUSED') return;
    GameState.phase = 'PLAYING';
    UIManager.hidePause();
    startRenderLoop(); // Restart animation frame render loop
    UIManager.writeLog("Permainan dilanjutkan.", "log-system");
  },

  /**
   * Kembali ke Menu Utama
   */
  goToMenu: function() {
    UIManager.hidePause();
    $('#screen-gameover').hide();
    UIManager.showMenu();
    GameState.phase = 'MENU';
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playBGM('bgm_menu', 0.3);
    }
  }
};

// ─── Override Fungsi PlayerManager.Move untuk integrasi BattleSystem ────────
if (typeof playerManager !== 'undefined') {
  playerManager.move = function(dx, dy) {
    if (!this.currentPlayer) return;

    const targetX = this.currentPlayer.x + dx;
    const targetY = this.currentPlayer.y + dy;

    // 1. Cek collision musuh pada koordinat tujuan
    const encounteredEnemy = enemyManager.activeEnemies.find(enemy => enemy.x === targetX && enemy.y === targetY);
    if (encounteredEnemy) {
      GameState.phase = 'PAUSED'; // lock input
      triggerMonsterBattle(encounteredEnemy);
      return; // stop player movement
    }

    // 2. Cek collision dinding
    if (mapManager.isTileWalkable(targetX, targetY)) {
      this.currentPlayer.x = targetX;
      this.currentPlayer.y = targetY;

      // Cek portal
      if (mapManager.matrix[targetY][targetX] === mapManager.TILE_PORTAL) {
        GameController.advanceFloor();
      } else {
        GameController.renderGameSurface();
      }
    } else {
      console.log("[Game] Pergerakan terhalang dinding!");
    }
  };
}

// ─── Run Launchers ──────────────────────────────────────────────────────────

function startNewRun() {
  initPlayer();
  GameState.phase = 'PLAYING';
  UIManager.showGame();

  // Play BGM exploration
  if (typeof AudioManager !== 'undefined') {
    AudioManager.playBGM('bgm_game', 0.4);
  }

  // Explicitly re-initialize canvas size properties to prevent collapsing
  const canvas = document.getElementById('game-canvas');
  if (canvas && typeof mapManager !== 'undefined') {
    const tileSize = mapManager.tileSize || 32;
    canvas.width = mapManager.mapSize * tileSize;
    canvas.height = mapManager.mapSize * tileSize;
  }

  // Start continuous rendering animation loop
  startRenderLoop();

  // Force the initial frame render immediately right after screen switch
  GameController.renderGameSurface();

  // Enter first floor
  enterFloor(GameState.currentIslandId, 1);
  UIManager.writeLog("Petualangan baru dimulai! Jelajahi kepulauan...", "log-system");
}

function resumeSavedRun() {
  const loaded = SaveManager.load();
  if (loaded) {
    GameState.currentFloor = loaded.floor;
    GameState.player = loaded.player;
    if (typeof playerManager !== 'undefined') {
      playerManager.currentPlayer = GameState.player;
    }
    GameState.phase = 'PLAYING';
    UIManager.showGame();

    // Play BGM exploration
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playBGM('bgm_game', 0.4);
    }

    // Explicitly re-initialize canvas size properties to prevent collapsing
    const canvas = document.getElementById('game-canvas');
    if (canvas && typeof mapManager !== 'undefined') {
      const tileSize = mapManager.tileSize || 32;
      canvas.width = mapManager.mapSize * tileSize;
      canvas.height = mapManager.mapSize * tileSize;
    }

    // Start continuous rendering animation loop
    startRenderLoop();

    // Force the initial frame render immediately right after screen switch
    GameController.renderGameSurface();
    
    // Inisialisasi peta dan musuh di lantai tersimpan
    mapManager.generateMap();
    enemyManager.spawnRandomEnemies(3);
    
    // Render and update HUD
    GameController.renderGameSurface();
    UIManager.updateHUD(GameState.player.currentHp, GameState.player.stats.hp, GameState.player.berry, GameState.currentFloor);
    UIManager.writeLog("Petualangan berhasil dimuat!", "log-system");
  }
}

// ─── Movement Handler ────────────────────────────────────────────────────────

const MovementHandler = {
  handleMove: function(dx, dy) {
    if (GameState.phase !== 'PLAYING' || BattleSystem.isActive()) return;
    if (typeof playerManager !== 'undefined') {
      playerManager.move(dx, dy);
    }
  },
  
  _onKeyDown: function(e) {
    if (GameState.phase !== 'PLAYING' || BattleSystem.isActive()) return;

    let dx = 0, dy = 0;
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        dy = -1;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        dy = 1;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        dx = -1;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        dx = 1;
        break;
    }

    if (dx !== 0 || dy !== 0) {
      MovementHandler.handleMove(dx, dy);
    }
  }
};

// ─── Input & Bindings ────────────────────────────────────────────────────────

const ButtonBindings = {
  init: function() {
    // Bind input keyboard untuk pergerakan
    $(document).off('keydown').on('keydown', (e) => {
      // Tangani Escape untuk Jeda / Lanjutkan permainan
      if (e.key === 'Escape') {
        if (GameState.phase === 'PLAYING' && !BattleSystem.isActive()) {
          GameController.pause();
        } else if (GameState.phase === 'PAUSED') {
          GameController.resume();
        }
        return;
      }

      // Delegate movement keys to MovementHandler
      MovementHandler._onKeyDown(e);
    });

    // Bind input D-Pad layar sentuh
    $('#dpad-up').off('click').on('click', () => MovementHandler.handleMove(0, -1));
    $('#dpad-down').off('click').on('click', () => MovementHandler.handleMove(0, 1));
    $('#dpad-left').off('click').on('click', () => MovementHandler.handleMove(-1, 0));
    $('#dpad-right').off('click').on('click', () => MovementHandler.handleMove(1, 0));

    // Tangani D-Pad center untuk Jeda
    $('#dpad-center').off('click').on('click', () => {
      if (GameState.phase === 'PLAYING' && !BattleSystem.isActive()) {
        GameController.pause();
      }
    });

    // Bind tombol aksi pertarungan
    $('#btn-attack').off('click').on('click', () => {
      if (BattleSystem.isActive()) {
        BattleSystem.actionAttack();
      } else {
        UIManager.writeLog("Tidak ada pertarungan aktif!", "log-system");
      }
    });

    $('#btn-item').off('click').on('click', () => {
      if (BattleSystem.isActive()) {
        // Tombol item digunakan untuk melarikan diri (flee) dalam mode pertarungan
        BattleSystem.actionFlee();
      } else if (GameState.phase === 'PLAYING') {
        GameController.pause();
      }
    });

    // Bind tombol skill
    $('#btn-skill').off('click').on('click', () => {
      UIManager.writeLog("Keterampilan khusus (Skill) belum dikembangkan.", "log-system");
    });

    // Bind layar menu utama
    $('#btn-new-game').off('click').on('click', () => {
      startNewRun();
    });

    // Ambil kemajuan simpanan jika ada
    if (SaveManager.hasSave()) {
      $('#btn-continue').prop('disabled', false);
    }

    $('#btn-continue').off('click').on('click', () => {
      resumeSavedRun();
    });

    // Bind tombol kredit (Credits)
    $('#btn-credits').off('click').on('click', () => {
      $('#credits-modal').fadeIn(200).css('display', 'flex');
    });

    $('#btn-close-credits').off('click').on('click', () => {
      $('#credits-modal').fadeOut(150);
    });

    // Bind menu jeda & game over
    $('#btn-resume').off('click').on('click', () => {
      GameController.resume();
    });

    $('#btn-save').off('click').on('click', () => {
      // Simpan kemajuan GameState saat ini
      const saveData = {
        floor: GameState.currentFloor,
        player: GameState.player
      };
      SaveManager.save(saveData);
      UIManager.writeLog("Petualangan berhasil disimpan!", "log-system");
      GameController.resume();
    });

    $('#btn-main-menu, #btn-back-menu').off('click').on('click', () => {
      GameController.goToMenu();
    });

    $('#btn-retry').off('click').on('click', () => {
      $('#screen-gameover').hide();
      startNewRun();
    });
  }
};

function setupBindings() {
  ButtonBindings.init();
}

// ─── Continuous Render Loop ──────────────────────────────────────────────────

let renderLoopActive = false;
window.globalFrameTicker = 0;

function startRenderLoop() {
  if (!renderLoopActive) {
    renderLoopActive = true;
    runRenderLoop();
  }
}

function runRenderLoop() {
  if (GameState.phase === 'PLAYING') {
    // Increment ticker. Cycles from 0 to 59, mapping to 0 to 3 for anim frame indices
    window.globalFrameTicker = (window.globalFrameTicker + 1) % 60;
    GameController.renderGameSurface();
    requestAnimationFrame(runRenderLoop);
  } else {
    renderLoopActive = false;
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function initGame() {
  console.log("[Game] ══ Memulai inisialisasi ══");

  try {
    // 1. Muat database JSON
    await DataLoader.loadAll();
    
    // 2. Pasang event listener dan input binding
    setupBindings();

    // Play Main Menu BGM immediately on launch
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playBGM('bgm_menu', 0.3);
    }

    console.log("[Game] Sistem siap. Menunggu input menu utama...");

  } catch (err) {
    console.error("[Game] Inisialisasi gagal:", err);
  }
}

document.addEventListener("DOMContentLoaded", initGame);