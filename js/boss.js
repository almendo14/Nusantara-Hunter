// js/boss.js
/**
 * Boss Module - Kelas turunan atau khusus untuk Boss penjaga gerbang pulau
 */
class Boss extends Enemy {
    constructor(config) {
        super(config);
        this.isBoss = true;
        this.specialSkill = config.specialSkill;
    }
}