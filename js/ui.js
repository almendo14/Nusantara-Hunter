/**
 * js/ui.js
 * ═══════════════════════════════════════════════════════════════════════════
 * UI & Screen Manager — Nusantara Hunter
 * ═══════════════════════════════════════════════════════════════════════════
 */

const UIManager = {
    screens: {
        menu: '#screen-menu',
        game: '#screen-game',
        pause: '#screen-pause',
        gameOver: '#screen-gameover'
    },

    /** Fungsi internal untuk mematikan semua layar dan menghidupkan satu target */
    _switch: function(targetSelector) {
        $('.screen').hide().removeClass('active');
        $(targetSelector).fadeIn(200).addClass('active');
    },

    // ── Pemetaan Fungsi yang Dipanggil oleh GameController ──
    showMenu: function() { 
        this._switch(this.screens.menu); 
    },
    
    showGame: function() { 
        this._switch(this.screens.game); 
    },
    
    showPause: function() { 
        // Khusus screen pause overlay, kita gunakan .show() tanpa mematikan screen game di latar belakang
        $(this.screens.pause).fadeIn(150).addClass('active'); 
    },
    
    hidePause: function() { 
        $(this.screens.pause).fadeOut(150).removeClass('active'); 
    },
    
    showGameOver: function(summaryText) {
        $('#gameover-summary').text(summaryText);
        $(this.screens.gameOver).fadeIn(200).addClass('active');
    },

    /**
     * Memperbarui komponen teks HUD di atas Canvas
     */
    updateHUD: function(hp, maxHp, gold, floor) {
        const hpText = hp !== undefined && maxHp !== undefined ? `${hp}/${maxHp}` : '--/--';
        const goldText = gold !== undefined ? gold : '0';
        const floorText = floor !== undefined ? `Pulau ${floor}` : '--';

        $('#hud-hp-val').text(hpText);
        $('#hud-gold-val').text(goldText);
        $('#hud-floor-val').text(floorText);
    },

    /**
     * Memperbarui UI Pertarungan secara dinamis berdasarkan status pertempuran
     * @param {Object} [battleState] - Status pertarungan dari BattleSystem.getState()
     */
    renderBattleUI: function(battleState) {
        const active = typeof BattleSystem !== 'undefined' && BattleSystem.isActive();
        
        if (active) {
            // Aktifkan visual mode pertarungan pada tombol aksi
            $('#action-btns').addClass('combat-mode');
            $('#btn-attack').addClass('glowing-combat-btn');
            
            // Tombol ransel berubah fungsi jadi kabur (flee) saat bertarung
            $('#btn-item').html('🏃').attr('title', 'Kabur (Flee)');
            
            // Dapatkan state pertarungan saat ini
            const state = battleState || (typeof BattleSystem !== 'undefined' ? BattleSystem.getState() : null);
            let $hpBar = $('#enemy-hp-bar-container');
            
            // Bangun container HP bar musuh jika belum dibuat
            if ($hpBar.length === 0) {
                $hpBar = $(`
                    <div id="enemy-hp-bar-container">
                        <div id="enemy-hp-name"></div>
                        <div class="hp-bar-outer">
                            <div class="hp-bar-inner"></div>
                        </div>
                        <div id="enemy-hp-text"></div>
                    </div>
                `);
                $('#screen-game').append($hpBar);
            }
            
            if (state && state.enemies && state.enemies.length > 0) {
                const enemy = state.enemies[0];
                $hpBar.show();
                
                // Set nama musuh (tambahkan icon tengkorak jika elite)
                const namePrefix = enemy.type === 'elite' ? '💀 ' : '👾 ';
                $('#enemy-hp-name').text(namePrefix + enemy.name);
                
                if (enemy.type === 'elite') {
                    $('#enemy-hp-name').addClass('text-elite');
                } else {
                    $('#enemy-hp-name').removeClass('text-elite');
                }
                
                // Kalkulasi persentase nyawa musuh
                const pct = Math.max(0, Math.min(100, (enemy.currentHp / enemy.maxHp) * 100));
                $hpBar.find('.hp-bar-inner').css('width', pct + '%');
                $('#enemy-hp-text').text(`${enemy.currentHp} / ${enemy.maxHp} HP`);
                
                // Berikan animasi denyut flash merah jika terkena serangan
                $hpBar.addClass('flash-hit');
                setTimeout(() => $hpBar.removeClass('flash-hit'), 250);
            } else {
                $hpBar.fadeOut(150);
            }
        } else {
            // Kembalikan tombol aksi ke mode normal eksplorasi
            $('#action-btns').removeClass('combat-mode');
            $('#btn-attack').removeClass('glowing-combat-btn');
            $('#btn-item').html('🎒').attr('title', 'Tas (Inventory)');
            
            // Sembunyikan HP bar musuh
            $('#enemy-hp-bar-container').fadeOut(150);
        }
    }
};