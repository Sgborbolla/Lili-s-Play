(() => {
  const screen = document.getElementById('ds-screen');
  const canvas = document.getElementById('ds-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const pad = window.LilyPad;
  if (!screen || !canvas || !ctx || !pad) return;

  const titleEl = document.getElementById('ds-screen-title');
  const textEl = document.getElementById('ds-screen-text');
  const hintEl = document.getElementById('ds-screen-hint');
  const bootTitleMarkup = titleEl ? titleEl.innerHTML : '';
  const tvPowerBtn = document.getElementById('ds-tv-power');
  const tvStatusEl = document.getElementById('ds-tv-status');
  const GAME_NAME = 'ÓRBITA CERO';

  const VW = 640;
  const VH = 360;
  const TOP = 58;
  const PLAYER_Y = 324;
  const TAU = Math.PI * 2;
  let dpr = 1;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const scale = rect.width / VW;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  };

  resize();
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }

  const game = {
    mode: 'off',
    time: 0,
    boot: 0,
    bootPhase: 0,
    score: 0,
    best: 0,
    lives: 3,
    level: 1,
    wave: 1,
    waveTotal: 0,
    phase: 'wave',
    waveClearTimer: 0,
    transitionTimer: 0,
    transitionTo: '',
    invasionCooldown: 0,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    missiles: [],
    pickups: [],
    particles: [],
    rings: [],
    boss: null,
    enemyFireTimer: 0,
    formation: { dir: 1 },
    shake: 0,
    flash: 0,
    message: '',
    messageTime: 0,
    banner: { title: '', subtitle: '', life: 0, max: 0 }
  };

  const player = {
    x: VW / 2,
    y: PLAYER_Y,
    vx: 0,
    r: 10,
    tilt: 0,
    invuln: 0,
    shield: 0,
    weapon: 1,
    magnet: 0,
    drones: 0,
    droneFireTimer: 0,
    missiles: 0,
    bombs: 0,
    fireTimer: 0,
    muzzle: 0,
    hitFlash: 0
  };

  const keys = ['ps', 'cross', 'circle', 'options', 'touchpad', 'left', 'right', 'up', 'down'];
  const prev = Object.create(null);
  const edges = Object.create(null);
  const down = (key) => !!pad.state.buttons[key];

  const readEdges = () => {
    keys.forEach((key) => {
      const active = down(key);
      edges[key] = active && !prev[key];
      prev[key] = active;
    });
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const withAlpha = (hex, alpha) => {
    const value = parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  };

  const setOverlay = (title, text, hint) => {
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.removeAttribute('aria-label');
    }
    if (textEl) textEl.textContent = text;
    if (hintEl) hintEl.textContent = hint;
  };

  const setOverlayText = (text, hint) => {
    if (textEl) textEl.textContent = text;
    if (hintEl) hintEl.textContent = hint;
  };

  const setBootTitle = () => {
    if (!titleEl || !bootTitleMarkup) return;
    titleEl.innerHTML = bootTitleMarkup;
    titleEl.setAttribute('aria-label', GAME_NAME);
  };

  const setMode = (mode) => {
    game.mode = mode;
    screen.dataset.state = mode;
    if (tvPowerBtn) tvPowerBtn.setAttribute('aria-pressed', String(mode !== 'off'));
    if (tvStatusEl) {
      tvStatusEl.textContent = mode === 'off' ? 'STANDBY' : 'ON';
      tvStatusEl.classList.toggle('is-on', mode !== 'off');
    }
    if (mode === 'off') {
      setOverlay(GAME_NAME, 'Pulsa el botón de la TV o PS para encender', 'El mando es la consola');
    } else if (mode === 'boot') {
      setBootTitle();
      setOverlayText('Una experiencia arcade en 3D.', 'ARCADE · ÓRBITA CERO');
    } else if (mode === 'menu') {
      setOverlay(GAME_NAME, '1 nivel · 4 oleadas · 2 jefes. Recoge mejoras: P disparo · M misil · B bomba · I imán · E escudo · D drones · L vida.', '✕ disparar · ○ especial · Options pausa');
    } else if (mode === 'paused') {
      setOverlay('PAUSA', `NIVEL ${game.level} · OLEADA ${game.wave}/4 · PUNTOS ${String(game.score).padStart(5, '0')}`, 'Options continuar · PS apagar');
    } else if (mode === 'over') {
      setOverlay('FIN DEL JUEGO', `PUNTOS ${String(game.score).padStart(5, '0')} · RÉCORD ${String(game.best).padStart(5, '0')}`, '✕ reintentar · PS apagar');
    } else if (mode === 'victory') {
      setOverlay('MISIÓN CUMPLIDA', `ÓRBITA CERO · PUNTOS ${String(game.score).padStart(5, '0')} · RÉCORD ${String(game.best).padStart(5, '0')}`, '✕ volver a jugar · PS apagar');
    }
  };

  const message = (text, time = 1.4) => {
    game.message = text;
    game.messageTime = time;
  };

  const showBanner = (title, subtitle, time = 1.8, variant = '') => {
    game.banner.title = title;
    game.banner.subtitle = subtitle;
    game.banner.life = time;
    game.banner.max = time;
    game.banner.variant = variant;
    if (variant === 'alert') {
      game.flash = 0.36;
      game.shake = 15;
      pad.sfx('gameAlert');
      pad.pulse([20, 35, 20, 35, 20]);
    }
  };

  const powerOn = () => {
    if (game.mode !== 'off') return;
    game.boot = 0;
    game.bootPhase = 0;
    prepareDemo();
    setMode('boot');
    pad.sfx('gamePower');
    pad.pulse([12, 35, 12]);
    pad.flashLight();
  };

  const powerOff = () => {
    if (game.mode === 'off') return;
    setMode('off');
    game.shake = 0;
    game.flash = 0;
    pad.sfx('gamePower');
    pad.pulse(6);
  };

  const pauseGame = () => {
    if (game.mode === 'playing') setMode('paused');
  };

  const resumeGame = () => {
    if (game.mode === 'paused') setMode('playing');
  };

  const enemyStats = {
    scout: { hp: 1, points: 25, w: 27, h: 20, color: '#22e6ff' },
    soldier: { hp: 2, points: 45, w: 31, h: 22, color: '#ff2bd6' },
    tank: { hp: 4, points: 80, w: 35, h: 25, color: '#ffb347' }
  };

  const pickupTypes = [
    { type: 'weapon', label: 'P', color: '#22e6ff', weight: 14 },
    { type: 'life', label: 'L', color: '#ff4d6d', weight: 7 },
    { type: 'missile', label: 'M', color: '#ffb347', weight: 21 },
    { type: 'bomb', label: 'B', color: '#ff2bd6', weight: 14 },
    { type: 'magnet', label: 'I', color: '#b26bff', weight: 12 },
    { type: 'shield', label: 'E', color: '#5efc8d', weight: 14 },
    { type: 'drone', label: 'D', color: '#5bbcff', weight: 12 }
  ];

  const spawnPickup = (x, y, forcedType) => {
    let picked;
    if (forcedType) {
      picked = pickupTypes.find((item) => item.type === forcedType) || pickupTypes[0];
    } else {
      const total = pickupTypes.reduce((sum, item) => sum + item.weight, 0);
      let roll = Math.random() * total;
      picked = pickupTypes[0];
      for (const item of pickupTypes) {
        roll -= item.weight;
        if (roll <= 0) {
          picked = item;
          break;
        }
      }
    }
    game.pickups.push({
      x,
      y,
      vy: 62,
      phase: Math.random() * TAU,
      color: picked.color,
      label: picked.label,
      type: picked.type,
      life: 11
    });
  };

  const spawnSparks = (x, y, color, count, power = 1) => {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = (35 + Math.random() * 170) * power;
      const life = 0.2 + Math.random() * 0.42;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 150,
        life,
        max: life,
        r: 1 + Math.random() * 2.2,
        color
      });
    }
  };

  const spawnRing = (x, y, color, max = 80, life = 0.4) => {
    game.rings.push({ x, y, r: 4, max, life, maxLife: life, color });
  };

  const levelName = () => 'ÓRBITA EXTERIOR';

  const buildWave = () => {
    game.phase = 'wave';
    game.boss = null;
    game.enemies = [];
    game.enemyBullets = [];
    game.waveClearTimer = 0;
    const cols = 5 + (game.wave >= 3 ? 1 : 0);
    const rows = 3 + (game.wave >= 2 ? 1 : 0) + (game.wave >= 4 ? 1 : 0);
    const gapX = 54;
    const gapY = 34;
    const startY = 88;
    const startX = VW / 2 - ((cols - 1) * gapX) / 2;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        let type = 'scout';
        if (r === 0) type = game.wave >= 3 ? 'tank' : 'soldier';
        else if (r === 1 && game.wave >= 2) type = 'soldier';
        const stats = enemyStats[type];
        game.enemies.push({
          x: startX + c * gapX,
          y: startY + r * gapY,
          w: stats.w,
          h: stats.h,
          hp: stats.hp,
          maxHp: stats.hp,
          points: stats.points,
          type,
          color: stats.color,
          phase: Math.random() * TAU,
          flash: 0,
          muzzle: 0
        });
      }
    }

    game.waveTotal = game.enemies.length;
    game.formation.dir = game.wave % 2 === 0 ? -1 : 1;
    game.enemyFireTimer = Math.max(0.55, 1.15 - game.level * 0.08);
  };

  const createBoss = (isFinal = false) => {
    return {
      name: isFinal ? 'NÚCLEO MADRE' : 'GUARDIÁN ORBITAL',
      isFinal,
      x: VW / 2,
      y: isFinal ? 122 : 116,
      w: isFinal ? 196 : 164,
      h: isFinal ? 82 : 70,
      hp: isFinal ? 210 : 140,
      maxHp: isFinal ? 210 : 140,
      color: isFinal ? '#5efc8d' : '#ff2bd6',
      dir: 1,
      speed: isFinal ? 76 : 68,
      time: 0,
      intro: isFinal ? 2.1 : 1.9,
      fireTimer: 1.4,
      pattern: 0,
      flash: 0,
      muzzle: 0,
      smokeTimer: 0
    };
  };

  const beginBoss = (isFinal = false) => {
    game.phase = 'boss';
    game.enemies = [];
    game.enemyBullets = [];
    game.waveClearTimer = 0;
    game.boss = createBoss(isFinal);
    game.flash = isFinal ? 0.42 : 0.28;
    game.shake = isFinal ? 18 : 12;
    showBanner(
      isFinal ? 'SEGUNDA FASE' : 'ALERTA DE JEFE',
      `${game.boss.name} · ${levelName()}`,
      isFinal ? 2.5 : 2.4,
      'alert'
    );
    pad.sfx('gameNova');
    pad.pulse([18, 30, 18]);
  };

  const resetPlayer = () => {
    player.x = VW / 2;
    player.y = PLAYER_Y;
    player.vx = 0;
    player.tilt = 0;
    player.invuln = 0;
    player.shield = 0;
    player.weapon = 1;
    player.magnet = 0;
    player.drones = 0;
    player.droneFireTimer = 0;
    player.missiles = 0;
    player.bombs = 0;
    player.fireTimer = 0;
    player.muzzle = 0;
    player.hitFlash = 0;
  };

  const prepareDemo = () => {
    game.score = 0;
    game.lives = 3;
    game.level = 1;
    game.wave = 1;
    game.enemies = [];
    game.bullets = [];
    game.enemyBullets = [];
    game.missiles = [];
    game.pickups = [];
    game.particles = [];
    game.rings = [];
    game.boss = null;
    game.shake = 0;
    game.flash = 0;
    game.message = '';
    game.messageTime = 0;
    game.banner.title = '';
    game.banner.subtitle = '';
    game.banner.life = 0;
    game.banner.max = 0;
    game.banner.variant = '';
    game.waveClearTimer = 0;
    game.transitionTimer = 0;
    game.transitionTo = '';
    game.invasionCooldown = 0;
    resetPlayer();
    buildWave();
  };

  const startGame = () => {
    prepareDemo();
    player.invuln = 1.4;
    setMode('playing');
    showBanner('NIVEL 1', `4 OLEADAS · 2 JEFES · ${levelName()}`, 2.4);
    pad.sfx('gameStart');
    pad.flashLight();
  };

  const endGame = () => {
    game.best = Math.max(game.best, game.score);
    setMode('over');
    pad.sfx('gameOver');
    pad.pulse([24, 40, 24]);
  };

  const winGame = () => {
    game.best = Math.max(game.best, game.score);
    setMode('victory');
    pad.sfx('gamePoint');
    pad.pulse([12, 20, 12, 20, 40]);
    pad.flashLight();
  };

  const destroyEnemy = (enemy) => {
    const index = game.enemies.indexOf(enemy);
    if (index < 0) return;
    game.enemies.splice(index, 1);
    game.score += enemy.points;
    game.shake = Math.max(game.shake, enemy.type === 'tank' ? 5 : 2.5);
    spawnSparks(enemy.x, enemy.y, enemy.color, enemy.type === 'tank' ? 18 : 11, enemy.type === 'tank' ? 1.1 : 0.8);
    spawnRing(enemy.x, enemy.y, enemy.color, enemy.type === 'tank' ? 54 : 32, 0.3);
    pad.sfx(enemy.type === 'scout' ? 'gameExplosionLight' : 'gameExplosion');
    pad.pulse(enemy.type === 'tank' ? 9 : 4);
    if (Math.random() < 0.24) spawnPickup(enemy.x, enemy.y);
    if (!game.enemies.length && game.phase === 'wave') {
      game.waveClearTimer = 1.2;
      showBanner(
        `OLEADA ${game.wave}/4 COMPLETADA`,
        game.wave >= 4 ? 'PREPARANDO ENCUENTRO CON EL JEFE' : 'PREPARANDO SIGUIENTE OLEADA',
        1.2
      );
    }
  };

  const nearestTarget = () => {
    let best = game.boss;
    let bestDist = game.boss ? Math.hypot(game.boss.x - player.x, game.boss.y - player.y) : Infinity;
    game.enemies.forEach((enemy) => {
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    });
    return best;
  };

  const useMissile = () => {
    if (player.missiles <= 0) return false;
    player.missiles -= 1;
    game.missiles.push({
      x: player.x,
      y: player.y - 16,
      vx: 0,
      vy: -330,
      speed: 430,
      r: 5,
      life: 2.6,
      target: nearestTarget()
    });
    message(`MISIL · ${player.missiles}`, 0.6);
    pad.sfx('gameMissile');
    pad.pulse(6);
    return true;
  };

  const hitBoss = (damage) => {
    const boss = game.boss;
    if (!boss) return;
    boss.hp -= damage;
    boss.flash = 0.1;
    game.shake = Math.max(game.shake, 2.5);
    if (boss.hp <= 0) defeatBoss();
  };

  const useBomb = () => {
    if (player.bombs <= 0) return false;
    player.bombs -= 1;
    game.flash = 0.36;
    game.shake = 20;
    game.enemyBullets = [];
    spawnRing(player.x, player.y, '#ff2bd6', 320, 0.75);
    spawnSparks(player.x, player.y, '#ffb347', 30, 1.4);
    [...game.enemies].forEach((enemy) => {
      enemy.hp -= 2;
      enemy.flash = 0.14;
      if (enemy.hp <= 0) destroyEnemy(enemy);
    });
    hitBoss(12);
    message(`BOMBA · ${player.bombs}`, 0.7);
    pad.sfx('gameBomb');
    pad.pulse([16, 28, 16]);
    return true;
  };

  const useSpecial = () => {
    if (useMissile()) return;
    if (useBomb()) return;
    message('SIN ESPECIAL · RECOGE M o B', 1);
    pad.sfx('gameBlock');
  };

  const shoot = () => {
    const offsets = player.weapon === 1 ? [0] : player.weapon === 2 ? [-7, 7] : [-10, 0, 10];
    offsets.forEach((offset) => {
      game.bullets.push({
        x: player.x + offset,
        y: player.y - 18,
        vy: -610,
        r: 2.2,
        color: '#bff7ff'
      });
    });
    player.muzzle = 0.06;
    pad.sfx('gameShot');
  };

  const damagePlayer = () => {
    if (game.mode !== 'playing' || player.invuln > 0) return;
    game.enemyBullets = [];
    if (player.shield > 0) {
      player.shield = 0;
      player.invuln = 1.2;
      game.flash = 0.16;
      game.shake = 9;
      spawnRing(player.x, player.y, '#5efc8d', 92, 0.45);
      message('ESCUDO ROTO', 1.2);
      pad.sfx('gameBlock');
      pad.pulse([8, 18, 8]);
      return;
    }

    game.lives -= 1;
    player.invuln = 2;
    player.weapon = 1;
    player.hitFlash = 0.35;
    game.flash = 0.3;
    game.shake = 16;
    spawnSparks(player.x, player.y, '#ff4d6d', 24, 1.3);
    spawnRing(player.x, player.y, '#ff4d6d', 120, 0.55);
    pad.sfx('gameKO');
    pad.pulse([20, 38, 20]);

    if (game.lives <= 0) {
      endGame();
      return;
    }
    message(`NAVE DAÑADA · ${game.lives} VIDAS`, 1.7);
  };

  const invasion = () => {
    if (game.invasionCooldown > 0) return;
    game.invasionCooldown = 1.2;
    damagePlayer();
    if (game.mode !== 'playing') return;
    buildWave();
    message('INVASIÓN REPELIDA', 1.6);
    pad.sfx('gameWave');
  };

  const defeatBoss = () => {
    const boss = game.boss;
    if (!boss) return;
    const finalBoss = boss.isFinal;
    game.boss = null;
    game.phase = 'transition';
    game.enemyBullets = [];
    game.bullets = [];
    game.transitionTimer = finalBoss ? 3 : 2.8;
    game.transitionTo = finalBoss ? 'victory' : 'boss2';
    game.score += finalBoss ? 2600 : 1400;
    game.flash = 0.5;
    game.shake = 22;
    spawnSparks(boss.x, boss.y, boss.color, finalBoss ? 58 : 42, 1.6);
    spawnRing(boss.x, boss.y, boss.color, finalBoss ? 340 : 260, 0.85);
    spawnPickup(boss.x - 44, boss.y, 'weapon');
    spawnPickup(boss.x, boss.y, 'missile');
    spawnPickup(boss.x + 44, boss.y, 'bomb');
    spawnPickup(boss.x - 22, boss.y + 18, 'shield');
    spawnPickup(boss.x + 22, boss.y + 18, finalBoss ? 'life' : 'drone');
    showBanner(
      finalBoss ? 'MISIÓN CUMPLIDA' : 'JEFE DERROTADO',
      finalBoss ? 'NÚCLEO MADRE DESTRUIDO · SECTOR LIBERADO' : 'PREPARANDO SEGUNDA FASE',
      finalBoss ? 3 : 2.4,
      'victory'
    );
    pad.sfx('gameBossExplosion');
    pad.pulse([22, 24, 22, 24, 44]);
  };

  const finishTransition = () => {
    if (game.transitionTo === 'victory') {
      winGame();
      return;
    }
    game.phase = 'boss';
    game.transitionTo = '';
    game.lives = Math.min(5, game.lives + 1);
    player.invuln = Math.max(player.invuln, 1.5);
    beginBoss(true);
  };

  const updatePlayer = (dt) => {
    const stick = pad.state.sticks.left;
    let mx = Math.abs(stick.x) > 0.12 ? stick.x : 0;
    if (down('left')) mx = -1;
    if (down('right')) mx = 1;

    player.vx = lerp(player.vx, mx * 390, Math.min(1, dt * 32));
    player.x = clamp(player.x + player.vx * dt, 28, VW - 28);
    player.tilt = lerp(player.tilt, player.vx / 390 * 0.2, Math.min(1, dt * 14));
    player.invuln = Math.max(0, player.invuln - dt);
    player.magnet = Math.max(0, player.magnet - dt);
    player.drones = Math.max(0, player.drones - dt);
    player.muzzle = Math.max(0, player.muzzle - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);
    player.fireTimer -= dt;

    if (down('cross') && player.fireTimer <= 0) {
      shoot();
      player.fireTimer = player.weapon === 3 ? 0.14 : player.weapon === 2 ? 0.16 : 0.18;
    }

    if (player.drones > 0) {
      player.droneFireTimer -= dt;
      if (player.droneFireTimer <= 0) {
        player.droneFireTimer = 0.24;
        [-1, 1].forEach((side) => {
          game.bullets.push({
            x: player.x + side * 29,
            y: player.y - 3,
            vy: -570,
            r: 2,
            color: '#5efc8d'
          });
        });
      }
    }
  };

  const updateMissiles = (dt) => {
    for (let i = game.missiles.length - 1; i >= 0; i -= 1) {
      const missile = game.missiles[i];
      missile.life -= dt;
      const targetAlive = missile.target && (missile.target === game.boss || game.enemies.includes(missile.target));
      if (!targetAlive) missile.target = nearestTarget();

      if (missile.target) {
        const dx = missile.target.x - missile.x;
        const dy = missile.target.y - missile.y;
        const dist = Math.hypot(dx, dy) || 1;
        missile.vx = lerp(missile.vx, (dx / dist) * missile.speed, Math.min(1, dt * 7));
        missile.vy = lerp(missile.vy, (dy / dist) * missile.speed, Math.min(1, dt * 7));
      } else {
        missile.vx = lerp(missile.vx, 0, Math.min(1, dt * 6));
        missile.vy = lerp(missile.vy, -missile.speed, Math.min(1, dt * 6));
      }

      missile.x += missile.vx * dt;
      missile.y += missile.vy * dt;

      let hit = null;
      for (const enemy of game.enemies) {
        if (Math.abs(missile.x - enemy.x) < enemy.w / 2 + missile.r && Math.abs(missile.y - enemy.y) < enemy.h / 2 + missile.r) {
          hit = enemy;
          break;
        }
      }
      if (!hit && game.boss) {
        const boss = game.boss;
        if (Math.abs(missile.x - boss.x) < boss.w / 2 + missile.r && Math.abs(missile.y - boss.y) < boss.h / 2 + missile.r) {
          hit = boss;
        }
      }

      if (hit) {
        if (hit === game.boss) hitBoss(8);
        else {
          hit.hp -= 3;
          hit.flash = 0.12;
          if (hit.hp <= 0) destroyEnemy(hit);
        }
        spawnSparks(missile.x, missile.y, '#ffb347', 18, 1.1);
        spawnRing(missile.x, missile.y, '#ffb347', 65, 0.35);
        game.shake = Math.max(game.shake, 6);
        pad.sfx('gameExplosionLight');
        pad.pulse(8);
        game.missiles.splice(i, 1);
        continue;
      }

      if (missile.life <= 0 || missile.y < -30 || missile.x < -30 || missile.x > VW + 30) {
        game.missiles.splice(i, 1);
      }
    }
  };

  const hitEnemyWithBullet = (bullet, enemy) => {
    enemy.hp -= 1;
    enemy.flash = 0.08;
    spawnSparks(bullet.x, bullet.y, '#bff7ff', 4, 0.5);
    if (enemy.hp <= 0) destroyEnemy(enemy);
    else pad.sfx('gameHit');
  };

  const updateBullets = (dt) => {
    for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = game.bullets[i];
      bullet.y += bullet.vy * dt;
      if (bullet.y < TOP - 20) {
        game.bullets.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const enemy of game.enemies) {
        if (Math.abs(bullet.x - enemy.x) < enemy.w / 2 + bullet.r && Math.abs(bullet.y - enemy.y) < enemy.h / 2 + bullet.r) {
          hitEnemyWithBullet(bullet, enemy);
          hit = true;
          break;
        }
      }
      if (!hit && game.boss) {
        const boss = game.boss;
        if (Math.abs(bullet.x - boss.x) < boss.w / 2 + bullet.r && Math.abs(bullet.y - boss.y) < boss.h / 2 + bullet.r) {
          boss.hp -= 1;
          boss.flash = 0.06;
          spawnSparks(bullet.x, bullet.y, '#bff7ff', 3, 0.45);
          game.shake = Math.max(game.shake, 1.5);
          pad.sfx('gameHit');
          if (boss.hp <= 0) defeatBoss();
          hit = true;
        }
      }
      if (hit) game.bullets.splice(i, 1);
    }

    for (let i = game.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = game.enemyBullets[i];
      bullet.y += bullet.vy * dt;
      bullet.x += bullet.vx * dt;
      if (bullet.wobble) bullet.x += Math.sin(game.time * 3 + bullet.phase) * 12 * dt;
      if (bullet.y > VH + 20 || bullet.x < -20 || bullet.x > VW + 20) {
        game.enemyBullets.splice(i, 1);
        continue;
      }
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      if (dx * dx + dy * dy < (bullet.r + player.r) * (bullet.r + player.r)) {
        game.enemyBullets.splice(i, 1);
        damagePlayer();
        if (game.mode !== 'playing') return;
      }
    }
  };

  const updatePickups = (dt) => {
    for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = game.pickups[i];
      pickup.life -= dt;
      pickup.y += pickup.vy * dt;
      pickup.x += Math.sin(game.time * 2 + pickup.phase) * 10 * dt;

      if (player.magnet > 0) {
        const dx = player.x - pickup.x;
        const dy = player.y - pickup.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 260) {
          pickup.x += (dx / (dist || 1)) * 250 * dt;
          pickup.y += (dy / (dist || 1)) * 250 * dt;
        }
      }

      const dx = pickup.x - player.x;
      const dy = pickup.y - player.y;
      if (dx * dx + dy * dy < 24 * 24) {
        collectPickup(pickup);
        game.pickups.splice(i, 1);
        continue;
      }
      if (pickup.life <= 0 || pickup.y > VH + 20) game.pickups.splice(i, 1);
    }
  };

  const collectPickup = (pickup) => {
    spawnRing(pickup.x, pickup.y, pickup.color, 54, 0.35);
    spawnSparks(pickup.x, pickup.y, pickup.color, 8, 0.7);
    pad.sfx('gamePoint');
    pad.pulse(5);

    if (pickup.type === 'weapon') {
      if (player.weapon < 3) {
        player.weapon += 1;
        message(`ARMA NIVEL ${player.weapon}`, 1);
      } else {
        game.score += 150;
        message('ARMA AL MÁXIMO', 1);
      }
    } else if (pickup.type === 'shield') {
      player.shield = 1;
      message('ESCUDO ACTIVO', 1);
    } else if (pickup.type === 'magnet') {
      player.magnet = Math.min(16, player.magnet + 9);
      message('IMÁN · 9s', 1);
    } else if (pickup.type === 'drone') {
      player.drones = Math.min(20, player.drones + 11);
      player.droneFireTimer = 0;
      message('DRONES · 11s', 1);
    } else if (pickup.type === 'missile') {
      if (player.missiles < 5) {
        player.missiles += 1;
        message(`MISIL · ${player.missiles}`, 1);
      } else {
        game.score += 100;
        message('MISILES AL MÁXIMO', 1);
      }
    } else if (pickup.type === 'bomb') {
      if (player.bombs < 3) {
        player.bombs += 1;
        message(`BOMBA · ${player.bombs}`, 1);
      } else {
        game.score += 100;
        message('BOMBAS AL MÁXIMO', 1);
      }
    } else if (pickup.type === 'life') {
      if (game.lives < 5) {
        game.lives += 1;
        message('+1 VIDA', 1);
      } else {
        game.score += 150;
        message('VIDAS AL MÁXIMO', 1);
      }
    }
  };

  const updateEnemies = (dt) => {
    if (!game.enemies.length) return;
    const speed = 22 + game.level * 7 + game.wave * 3 + (1 - game.enemies.length / game.waveTotal) * 24;
    const dx = game.formation.dir * speed * dt;
    const minX = Math.min(...game.enemies.map((enemy) => enemy.x - enemy.w / 2));
    const maxX = Math.max(...game.enemies.map((enemy) => enemy.x + enemy.w / 2));

    if ((minX + dx < 14 && game.formation.dir < 0) || (maxX + dx > VW - 14 && game.formation.dir > 0)) {
      game.formation.dir *= -1;
      game.enemies.forEach((enemy) => { enemy.y += 10; });
    } else {
      game.enemies.forEach((enemy) => { enemy.x += dx; });
    }

    game.enemies.forEach((enemy) => {
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.muzzle = Math.max(0, enemy.muzzle - dt);
    });

    const lowest = Math.max(...game.enemies.map((enemy) => enemy.y + enemy.h / 2));
    if (lowest >= 306) {
      invasion();
      return;
    }

    game.enemyFireTimer -= dt;
    if (game.enemyFireTimer <= 0) {
      const shooter = game.enemies[Math.floor(Math.random() * game.enemies.length)];
      game.enemyBullets.push({
        x: shooter.x,
        y: shooter.y + shooter.h / 2,
        vx: 0,
        vy: 150 + game.level * 14 + game.wave * 8,
        r: 4,
        phase: Math.random() * TAU,
        wobble: true,
        color: '#ff4d6d'
      });
      shooter.muzzle = 0.12;
      game.enemyFireTimer = Math.max(0.24, 1 - game.wave * 0.06 - game.level * 0.08) * (0.7 + Math.random() * 0.65);
    }
  };

  const fireBoss = () => {
    const boss = game.boss;
    if (!boss) return;
    const angleToPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
    const low = boss.hp < boss.maxHp * 0.45;

    if (boss.isFinal) {
      if (boss.pattern % 3 === 0) {
        for (let i = 0; i < 12; i += 1) {
          const angle = (i / 12) * TAU + boss.time * 0.45;
          const speed = 138;
          game.enemyBullets.push({
            x: boss.x,
            y: boss.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 5.5,
            wobble: false,
            color: i % 2 === 0 ? '#ffb347' : '#5efc8d'
          });
        }
      } else if (boss.pattern % 3 === 1) {
        for (let i = 0; i < 10; i += 1) {
          const angle = boss.time * 1.8 + i * 0.62;
          const speed = 158;
          game.enemyBullets.push({
            x: boss.x,
            y: boss.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 4.5,
            wobble: false,
            color: '#5efc8d'
          });
        }
      } else {
        for (let i = -2; i <= 2; i += 1) {
          const angle = angleToPlayer + i * 0.15;
          const speed = 224;
          game.enemyBullets.push({
            x: boss.x,
            y: boss.y + 18,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 5,
            wobble: false,
            color: '#eafff5'
          });
        }
      }
      boss.fireTimer = low ? 0.68 : 0.92;
    } else {
      if (boss.pattern % 2 === 0) {
        for (let i = -1; i <= 1; i += 1) {
          const angle = angleToPlayer + i * 0.2;
          const speed = 206;
          game.enemyBullets.push({
            x: boss.x,
            y: boss.y + 18,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 5,
            wobble: false,
            color: '#ff2bd6'
          });
        }
      } else {
        for (let i = -2; i <= 2; i += 1) {
          const angle = angleToPlayer + i * 0.15;
          const speed = 178;
          game.enemyBullets.push({
            x: boss.x,
            y: boss.y + 18,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: 5,
            wobble: false,
            color: '#ffb347'
          });
        }
        [-1, 1].forEach((side) => {
          game.enemyBullets.push({
            x: boss.x + side * 62,
            y: boss.y + 14,
            vx: side * 88,
            vy: 176,
            r: 4,
            wobble: false,
            color: '#22e6ff'
          });
        });
      }
      boss.fireTimer = low ? 0.82 : 1.08;
    }
    boss.muzzle = 0.14;
    boss.pattern += 1;
  };

  const updateBoss = (dt) => {
    const boss = game.boss;
    if (!boss) return;
    boss.time += dt;
    boss.flash = Math.max(0, boss.flash - dt);
    boss.muzzle = Math.max(0, boss.muzzle - dt);
    if (boss.intro > 0) {
      boss.intro -= dt;
      return;
    }

    if (boss.isFinal) {
      boss.x = VW / 2 + Math.sin(boss.time * 0.72) * 150;
      boss.y = 122 + Math.sin(boss.time * 1.7) * 7;
    } else {
      boss.x += boss.dir * boss.speed * dt;
      if (boss.x < 108) {
        boss.x = 108;
        boss.dir = 1;
      } else if (boss.x > VW - 108) {
        boss.x = VW - 108;
        boss.dir = -1;
      }
      boss.y = 112 + Math.sin(boss.time * 1.3) * 7;
    }

    if (boss.hp < boss.maxHp * 0.45) {
      boss.smokeTimer -= dt;
      if (boss.smokeTimer <= 0) {
        boss.smokeTimer = 0.22;
        spawnSparks(
          boss.x + (Math.random() - 0.5) * boss.w * 0.55,
          boss.y + (Math.random() - 0.5) * boss.h * 0.3,
          Math.random() < 0.5 ? '#ff7b4d' : boss.color,
          2,
          0.7
        );
      }
    }

    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) fireBoss();
  };

  const updateEffects = (dt) => {
    game.shake = Math.max(0, game.shake - dt * 38);
    game.flash = Math.max(0, game.flash - dt * 3);
    game.messageTime = Math.max(0, game.messageTime - dt);
    game.banner.life = Math.max(0, game.banner.life - dt);
    game.invasionCooldown = Math.max(0, game.invasionCooldown - dt);
    if (game.messageTime <= 0) game.message = '';

    game.particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.pow(0.2, dt);
      particle.life -= dt;
    });
    game.particles = game.particles.filter((particle) => particle.life > 0);

    game.rings.forEach((ring) => {
      ring.life -= dt;
      ring.r = lerp(ring.r, ring.max, Math.min(1, dt * 6));
    });
    game.rings = game.rings.filter((ring) => ring.life > 0);
  };

  const updatePlaying = (dt) => {
    updateScene(dt);
    updatePlayer(dt);
    if (edges.circle) useSpecial();

    if (game.phase === 'wave') {
      updateEnemies(dt);
      if (game.mode !== 'playing') return;
    } else if (game.phase === 'boss') {
      updateBoss(dt);
    }

    updateBullets(dt);
    if (game.mode !== 'playing') return;
    updateMissiles(dt);
    updatePickups(dt);
    updateEffects(dt);

    if (game.phase === 'wave' && !game.enemies.length && game.waveClearTimer > 0) {
      game.waveClearTimer -= dt;
      if (game.waveClearTimer <= 0) {
        if (game.wave >= 4) beginBoss(false);
        else {
          game.wave += 1;
          buildWave();
          showBanner(
            `OLEADA ${game.wave}/4`,
            game.wave === 4 ? `${levelName()} · ÚLTIMA OLEADA` : `${levelName()} · EN CURSO`,
            1.5
          );
        }
      }
    }

    if (game.phase === 'transition') {
      game.transitionTimer -= dt;
      if (game.transitionTimer <= 0) finishTransition();
      return;
    }

    if (game.phase === 'wave') {
      for (const enemy of game.enemies) {
        if (player.invuln > 0) break;
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        if (dx * dx + dy * dy < (enemy.w / 2 + player.r) * (enemy.w / 2 + player.r)) {
          destroyEnemy(enemy);
          damagePlayer();
          break;
        }
      }
    }
  };

  const update = (dt) => {
    readEdges();

    if (edges.ps) {
      if (game.mode === 'off') powerOn();
      else powerOff();
    }

    if (game.mode !== 'paused') game.time += dt;

    if (game.mode === 'off') return;

    if (game.mode === 'boot') {
      game.boot += dt;
      let phase = 0;
      if (game.boot >= 1.05) phase = 1;
      if (game.boot >= 2.75) phase = 2;
      if (phase !== game.bootPhase) {
        game.bootPhase = phase;
        if (phase === 1) setOverlayText('La última órbita está en juego.', 'ARCADE · ÓRBITA CERO');
        if (phase === 2) setOverlayText('1 nivel · 4 oleadas · 2 jefes finales.', 'Pulsa ✕ para jugar');
      }
      updateScene(dt);
      updateEffects(dt);
      if (game.boot >= 4.3) {
        setMode('menu');
        game.bootPhase = 0;
        pad.sfx('gameStart');
      }
      return;
    }

    if (game.mode === 'menu') {
      updateScene(dt);
      updateEffects(dt);
      if (edges.cross) startGame();
      return;
    }

    if (game.mode === 'paused') {
      if (edges.options || edges.touchpad || edges.cross) resumeGame();
      return;
    }

    if (game.mode === 'over' || game.mode === 'victory') {
      updateScene(dt);
      updateEffects(dt);
      if (edges.cross) startGame();
      return;
    }

    if (edges.options || edges.touchpad) {
      pauseGame();
      return;
    }

    updatePlaying(dt);
  };

  const stars = Array.from({ length: 90 }, () => ({
    x: Math.random() * VW,
    y: Math.random() * VH,
    z: 0.35 + Math.random() * 0.9,
    r: 0.4 + Math.random() * 1.3,
    a: 0.2 + Math.random() * 0.7,
    speed: 14 + Math.random() * 62,
    phase: Math.random() * TAU
  }));

  const updateScene = (dt) => {
    stars.forEach((star) => {
      star.y += star.speed * star.z * dt;
      if (star.y > VH + 3) {
        star.y = -3;
        star.x = Math.random() * VW;
      }
    });
  };

  let bgLayer = null;
  let bgLevel = 0;

  const paintStaticBackground = (target) => {
    const sky = target.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, '#030611');
    sky.addColorStop(0.45, game.level === 2 ? '#100a20' : '#070d20');
    sky.addColorStop(0.78, game.level === 2 ? '#1c0821' : '#120a24');
    sky.addColorStop(1, '#020409');
    target.fillStyle = sky;
    target.fillRect(0, 0, VW, VH);

    const nebula = target.createRadialGradient(110, 144, 0, 110, 144, 210);
    nebula.addColorStop(0, 'rgba(34, 230, 255, .1)');
    nebula.addColorStop(0.45, 'rgba(80, 20, 160, .06)');
    nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    target.fillStyle = nebula;
    target.fillRect(0, 0, VW, VH);

    const nebula2 = target.createRadialGradient(548, 250, 0, 548, 250, 170);
    nebula2.addColorStop(0, game.level === 2 ? 'rgba(94, 252, 141, .1)' : 'rgba(255, 43, 214, .1)');
    nebula2.addColorStop(1, 'rgba(255, 43, 214, 0)');
    target.fillStyle = nebula2;
    target.fillRect(0, 0, VW, VH);

    const planet = target.createRadialGradient(518, 62, 4, 526, 72, 58);
    planet.addColorStop(0, 'rgba(255, 231, 250, .95)');
    planet.addColorStop(0.25, game.level === 2 ? 'rgba(94, 252, 141, .45)' : 'rgba(255, 132, 224, .48)');
    planet.addColorStop(0.7, 'rgba(115, 30, 130, .2)');
    planet.addColorStop(1, 'rgba(115, 30, 130, 0)');
    target.fillStyle = planet;
    target.beginPath();
    target.arc(526, 72, 58, 0, TAU);
    target.fill();
    target.fillStyle = 'rgba(255, 225, 249, .72)';
    target.beginPath();
    target.arc(526, 72, 24, 0, TAU);
    target.fill();

    const horizon = target.createLinearGradient(0, VH - 60, 0, VH);
    horizon.addColorStop(0, 'rgba(34, 230, 255, 0)');
    horizon.addColorStop(1, 'rgba(34, 230, 255, .1)');
    target.fillStyle = horizon;
    target.fillRect(0, VH - 60, VW, 60);

    target.strokeStyle = 'rgba(34, 230, 255, .12)';
    target.lineWidth = 1;
    target.beginPath();
    for (let i = -8; i <= 8; i += 1) {
      target.moveTo(VW / 2 + i * 24, VH - 60);
      target.lineTo(VW / 2 + i * 90, VH);
    }
    for (let y = VH - 52; y < VH; y += 13) {
      target.moveTo(0, y);
      target.lineTo(VW, y);
    }
    target.stroke();
  };

  const rebuildBackground = () => {
    if (typeof document.createElement !== 'function') return false;
    const layer = document.createElement('canvas');
    layer.width = VW;
    layer.height = VH;
    const layerCtx = layer.getContext('2d');
    if (!layerCtx) return false;
    paintStaticBackground(layerCtx);
    bgLayer = layer;
    bgLevel = game.level;
    return true;
  };

  const drawBackground = () => {
    if (bgLayer && bgLevel !== game.level) rebuildBackground();
    if (!bgLayer && !rebuildBackground()) paintStaticBackground(ctx);
    if (bgLayer) ctx.drawImage(bgLayer, 0, 0, VW, VH);

    stars.forEach((star) => {
      const alpha = star.a * (0.65 + 0.35 * Math.sin(game.time * 2 + star.phase));
      ctx.fillStyle = `rgba(190, 238, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r * star.z, 0, TAU);
      ctx.fill();
    });
  };

  const drawEnemy = (enemy) => {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = withAlpha(enemy.color, enemy.flash > 0 ? 0.92 : 0.18);
    ctx.strokeStyle = enemy.flash > 0 ? '#ffffff' : enemy.color;
    ctx.lineWidth = enemy.type === 'tank' ? 2.4 : 1.7;
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(0, -enemy.h / 2);
    ctx.lineTo(enemy.w / 2, -enemy.h * 0.1);
    ctx.lineTo(enemy.w * 0.3, enemy.h * 0.42);
    ctx.lineTo(0, enemy.h * 0.26);
    ctx.lineTo(-enemy.w * 0.3, enemy.h * 0.42);
    ctx.lineTo(-enemy.w / 2, -enemy.h * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = withAlpha('#ffffff', 0.78);
    ctx.beginPath();
    ctx.arc(0, -enemy.h * 0.12, enemy.type === 'tank' ? 4 : 3, 0, TAU);
    ctx.fill();

    if (enemy.type === 'soldier' || enemy.type === 'tank') {
      ctx.strokeStyle = withAlpha(enemy.color, 0.9);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-enemy.w * 0.36, enemy.h * 0.12);
      ctx.lineTo(-enemy.w * 0.2, -enemy.h * 0.15);
      ctx.moveTo(enemy.w * 0.36, enemy.h * 0.12);
      ctx.lineTo(enemy.w * 0.2, -enemy.h * 0.15);
      ctx.stroke();
    }

    if (enemy.muzzle > 0) {
      ctx.fillStyle = withAlpha('#ff4d6d', enemy.muzzle * 8);
      ctx.beginPath();
      ctx.arc(0, enemy.h * 0.45, 4 + Math.random() * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawBoss1 = (boss) => {
    const t = boss.time;
    const hit = boss.flash > 0;
    const main = hit ? '#ffffff' : boss.color;
    const accent = '#ffb347';

    ctx.save();
    ctx.scale(boss.w / 164, boss.h / 70);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    [-1, 1].forEach((side) => {
      const x = side * 35;
      const length = 16 + Math.sin(t * 17 + side * 2) * 6;
      const flame = ctx.createLinearGradient(x, 22, x, 34 + length);
      flame.addColorStop(0, 'rgba(255, 255, 255, .9)');
      flame.addColorStop(0.25, 'rgba(34, 230, 255, .68)');
      flame.addColorStop(0.7, 'rgba(255, 43, 214, .34)');
      flame.addColorStop(1, 'rgba(255, 43, 214, 0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(x - 4, 23);
      ctx.lineTo(x + 4, 23);
      ctx.lineTo(x + 7, 31 + length * 0.5);
      ctx.lineTo(x, 34 + length);
      ctx.lineTo(x - 7, 31 + length * 0.5);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();

    ctx.save();
    ctx.translate(0, Math.sin(t * 2.2) * 1.4);
    const hullGradient = ctx.createLinearGradient(-82, -32, 82, 32);
    hullGradient.addColorStop(0, '#0a1830');
    hullGradient.addColorStop(0.3, withAlpha(boss.color, 0.3));
    hullGradient.addColorStop(0.5, '#122440');
    hullGradient.addColorStop(0.7, withAlpha(boss.color, 0.26));
    hullGradient.addColorStop(1, '#08101f');

    ctx.fillStyle = hullGradient;
    ctx.strokeStyle = withAlpha(main, 0.86);
    ctx.lineWidth = 1.8;
    ctx.shadowColor = boss.color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(0, -31);
    ctx.lineTo(31, -26);
    ctx.lineTo(56, -16);
    ctx.lineTo(80, -2);
    ctx.lineTo(62, 10);
    ctx.lineTo(35, 17);
    ctx.lineTo(24, 25);
    ctx.lineTo(0, 18);
    ctx.lineTo(-24, 25);
    ctx.lineTo(-35, 17);
    ctx.lineTo(-62, 10);
    ctx.lineTo(-80, -2);
    ctx.lineTo(-56, -16);
    ctx.lineTo(-31, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(3, 9, 18, .8)';
    ctx.strokeStyle = withAlpha(accent, 0.58);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(35, -14);
    ctx.lineTo(54, -3);
    ctx.lineTo(34, 7);
    ctx.lineTo(0, 9);
    ctx.lineTo(-34, 7);
    ctx.lineTo(-54, -3);
    ctx.lineTo(-35, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    [-1, 1].forEach((side) => {
      const px = side * 60;
      const py = 5;
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = '#08111e';
      ctx.strokeStyle = withAlpha(boss.color, 0.92);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = withAlpha('#22e6ff', 0.52);
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, TAU);
      ctx.fill();

      ctx.fillStyle = accent;
      ctx.fillRect(-2.2, 9, 4.4, 18);
      ctx.fillStyle = '#eafcff';
      ctx.fillRect(-1, 10, 2, 4);

      ctx.strokeStyle = withAlpha('#ffffff', 0.38);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0.25, Math.PI * 1.15);
      ctx.stroke();
      ctx.restore();
    });

    ctx.strokeStyle = withAlpha(boss.color, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-26, -20);
    ctx.lineTo(-14, 10);
    ctx.moveTo(26, -20);
    ctx.lineTo(14, 10);
    ctx.moveTo(-54, 1);
    ctx.lineTo(-34, 8);
    ctx.moveTo(54, 1);
    ctx.lineTo(34, 8);
    ctx.stroke();

    ctx.fillStyle = withAlpha(accent, 0.8);
    [-1, 1].forEach((side) => {
      ctx.fillRect(side * 76 - 3, -5, 6, 2);
      ctx.fillRect(side * 68 - 2, -12, 4, 2);
    });

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
    glow.addColorStop(0, 'rgba(255, 255, 255, .95)');
    glow.addColorStop(0.24, withAlpha('#bffcff', 0.9));
    glow.addColorStop(0.58, withAlpha(boss.color, 0.4));
    glow.addColorStop(1, withAlpha(boss.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#f2ffff';
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha(boss.color, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = withAlpha('#bffcff', 0.7);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 17 + Math.sin(t * 4) * 2, t * 1.6, t * 1.6 + Math.PI * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 22, -t * 1.2, -t * 1.2 + Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();

    if (boss.muzzle > 0) {
      ctx.fillStyle = withAlpha('#ffb347', boss.muzzle * 8);
      ctx.beginPath();
      ctx.arc(-60, 28, 4 + Math.random() * 3, 0, TAU);
      ctx.arc(60, 28, 4 + Math.random() * 3, 0, TAU);
      ctx.fill();
    }

    if (hit) {
      ctx.fillStyle = 'rgba(255, 255, 255, .38)';
      ctx.beginPath();
      ctx.moveTo(0, -31);
      ctx.lineTo(80, -2);
      ctx.lineTo(0, 18);
      ctx.lineTo(-80, -2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  };

  const drawBoss2 = (boss) => {
    const t = boss.time;
    const hit = boss.flash > 0;
    const main = hit ? '#ffffff' : boss.color;
    const pulse = 1 + Math.sin(t * 3.4) * 0.045;

    ctx.save();
    ctx.scale(boss.w / 196, boss.h / 82);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU + Math.sin(t * 0.55 + i) * 0.08;
      const sway = Math.sin(t * 1.2 + i * 0.9);
      const sx = Math.cos(angle) * 43;
      const sy = Math.sin(angle) * 28;
      const cx = Math.cos(angle) * 82 + Math.cos(angle + 1.2) * 12;
      const cy = Math.sin(angle) * 50 + sway * 8;
      const ex = Math.cos(angle + 0.16) * 113;
      const ey = Math.sin(angle + 0.16) * 66 + sway * 10;

      ctx.strokeStyle = withAlpha(i % 2 === 0 ? '#5efc8d' : '#ffb347', 0.34);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();

      ctx.fillStyle = withAlpha(i % 2 === 0 ? '#5efc8d' : '#ffb347', 0.65);
      ctx.beginPath();
      ctx.arc(ex, ey, 2.4 + Math.sin(t * 3 + i) * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(0, Math.sin(t * 1.8) * 1.6);

    const shell = ctx.createLinearGradient(-90, -40, 90, 40);
    shell.addColorStop(0, '#071a15');
    shell.addColorStop(0.28, withAlpha('#5efc8d', 0.28));
    shell.addColorStop(0.5, '#0c211d');
    shell.addColorStop(0.72, withAlpha('#ffb347', 0.2));
    shell.addColorStop(1, '#06110f');

    ctx.fillStyle = shell;
    ctx.strokeStyle = withAlpha(main, 0.9);
    ctx.lineWidth = 2;
    ctx.shadowColor = boss.color;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU - Math.PI / 2;
      const r = i % 2 === 0 ? 68 : 58;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.56;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(2, 12, 10, .72)';
    ctx.strokeStyle = withAlpha('#ffb347', 0.58);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU - Math.PI / 2;
      const r = i % 2 === 0 ? 49 : 41;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.56;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.rotate(t * 0.42);
    ctx.strokeStyle = withAlpha('#5efc8d', 0.64);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 57, 30, 0, 0.25, Math.PI * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 39, 21, 0.9, Math.PI * 1.05, Math.PI * 1.92);
    ctx.stroke();
    ctx.rotate(-t * 0.9);
    ctx.strokeStyle = withAlpha('#ffb347', 0.52);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 49, 25, -0.35, 0.15, Math.PI * 0.82);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = withAlpha('#5efc8d', 0.7);
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU + t * 0.35;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 58, Math.sin(angle) * 31, 1.8, 0, TAU);
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const iris = ctx.createRadialGradient(0, 0, 1, 0, 0, 27);
    iris.addColorStop(0, 'rgba(255, 255, 255, .98)');
    iris.addColorStop(0.18, withAlpha('#f4fff8', 0.96));
    iris.addColorStop(0.4, withAlpha('#5efc8d', 0.72));
    iris.addColorStop(0.68, withAlpha('#ffb347', 0.3));
    iris.addColorStop(1, withAlpha('#5efc8d', 0));
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(0, 0, 27 * pulse, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#06100e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#effff6';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 3.4, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = withAlpha('#eafff5', 0.68);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + Math.sin(t * 5) * 2.2, t * 1.1, t * 1.1 + Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = withAlpha('#ffb347', 0.82);
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * 70, -15);
      ctx.lineTo(side * 88, -25 + Math.sin(t * 3 + side) * 4);
      ctx.lineTo(side * 78, -7);
      ctx.closePath();
      ctx.fill();
    });

    if (boss.muzzle > 0) {
      ctx.fillStyle = withAlpha('#ffb347', boss.muzzle * 7);
      ctx.beginPath();
      ctx.arc(0, 24, 6 + Math.random() * 4, 0, TAU);
      ctx.fill();
    }

    if (hit) {
      ctx.fillStyle = 'rgba(255, 255, 255, .34)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 76, 38, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  };

  const drawBoss = () => {
    const boss = game.boss;
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    const introAlpha = boss.intro > 0 ? 0.5 + 0.5 * Math.sin(boss.time * 18) : 1;
    ctx.globalAlpha = Math.max(0.28, introAlpha);
    if (boss.isFinal) drawBoss2(boss);
    else drawBoss1(boss);
    ctx.restore();
  };

  const drawPlayer = () => {
    const blink = player.invuln > 0 && Math.floor(game.time * 14) % 2 === 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.tilt);
    ctx.globalAlpha = blink ? 0.42 : 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    [-1, 1].forEach((side) => {
      const nx = side * 8;
      const length = 20 + Math.sin(game.time * 42 + side * 1.7) * 5 + Math.random() * 4;
      const flameGradient = ctx.createLinearGradient(nx, 7, nx, 12 + length);
      flameGradient.addColorStop(0, 'rgba(255, 255, 255, .96)');
      flameGradient.addColorStop(0.18, 'rgba(94, 252, 141, .8)');
      flameGradient.addColorStop(0.52, 'rgba(34, 230, 255, .56)');
      flameGradient.addColorStop(1, 'rgba(255, 43, 214, 0)');
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(nx - 3, 7);
      ctx.lineTo(nx + 3, 7);
      ctx.lineTo(nx + 5, 10 + length * 0.55);
      ctx.lineTo(nx, 14 + length);
      ctx.lineTo(nx - 5, 10 + length * 0.55);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(234, 252, 255, .9)';
      ctx.beginPath();
      ctx.moveTo(nx - 1.2, 8);
      ctx.lineTo(nx + 1.2, 8);
      ctx.lineTo(nx, 12 + length * 0.55);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(34, 230, 255, .2)';
      ctx.beginPath();
      ctx.arc(nx, 10, 8 + Math.sin(game.time * 18 + side) * 2, 0, TAU);
      ctx.fill();
    });

    for (let i = 0; i < 14; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const seed = (game.time * 130 + i * 17) % 28;
      const alpha = 1 - seed / 28;
      ctx.fillStyle = i % 3 === 0
        ? `rgba(255, 43, 214, ${alpha * 0.34})`
        : `rgba(34, 230, 255, ${alpha * 0.52})`;
      ctx.fillRect(side * 8 + Math.sin(seed * 0.9 + i) * 2.5, 16 + seed, 1.3, 3 + alpha * 6);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(34, 230, 255, .18)';
    ctx.strokeStyle = '#22e6ff';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#22e6ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(7, -6);
    ctx.lineTo(19, 3);
    ctx.lineTo(12, 10);
    ctx.lineTo(4, 7);
    ctx.lineTo(0, 13);
    ctx.lineTo(-4, 7);
    ctx.lineTo(-12, 10);
    ctx.lineTo(-19, 3);
    ctx.lineTo(-7, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eafcff';
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(4, -3);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, -3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = withAlpha('#ff2bd6', 0.7);
    ctx.fillRect(-13, 4, 4, 2);
    ctx.fillRect(9, 4, 4, 2);

    ctx.fillStyle = '#eafcff';
    ctx.beginPath();
    ctx.arc(-8, 8, 1.8, 0, TAU);
    ctx.arc(8, 8, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (player.shield > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(94, 252, 141, .75)';
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#5efc8d';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 25 + Math.sin(game.time * 5) * 2, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (player.magnet > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(178, 107, 255, .35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 8]);
      ctx.beginPath();
      ctx.arc(player.x, player.y, 74 + Math.sin(game.time * 3) * 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (player.drones > 0) {
      const droneAlpha = player.drones < 2 && Math.floor(game.time * 10) % 2 === 0 ? 0.35 : 1;
      [-1, 1].forEach((side) => {
        const x = player.x + side * 29;
        const y = player.y + 1 + Math.sin(game.time * 6 + side) * 2;
        ctx.save();
        ctx.globalAlpha = droneAlpha;
        ctx.translate(x, y);
        ctx.rotate(side * 0.18);
        ctx.fillStyle = 'rgba(94, 252, 141, .22)';
        ctx.strokeStyle = '#5efc8d';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#5efc8d';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 6);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    }

    if (player.muzzle > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha('#bff7ff', player.muzzle * 12);
      ctx.beginPath();
      ctx.arc(player.x, player.y - 22, 5 + Math.random() * 3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawBullets = () => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    game.bullets.forEach((bullet) => {
      ctx.strokeStyle = bullet.color;
      ctx.shadowColor = bullet.color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bullet.x, bullet.y + 7);
      ctx.lineTo(bullet.x, bullet.y - 7);
      ctx.stroke();
    });
    game.enemyBullets.forEach((bullet) => {
      ctx.fillStyle = bullet.color;
      ctx.shadowColor = bullet.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 235, 248, .9)';
      ctx.beginPath();
      ctx.arc(bullet.x - 1, bullet.y - 1, bullet.r * 0.38, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  };

  const drawMissiles = () => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    game.missiles.forEach((missile) => {
      const angle = Math.atan2(missile.vy, missile.vx);
      ctx.save();
      ctx.translate(missile.x, missile.y);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(255, 179, 71, .22)';
      ctx.beginPath();
      ctx.moveTo(-4, 9);
      ctx.lineTo(0, 20 + Math.random() * 5);
      ctx.lineTo(4, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.strokeStyle = '#ffe2a8';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#ffb347';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(4, -2);
      ctx.lineTo(2, 8);
      ctx.lineTo(-2, 8);
      ctx.lineTo(-4, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  };

  const drawPickups = () => {
    game.pickups.forEach((pickup) => {
      const pulse = 0.7 + 0.3 * Math.sin(game.time * 5 + pickup.phase);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(pickup.x, pickup.y);
      ctx.rotate(game.time * 1.4);
      ctx.fillStyle = withAlpha(pickup.color, 0.16);
      ctx.strokeStyle = pickup.color;
      ctx.lineWidth = 1.7;
      ctx.shadowColor = pickup.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 13);
      ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = pickup.color;
      ctx.globalAlpha = pulse;
      ctx.font = '800 9px "Syne", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pickup.label, pickup.x, pickup.y + 0.5);
      ctx.restore();
    });
  };

  const drawEffects = () => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    game.rings.forEach((ring) => {
      ctx.globalAlpha = clamp(ring.life / ring.maxLife, 0, 1) * 0.6;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, TAU);
      ctx.stroke();
    });
    game.particles.forEach((particle) => {
      ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  };

  const drawBossBar = () => {
    const boss = game.boss;
    if (!boss) return;
    const width = 500;
    const x = (VW - width) / 2;
    const ratio = clamp(boss.hp / boss.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 13, .76)';
    ctx.fillRect(x - 12, 61, width + 24, 25);
    ctx.textAlign = 'center';
    ctx.font = '700 8px "Space Grotesk", sans-serif';
    ctx.fillStyle = boss.color;
    ctx.shadowColor = boss.color;
    ctx.shadowBlur = 8;
    ctx.fillText(boss.name, VW / 2, 70);
    ctx.fillStyle = 'rgba(255, 255, 255, .08)';
    ctx.fillRect(x, 74, width, 6);
    ctx.fillStyle = boss.color;
    ctx.shadowBlur = 12;
    ctx.fillRect(x, 74, width * ratio, 6);
    ctx.restore();
  };

  const drawBanner = () => {
    const banner = game.banner;
    if (!banner.life || !banner.max) return;
    const elapsed = banner.max - banner.life;
    const alpha = Math.min(1, elapsed / 0.18, banner.life / 0.3);
    if (alpha <= 0) return;

    const isAlert = banner.variant === 'alert';
    const isVictory = banner.variant === 'victory';
    const color = isAlert ? '#ff4d6d' : isVictory ? '#5efc8d' : '#22e6ff';
    const accent = isAlert ? '#ffb347' : isVictory ? '#9ff7ff' : '#ff2bd6';
    const y = 164;
    const pulse = isAlert ? 0.72 + Math.sin(game.time * 16) * 0.28 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';

    const strip = ctx.createLinearGradient(0, y - 34, 0, y + 34);
    strip.addColorStop(0, 'rgba(2, 6, 13, 0)');
    strip.addColorStop(0.22, withAlpha(color, isAlert ? 0.16 : 0.1));
    strip.addColorStop(0.5, withAlpha(color, isAlert ? 0.24 : 0.14));
    strip.addColorStop(0.78, withAlpha(color, isAlert ? 0.16 : 0.1));
    strip.addColorStop(1, 'rgba(2, 6, 13, 0)');
    ctx.fillStyle = strip;
    ctx.fillRect(0, y - 34, VW, 68);

    ctx.fillStyle = withAlpha(color, 0.9 * pulse);
    ctx.fillRect(VW * 0.16, y - 31, VW * 0.68, 1);
    ctx.fillRect(VW * 0.16, y + 30, VW * 0.68, 1);
    ctx.fillStyle = withAlpha(accent, 0.55 * pulse);
    for (let i = 0; i < 5; i += 1) {
      const size = 3 + i * 1.6;
      ctx.fillRect(VW * 0.5 - 110 - i * 12, y + 24 - size / 2, size, 1);
      ctx.fillRect(VW * 0.5 + 110 + i * 12, y + 24 - size / 2, size, 1);
    }

    if (isAlert) {
      ctx.strokeStyle = withAlpha('#ff4d6d', 0.55 * pulse);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 7; i += 1) {
        const bx = VW * 0.2 + i * 28;
        ctx.moveTo(bx, y - 26);
        ctx.lineTo(bx + 12, y - 26);
        ctx.lineTo(bx + 6, y - 18);
      }
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.font = '800 25px "Syne", sans-serif';
    ctx.fillStyle = '#f4feff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillText(banner.title, VW / 2, y + 3);
    ctx.shadowBlur = 0;

    ctx.font = '700 9px "Space Grotesk", sans-serif';
    ctx.fillStyle = withAlpha(accent, 0.92);
    ctx.fillText(banner.subtitle, VW / 2, y + 21);
    ctx.restore();
  };

  const drawHud = () => {
    ctx.save();
    const bar = ctx.createLinearGradient(0, 0, 0, TOP);
    bar.addColorStop(0, 'rgba(2, 6, 13, .84)');
    bar.addColorStop(1, 'rgba(2, 6, 13, 0)');
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, VW, TOP);
    ctx.strokeStyle = 'rgba(34, 230, 255, .16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, TOP - 1);
    ctx.lineTo(VW, TOP - 1);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '700 9px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(143, 166, 186, .8)';
    ctx.fillText('PUNTOS', 24, 20);
    ctx.font = '800 22px "Syne", sans-serif';
    ctx.fillStyle = '#eafcff';
    ctx.shadowColor = '#22e6ff';
    ctx.shadowBlur = 14;
    ctx.fillText(String(game.score).padStart(5, '0'), 24, 41);
    ctx.shadowBlur = 0;
    ctx.font = '600 8px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(143, 166, 186, .65)';
    ctx.fillText(`RÉCORD ${String(game.best).padStart(5, '0')}`, 24, 53);

    ctx.textAlign = 'center';
    ctx.font = '700 9px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(143, 166, 186, .8)';
    ctx.fillText(`NIVEL ${game.level} · ${levelName()}`, VW / 2, 20);
    ctx.font = '800 20px "Syne", sans-serif';
    ctx.fillStyle = game.phase === 'boss' ? '#ff2bd6' : '#ffb347';
    ctx.shadowColor = game.phase === 'boss' ? '#ff2bd6' : '#ffb347';
    ctx.shadowBlur = 14;
    ctx.fillText(
      game.phase === 'boss' ? (game.boss && game.boss.isFinal ? 'JEFE FINAL' : 'JEFE 1/2') : `OLEADA ${game.wave}/4`,
      VW / 2,
      41
    );
    ctx.shadowBlur = 0;

    ctx.textAlign = 'right';
    ctx.font = '700 9px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(143, 166, 186, .8)';
    ctx.fillText('VIDAS', VW - 24, 20);
    for (let i = 0; i < game.lives; i += 1) {
      ctx.fillStyle = '#5efc8d';
      ctx.shadowColor = '#5efc8d';
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(VW - 31 - i * 13, 35, 4, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.font = '600 8px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(143, 166, 186, .68)';
    ctx.fillText(`M ${player.missiles}  B ${player.bombs}`, VW - 24, 52);

    ctx.textAlign = 'left';
    ctx.font = '700 8px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(143, 166, 186, .8)';
    ctx.fillText('ARMA', 118, 52);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < player.weapon ? '#22e6ff' : 'rgba(34, 230, 255, .18)';
      ctx.fillRect(148 + i * 9, 48, 6, 3);
    }

    ctx.fillStyle = 'rgba(2, 6, 13, .72)';
    ctx.fillRect(0, VH - 19, VW, 19);
    ctx.strokeStyle = 'rgba(34, 230, 255, .12)';
    ctx.beginPath();
    ctx.moveTo(0, VH - 19);
    ctx.lineTo(VW, VH - 19);
    ctx.stroke();

    ctx.font = '700 8px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'rgba(143, 166, 186, .82)';
    ctx.fillText(`ARMA ${player.weapon}`, 24, VH - 7);
    ctx.fillStyle = '#ffb347';
    ctx.fillText(`M ${player.missiles}`, 100, VH - 7);
    ctx.fillStyle = '#ff2bd6';
    ctx.fillText(`B ${player.bombs}`, 142, VH - 7);
    ctx.fillStyle = player.shield > 0 ? '#5efc8d' : 'rgba(143, 166, 186, .36)';
    ctx.fillText('ESCUDO', 190, VH - 7);
    ctx.fillStyle = player.magnet > 0 ? '#b26bff' : 'rgba(143, 166, 186, .36)';
    ctx.fillText(player.magnet > 0 ? `IMÁN ${Math.ceil(player.magnet)}s` : 'IMÁN', 258, VH - 7);
    ctx.fillStyle = player.drones > 0 ? '#5bbcff' : 'rgba(143, 166, 186, .36)';
    ctx.fillText(player.drones > 0 ? `DRONES ${Math.ceil(player.drones)}s` : 'DRONES', 332, VH - 7);

    if (game.message && game.messageTime > 0 && game.mode === 'playing') {
      ctx.textAlign = 'center';
      ctx.globalAlpha = clamp(game.messageTime * 2, 0, 1);
      ctx.font = '700 11px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#bff7ff';
      ctx.shadowColor = '#22e6ff';
      ctx.shadowBlur = 12;
      ctx.fillText(game.message, VW / 2, 286);
    }
    ctx.restore();
  };

  const drawBoot = () => {
    const t = clamp(game.boot / 4.3, 0, 1);
    const ring = 35 + Math.sin(game.boot * 3) * 6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(34, 230, 255, .3)';
    ctx.shadowColor = '#22e6ff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(VW / 2, VH / 2, ring * 2.5, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 43, 214, .24)';
    ctx.shadowColor = '#ff2bd6';
    ctx.beginPath();
    ctx.arc(VW / 2, VH / 2, ring * 1.6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(34, 230, 255, .8)';
    ctx.shadowColor = '#22e6ff';
    ctx.shadowBlur = 24;
    ctx.fillRect(VW / 2 - (VW / 2) * t, VH / 2 - 1, VW * t, 2);
    ctx.restore();
  };

  const drawFlash = () => {
    if (game.flash <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(game.flash, 0, 1) * 0.5;
    ctx.fillStyle = game.flash > 0.25 ? '#ff4d6d' : '#22e6ff';
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  };

  const drawVignette = () => {
    const vignette = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.18, VW / 2, VH / 2, VH * 0.75);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, .68)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VW, VH);
  };

  const draw = () => {
    ctx.save();
    ctx.clearRect(0, 0, VW, VH);

    if (game.mode === 'off') {
      drawBackground();
      ctx.fillStyle = 'rgba(2, 5, 10, .5)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
      return;
    }

    ctx.save();
    if (game.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
    }
    drawBackground();
    if (game.boss) drawBoss();
    game.enemies.forEach(drawEnemy);
    drawPlayer();
    drawBullets();
    drawMissiles();
    drawPickups();
    drawEffects();
    ctx.restore();

    if (game.mode === 'playing' || game.mode === 'paused' || game.mode === 'over' || game.mode === 'victory') drawHud();
    if (game.mode === 'playing' && game.banner.life > 0) drawBanner();
    if (game.boss) drawBossBar();
    if (game.mode === 'boot') drawBoot();
    drawFlash();
    drawVignette();
    ctx.restore();
  };

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') pauseGame();
  });

  if (tvPowerBtn) {
    tvPowerBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (game.mode === 'off') powerOn();
      else powerOff();
    });
  }

  prepareDemo();
  setMode('off');
})();
