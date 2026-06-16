/**
 * js/battle.js — BattleSystem
 *
 * Turn-based combat engine. Menerima EncounterResult dari SpawnSystem
 * dan menjalankan battle hingga salah satu pihak kalah.
 *
 * Prinsip desain:
 *   - BattleSystem adalah state machine dengan fase yang jelas
 *   - TIDAK tahu soal rendering — semua output lewat event/callback
 *   - Player data datang dari luar (GameState.player) — tidak di-hardcode
 *   - Setiap aksi menghasilkan BattleEvent yang bisa dilog atau ditampilkan UI
 *
 * Dependency:
 *   - SpawnSystem.rollLoot(), rollBerry()
 *   - DataLoader (untuk nama item di loot)
 *
 * Load order di HTML:
 *   map.js → spawn.js → battle.js → game.js
 */

const BattleSystem = (() => {

  // ─── Tipe Fase Battle ──────────────────────────────────────────────
  /**
   * @typedef {'idle'|'player_turn'|'enemy_turn'|'victory'|'defeat'|'fled'} BattlePhase
   */

  // ─── Konstanta ────────────────────────────────────────────────────
  const CRIT_CHANCE     = 0.15;   // 15% peluang critical hit
  const CRIT_MULTIPLIER = 1.75;   // damage × 1.75 saat crit
  const FLEE_BASE_CHANCE = 0.40;  // peluang kabur base
  const FLEE_SPD_BONUS   = 0.05;  // +5% per 10 poin selisih SPD player vs musuh rata-rata

  // ─── State Internal ───────────────────────────────────────────────
  let _state = null;
  /*
   * _state shape:
   * {
   *   phase       : BattlePhase
   *   player      : PlayerCombatant   ← snapshot dari GameState.player
   *   enemies     : MonsterInstance[] ← dari EncounterResult
   *   turn        : number            ← total turn yang sudah berlalu
   *   log         : BattleEvent[]
   *   onEvent     : function(BattleEvent) → void   ← callback ke UI
   *   onEnd       : function(BattleResult) → void  ← callback akhir battle
   * }
   */

  // ─── RNG Helpers ──────────────────────────────────────────────────
  const _rand    = () => Math.random();
  const _randInt = (min, max) => Math.floor(_rand() * (max - min + 1)) + min;

  // ─── Event System ─────────────────────────────────────────────────

  /**
   * Buat dan emit satu BattleEvent.
   * Semua perubahan state yang "bermakna" harus emit event.
   *
   * @typedef {Object} BattleEvent
   * @property {string}  type       - jenis event (lihat konstanta di bawah)
   * @property {Object}  data       - payload event
   * @property {number}  turn       - turn saat event terjadi
   * @property {string}  timestamp  - ISO string
   */
  const EVENT = {
    BATTLE_START   : "battle_start",
    TURN_START     : "turn_start",
    PLAYER_ATTACK  : "player_attack",
    ENEMY_ATTACK   : "enemy_attack",
    ENEMY_DEAD     : "enemy_dead",
    PLAYER_DEAD    : "player_dead",
    LOOT_DROP      : "loot_drop",
    PLAYER_FLEE    : "player_flee",
    FLEE_FAIL      : "flee_fail",
    BATTLE_END     : "battle_end",
    STATUS_EFFECT  : "status_effect",
  };

  function _emit(type, data = {}) {
    if (!_state) return;
    const event = { type, data, turn: _state.turn, timestamp: new Date().toISOString() };
    _state.log.push(event);
    if (typeof _state.onEvent === "function") {
      _state.onEvent(event);
    }
    // Console log ringkas untuk debug
    console.log(`[Battle] T${_state.turn} ${type}`, data);
  }

  // ─── Kalkulasi Combat ─────────────────────────────────────────────

  /**
   * Hitung damage setelah defense mitigation.
   * Formula: damage = max(1, atk - def * 0.5) × randomFactor × critMultiplier?
   *
   * Defense hanya mengurangi 50% dari nilainya — ada armor mitigation cap.
   *
   * @param {number} atk
   * @param {number} def
   * @returns {{ damage: number, isCrit: boolean }}
   */
  function _calcDamage(atk, def) {
    const isCrit     = _rand() < CRIT_CHANCE;
    const mitigation = def * 0.5;
    const base       = Math.max(1, atk - mitigation);
    const variance   = 0.85 + _rand() * 0.30;  // ±15% dari base
    let   damage     = base * variance;
    if (isCrit) damage *= CRIT_MULTIPLIER;
    return { damage: Math.round(damage), isCrit };
  }

  /**
   * Hitung peluang kabur.
   * Player lebih cepat dari rata-rata musuh → bonus peluang.
   * @returns {number} 0.0–1.0
   */
  function _calcFleeChance() {
    const playerSpd  = _state.player.stats.spd;
    const avgEnemySpd = _state.enemies
      .filter(e => e.isAlive)
      .reduce((s, e) => s + e.stats.spd, 0) / Math.max(1, _aliveEnemies().length);

    const spdDiff = playerSpd - avgEnemySpd;
    const bonus   = Math.max(0, spdDiff / 10) * FLEE_SPD_BONUS;
    return Math.min(0.90, FLEE_BASE_CHANCE + bonus);
  }

  // ─── Helpers State ────────────────────────────────────────────────

  const _aliveEnemies  = () => _state.enemies.filter(e => e.isAlive);
  const _isPlayerAlive = () => _state.player.currentHp > 0;

  /**
   * Tentukan urutan giliran berdasarkan SPD (player dan semua musuh hidup).
   * Lebih tinggi SPD → giliran lebih awal.
   * @returns {Array<{actor: string, ref: Object}>}
   *   actor: "player" | "enemy"
   *   ref:   MonsterInstance atau player object
   */
  function _buildTurnOrder() {
    const combatants = [
      { actor: "player", ref: _state.player, spd: _state.player.stats.spd },
      ..._aliveEnemies().map(e => ({ actor: "enemy", ref: e, spd: e.stats.spd })),
    ];
    // Sort descending by spd — sama: player duluan (tie-break)
    return combatants.sort((a, b) => b.spd - a.spd || (a.actor === "player" ? -1 : 1));
  }

  // ─── Aksi Player ──────────────────────────────────────────────────

  /**
   * Player menyerang satu musuh.
   * @param {MonsterInstance} target
   */
  function _doPlayerAttack(target) {
    const { damage, isCrit } = _calcDamage(
      _state.player.stats.atk,
      target.stats.def
    );

    target.currentHp = Math.max(0, target.currentHp - damage);
    if (target.currentHp <= 0) target.isAlive = false;

    _emit(EVENT.PLAYER_ATTACK, {
      targetId   : target.templateId,
      targetName : target.name,
      damage,
      isCrit,
      targetHpLeft: target.currentHp,
      targetDead  : !target.isAlive,
    });

    if (!target.isAlive) {
      _handleEnemyDeath(target);
    }
  }

  /**
   * Proses kematian musuh — roll loot, emit event.
   * @param {MonsterInstance} enemy
   */
  function _handleEnemyDeath(enemy) {
    const droppedItems = SpawnSystem.rollLoot(enemy);
    const droppedBerry = SpawnSystem.rollBerry(enemy);

    _emit(EVENT.ENEMY_DEAD, {
      enemyId    : enemy.templateId,
      enemyName  : enemy.name,
      exp        : enemy.exp_reward,
      berry      : droppedBerry,
      items      : droppedItems,
    });

    // Akumulasi ke battle state (BattleResult dihitung di akhir)
    _state.accumulatedExp   += enemy.exp_reward;
    _state.accumulatedBerry += droppedBerry;
    _state.accumulatedItems.push(...droppedItems);
  }

  // ─── Aksi Musuh ───────────────────────────────────────────────────

  /**
   * Satu musuh menyerang player.
   * @param {MonsterInstance} enemy
   */
  function _doEnemyAttack(enemy) {
    const { damage, isCrit } = _calcDamage(
      enemy.stats.atk,
      _state.player.stats.def
    );

    _state.player.currentHp = Math.max(0, _state.player.currentHp - damage);

    _emit(EVENT.ENEMY_ATTACK, {
      enemyId  : enemy.templateId,
      enemyName: enemy.name,
      damage,
      isCrit,
      playerHpLeft: _state.player.currentHp,
    });

    if (_state.player.currentHp <= 0) {
      _emit(EVENT.PLAYER_DEAD, { finalTurn: _state.turn });
    }
  }

  // ─── Resolusi Turn ────────────────────────────────────────────────

  /**
   * Jalankan satu penuh round — semua combatant bertindak satu kali,
   * diurutkan by SPD.
   *
   * Dipanggil oleh action handler (attack, flee, dll.) secara tidak langsung:
   * saat player memilih aksi, aksi player dieksekusi dulu, lalu musuh yang
   * masih hidup menyerang.
   *
   * @param {"attack"|"flee"} playerAction
   * @param {string|null} targetId - templateId musuh yang diserang (jika attack)
   */
  function _resolveRound(playerAction, targetId = null) {
    _state.turn += 1;
    _emit(EVENT.TURN_START, { turn: _state.turn, phase: _state.phase });

    const order = _buildTurnOrder();

    for (const { actor, ref } of order) {
      // Skip combatant yang sudah mati di tengah round
      if (actor === "enemy" && !ref.isAlive) continue;
      if (actor === "player" && !_isPlayerAlive()) continue;

      if (actor === "player") {
        // ── Aksi Player ──────────────────────────────────────────
        if (playerAction === "flee") {
          const fleeRoll = _rand();
          const fleeChance = _calcFleeChance();
          if (fleeRoll < fleeChance) {
            _emit(EVENT.PLAYER_FLEE, { fleeChance: fleeChance.toFixed(2) });
            _endBattle("fled");
            return;   // round selesai — player kabur
          } else {
            _emit(EVENT.FLEE_FAIL, { fleeChance: fleeChance.toFixed(2) });
            // Player gagal kabur, tidak ada serangan — musuh tetap menyerang
          }
        } else if (playerAction === "attack") {
          const target = _aliveEnemies().find(e => e.templateId === targetId)
                      ?? _aliveEnemies()[0];  // fallback: musuh hidup pertama
          if (target) _doPlayerAttack(target);
        }

      } else {
        // ── Aksi Musuh ───────────────────────────────────────────
        // Untuk sekarang: semua musuh menyerang player (AI sederhana)
        // TODO: tambah variasi skill / AI lebih kompleks
        if (_isPlayerAlive()) _doEnemyAttack(ref);
      }

      // Cek kondisi akhir setelah setiap aksi
      if (!_isPlayerAlive()) {
        _endBattle("defeat");
        return;
      }
      if (_aliveEnemies().length === 0) {
        _endBattle("victory");
        return;
      }
    }
  }

  // ─── Akhir Battle ─────────────────────────────────────────────────

  /**
   * @typedef {Object} BattleResult
   * @property {'victory'|'defeat'|'fled'} outcome
   * @property {number}   turnsElapsed
   * @property {number}   expGained
   * @property {number}   berryGained
   * @property {string[]} itemsGained
   * @property {number}   playerHpLeft
   * @property {Object[]} log             - full event log
   */
  function _endBattle(outcome) {
    _state.phase = outcome;

    const result = {
      outcome      : outcome,
      turnsElapsed : _state.turn,
      expGained    : outcome === "victory" ? _state.accumulatedExp   : 0,
      berryGained  : outcome === "victory" ? _state.accumulatedBerry : 0,
      itemsGained  : outcome === "victory" ? _state.accumulatedItems : [],
      playerHpLeft : _state.player.currentHp,
      log          : [..._state.log],
    };

    _emit(EVENT.BATTLE_END, result);

    if (typeof _state.onEnd === "function") {
      _state.onEnd(result);
    }

    console.log(
      `[Battle] ══ SELESAI (${outcome.toUpperCase()}) ══ ` +
      `T${result.turnsElapsed} | EXP+${result.expGained} | ` +
      `Berry+${result.berryGained} | Items: ${result.itemsGained.join(", ") || "—"}`
    );
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Mulai battle baru dari sebuah EncounterResult.
   *
   * @param {EncounterResult} encounter - dari SpawnSystem.generateEncounter()
   * @param {Object} player             - snapshot player saat ini
   * @param {Object} [options]
   * @param {Function} [options.onEvent] - callback(BattleEvent) untuk UI
   * @param {Function} [options.onEnd]   - callback(BattleResult) saat selesai
   */
  function start(encounter, player, { onEvent, onEnd } = {}) {
    if (_state && _state.phase !== "idle" &&
        _state.phase !== "victory" && _state.phase !== "defeat" && _state.phase !== "fled") {
      console.warn("[BattleSystem] Battle sedang berlangsung. Hentikan dulu.");
      return;
    }

    // Buat PlayerCombatant — snapshot agar stats combat tidak mutate GameState
    const playerCombatant = {
      name      : player.name,
      stats     : { ...player.stats },            // shallow copy stats
      currentHp : player.currentHp ?? player.stats.hp,
      skills    : [...(player.skills ?? [])],
    };

    _state = {
      phase            : "player_turn",
      player           : playerCombatant,
      enemies          : encounter.monsters,       // sudah MonsterInstance
      turn             : 0,
      log              : [],
      onEvent,
      onEnd,
      // Akumulator reward
      accumulatedExp   : 0,
      accumulatedBerry : 0,
      accumulatedItems : [],
    };

    _emit(EVENT.BATTLE_START, {
      islandId : encounter.islandId,
      floor    : encounter.floor,
      enemies  : encounter.monsters.map(m => ({ id: m.templateId, name: m.name, type: m.type })),
      hasElite : encounter.hasElite,
    });

    console.log(
      `[BattleSystem] Battle dimulai — F${encounter.floor} | ` +
      `${encounter.monsters.length} musuh | Player HP: ${playerCombatant.currentHp}`
    );
  }

  /**
   * Player memilih aksi "serang".
   * @param {string} [targetId] - templateId musuh yang dituju. Default: musuh pertama.
   */
  function actionAttack(targetId = null) {
    if (!_state || _state.phase !== "player_turn") {
      console.warn("[BattleSystem] Bukan giliran player atau battle belum mulai.");
      return;
    }
    const actualTarget = targetId
      ?? (_aliveEnemies()[0]?.templateId ?? null);
    _resolveRound("attack", actualTarget);
  }

  /**
   * Player memilih aksi "kabur".
   */
  function actionFlee() {
    if (!_state || _state.phase !== "player_turn") {
      console.warn("[BattleSystem] Bukan giliran player atau battle belum mulai.");
      return;
    }
    _resolveRound("flee");
  }

  /**
   * Ambil state battle saat ini (read-only snapshot).
   * @returns {Object|null}
   */
  function getState() {
    if (!_state) return null;
    return {
      phase     : _state.phase,
      turn      : _state.turn,
      playerHp  : _state.player?.currentHp,
      enemies   : _aliveEnemies().map(e => ({
        name     : e.name,
        type     : e.type,
        currentHp: e.currentHp,
        maxHp    : e.stats.hp,
      })),
    };
  }

  /**
   * Apakah sedang ada battle yang aktif?
   * @returns {boolean}
   */
  function isActive() {
    return _state !== null && _state.phase === "player_turn";
  }

  return {
    start,
    actionAttack,
    actionFlee,
    getState,
    isActive,
    EVENT,    // export konstanta event agar UI bisa subscribe by nama
  };
})();