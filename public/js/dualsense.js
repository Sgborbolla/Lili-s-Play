(() => {
  const root = document.getElementById('dualsense');
  if (!root) return;

  const stage = root.querySelector('.ds-stage');
  const hapticLabel = document.getElementById('ds-haptic');
  const canVibrate = typeof navigator.vibrate === 'function';

  if (hapticLabel) {
    hapticLabel.textContent = canVibrate ? 'Vibración activa' : 'Vibración no disponible en este navegador';
  }

  let soundOn = true;
  let audioCtx = null;
  let noiseBuffer = null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  const ensureAudio = () => {
    if (!AudioCtor) return null;
    if (!audioCtx) {
      audioCtx = new AudioCtor();
      const length = Math.floor(audioCtx.sampleRate * 0.3);
      noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  };

  const playClick = (preset) => {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx || !noiseBuffer) return;
    const freq = preset.freq * (0.97 + Math.random() * 0.06);
    const gain = preset.gain * (0.9 + Math.random() * 0.2);
    const { low, noise, dur, tick = 0, spring = 0 } = preset;
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 1.1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(gain, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + noise);
    source.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(master);
    source.start(t);
    source.stop(t + noise + 0.01);

    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(low, t);
    body.frequency.exponentialRampToValueAtTime(Math.max(45, low * 0.55), t + dur);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(gain * 0.55, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    body.connect(bodyGain);
    bodyGain.connect(master);
    body.start(t);
    body.stop(t + dur + 0.01);

    if (tick) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 1.35, t);
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(tick, t);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      osc.connect(clickGain);
      clickGain.connect(master);
      osc.start(t);
      osc.stop(t + 0.02);
    }

    if (spring) {
      const springOsc = ctx.createOscillator();
      springOsc.type = 'sine';
      springOsc.frequency.setValueAtTime(360, t + 0.01);
      springOsc.frequency.exponentialRampToValueAtTime(110, t + dur + 0.03);
      const springGain = ctx.createGain();
      springGain.gain.setValueAtTime(0.0001, t);
      springGain.gain.linearRampToValueAtTime(spring, t + 0.012);
      springGain.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
      springOsc.connect(springGain);
      springGain.connect(master);
      springOsc.start(t);
      springOsc.stop(t + dur + 0.05);
    }
  };

  const sfx = {
    up: { freq: 1980, low: 238, gain: 0.1, noise: 0.03, dur: 0.04, tick: 0.045 },
    down: { freq: 1880, low: 226, gain: 0.1, noise: 0.03, dur: 0.04, tick: 0.045 },
    left: { freq: 1930, low: 232, gain: 0.1, noise: 0.03, dur: 0.04, tick: 0.045 },
    right: { freq: 2030, low: 244, gain: 0.1, noise: 0.03, dur: 0.04, tick: 0.045 },
    triangle: { freq: 2380, low: 285, gain: 0.12, noise: 0.04, dur: 0.045, tick: 0.06 },
    circle: { freq: 2200, low: 270, gain: 0.12, noise: 0.04, dur: 0.045, tick: 0.06 },
    cross: { freq: 2520, low: 300, gain: 0.12, noise: 0.04, dur: 0.045, tick: 0.06 },
    square: { freq: 2280, low: 278, gain: 0.12, noise: 0.04, dur: 0.045, tick: 0.06 },
    l1: { freq: 1350, low: 190, gain: 0.13, noise: 0.06, dur: 0.06, tick: 0.05 },
    r1: { freq: 1300, low: 186, gain: 0.13, noise: 0.06, dur: 0.06, tick: 0.05 },
    l2: { freq: 820, low: 115, gain: 0.17, noise: 0.09, dur: 0.1, spring: 0.06 },
    r2: { freq: 790, low: 112, gain: 0.17, noise: 0.09, dur: 0.1, spring: 0.06 },
    touchpad: { freq: 3100, low: 330, gain: 0.09, noise: 0.025, dur: 0.03, tick: 0.03 },
    ps: { freq: 1250, low: 150, gain: 0.16, noise: 0.07, dur: 0.11, spring: 0.05 },
    create: { freq: 2700, low: 300, gain: 0.06, noise: 0.018, dur: 0.025 },
    options: { freq: 2640, low: 296, gain: 0.06, noise: 0.018, dur: 0.025 },
    mute: { freq: 3000, low: 320, gain: 0.05, noise: 0.015, dur: 0.02 },
    stickDown: { freq: 780, low: 120, gain: 0.12, noise: 0.06, dur: 0.09, spring: 0.03 },
    stickMove: { freq: 3600, low: 420, gain: 0.02, noise: 0.014, dur: 0.018, tick: 0.012 },
    stickUp: { freq: 1300, low: 190, gain: 0.06, noise: 0.03, dur: 0.05 },
    stickClick: { freq: 1500, low: 180, gain: 0.12, noise: 0.04, dur: 0.05, tick: 0.05 },
    gamePower: { freq: 520, low: 82, gain: 0.14, noise: 0.12, dur: 0.22, spring: 0.07 },
    gameStart: { freq: 1800, low: 240, gain: 0.1, noise: 0.04, dur: 0.08, tick: 0.05 },
    gameShoot: { freq: 4200, low: 720, gain: 0.045, noise: 0.018, dur: 0.025, tick: 0.02 },
    gameShot: { freq: 2600, low: 720, gain: 0.075, noise: 0.035, dur: 0.055, tick: 0.035 },
    gameMissile: { freq: 980, low: 180, gain: 0.13, noise: 0.12, dur: 0.35, spring: 0.08 },
    gameExplosionLight: { freq: 900, low: 70, gain: 0.14, noise: 0.15, dur: 0.14, spring: 0.04 },
    gameExplosion: { freq: 620, low: 48, gain: 0.2, noise: 0.24, dur: 0.28, spring: 0.1 },
    gameBossExplosion: { freq: 360, low: 32, gain: 0.24, noise: 0.28, dur: 0.7, spring: 0.16 },
    gameBomb: { freq: 420, low: 42, gain: 0.22, noise: 0.26, dur: 0.44, spring: 0.12 },
    gameAlert: { freq: 760, low: 110, gain: 0.15, noise: 0.06, dur: 0.2, spring: 0.08 },
    gameHit: { freq: 1500, low: 90, gain: 0.15, noise: 0.07, dur: 0.08, spring: 0.04 },
    gameBlock: { freq: 2350, low: 150, gain: 0.1, noise: 0.035, dur: 0.05, tick: 0.05 },
    gameExplode: { freq: 420, low: 55, gain: 0.2, noise: 0.18, dur: 0.18, spring: 0.08 },
    gameOver: { freq: 500, low: 60, gain: 0.16, noise: 0.12, dur: 0.25, spring: 0.1 },
    gamePoint: { freq: 2600, low: 320, gain: 0.05, noise: 0.02, dur: 0.03, tick: 0.03 },
    gameWhoosh: { freq: 2900, low: 330, gain: 0.055, noise: 0.05, dur: 0.05, tick: 0.025 },
    gameJump: { freq: 1250, low: 160, gain: 0.07, noise: 0.035, dur: 0.06, spring: 0.02 },
    gameLand: { freq: 760, low: 85, gain: 0.08, noise: 0.055, dur: 0.06 },
    gameDash: { freq: 2100, low: 125, gain: 0.09, noise: 0.08, dur: 0.09, spring: 0.035 },
    gamePulse: { freq: 3400, low: 540, gain: 0.07, noise: 0.04, dur: 0.09, tick: 0.04 },
    gameWave: { freq: 900, low: 78, gain: 0.16, noise: 0.11, dur: 0.17, spring: 0.06 },
    gameNova: { freq: 620, low: 42, gain: 0.23, noise: 0.24, dur: 0.42, spring: 0.13 },
    gameKO: { freq: 340, low: 38, gain: 0.22, noise: 0.2, dur: 0.36, spring: 0.11 },
    gameHitLight: { freq: 1850, low: 120, gain: 0.12, noise: 0.075, dur: 0.055, spring: 0.025 },
    gameHitHeavy: { freq: 760, low: 46, gain: 0.2, noise: 0.15, dur: 0.12, spring: 0.07 },
    gameKick: { freq: 1180, low: 64, gain: 0.17, noise: 0.11, dur: 0.085, spring: 0.05 },
    gameCounter: { freq: 2600, low: 90, gain: 0.16, noise: 0.1, dur: 0.1, tick: 0.05, spring: 0.06 },
    gameThrow: { freq: 980, low: 70, gain: 0.14, noise: 0.08, dur: 0.08, spring: 0.04 },
    gameGuardBreak: { freq: 1550, low: 58, gain: 0.2, noise: 0.17, dur: 0.18, spring: 0.1 },
    gameCharge: { freq: 680, low: 110, gain: 0.08, noise: 0.045, dur: 0.22, spring: 0.05 },
    gameChargeBig: { freq: 420, low: 48, gain: 0.13, noise: 0.12, dur: 0.5, spring: 0.11 }
  };

  const playSfx = (key) => {
    if (!soundOn) return;
    const preset = sfx[key];
    if (preset) playClick(preset);
  };

  const soundButton = document.getElementById('ds-sound');
  if (soundButton) {
    soundButton.addEventListener('click', (event) => {
      event.stopPropagation();
      soundOn = !soundOn;
      soundButton.setAttribute('aria-pressed', String(soundOn));
      soundButton.textContent = soundOn ? 'Sonido on' : 'Sonido off';
      if (soundOn) {
        ensureAudio();
        playSfx('touchpad');
      }
    });
  }

  const pulse = (pattern) => {
    if (!canVibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (error) {
      /* el navegador puede bloquear la vibración sin gesto */
    }
  };

  const patterns = {
    up: 12, down: 12, left: 12, right: 12,
    triangle: 14, circle: 14, cross: 14, square: 14,
    l1: 16, r1: 16, l2: 26, r2: 26,
    touchpad: 18, ps: [28, 30, 28, 30, 55],
    create: 9, options: 9, mute: 8
  };

  const padState = {
    buttons: Object.create(null),
    sticks: {
      left: { x: 0, y: 0, active: false },
      right: { x: 0, y: 0, active: false }
    }
  };

  let flashTimer = 0;
  const flashLight = () => {
    root.classList.add('is-lit');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => root.classList.remove('is-lit'), 220);
  };

  const rumble = () => {
    root.classList.remove('is-rumble');
    void root.offsetWidth;
    root.classList.add('is-rumble');
    setTimeout(() => root.classList.remove('is-rumble'), 460);
  };

  root.querySelectorAll('[data-key]').forEach((element) => {
    let pressed = false;
    let pointerId = null;

    const press = (event) => {
      if (event) event.preventDefault();
      if (pressed) return;
      pressed = true;
      pointerId = event && event.pointerId != null ? event.pointerId : null;
      element.classList.add('is-down');
      const key = element.dataset.key;
      padState.buttons[key] = true;
      pulse(patterns[key] || 12);
      playSfx(key);
      if (key === 'ps') {
        rumble();
        flashLight();
      }
      if (key === 'touchpad') flashLight();
      if (event && element.setPointerCapture && event.pointerId != null) {
        try { element.setPointerCapture(event.pointerId); } catch (error) {}
      }
    };

    const release = (event) => {
      if (!pressed) return;
      if (event && event.pointerId != null && pointerId != null && event.pointerId !== pointerId) return;
      pressed = false;
      pointerId = null;
      padState.buttons[element.dataset.key] = false;
      element.classList.remove('is-down');
    };

    element.addEventListener('pointerdown', press);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', release);
    element.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') press(event);
    });
    element.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') release();
    });
    window.addEventListener('pointerup', release);
  });

  root.querySelectorAll('[data-stick]').forEach((stick) => {
    const cap = stick.querySelector('.ds-stick-cap');
    const stickState = padState.sticks[stick.dataset.stick];
    let pointerId = null;
    let centerX = 0;
    let centerY = 0;
    let travelled = 0;
    let lastTick = 0;
    let lastSound = 0;

    const setPosition = (dx, dy) => {
      cap.style.setProperty('--sx', dx.toFixed(1) + 'px');
      cap.style.setProperty('--sy', dy.toFixed(1) + 'px');
    };

    const reset = () => {
      pointerId = null;
      travelled = 0;
      lastTick = 0;
      lastSound = 0;
      stick.classList.remove('is-active');
      if (stickState) {
        stickState.x = 0;
        stickState.y = 0;
        stickState.active = false;
      }
      cap.style.removeProperty('--sx');
      cap.style.removeProperty('--sy');
    };

    const start = (event) => {
      event.preventDefault();
      pointerId = event.pointerId;
      const rect = stick.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      travelled = 0;
      lastTick = 0;
      lastSound = 0;
      stick.classList.add('is-active');
      if (stickState) {
        stickState.x = 0;
        stickState.y = 0;
        stickState.active = true;
      }
      playSfx('stickDown');
      if (stick.setPointerCapture) {
        try { stick.setPointerCapture(pointerId); } catch (error) {}
      }
      pulse(9);
    };

    const move = (event) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      event.preventDefault();
      const rect = stick.getBoundingClientRect();
      const scale = 800 / Math.max(rect.width, 1);
      let dx = (event.clientX - centerX) * scale;
      let dy = (event.clientY - centerY) * scale;
      const distance = Math.hypot(dx, dy);
      const max = 20;
      if (distance > max) {
        dx = (dx / distance) * max;
        dy = (dy / distance) * max;
      }
      setPosition(dx, dy);
      if (stickState) {
        stickState.x = dx / max;
        stickState.y = dy / max;
      }
      const moved = Math.hypot(dx, dy);
      if (moved - lastTick > 5) {
        pulse(4);
        lastTick = moved;
      }
      const now = performance.now();
      if (now - lastSound > 55) {
        playSfx('stickMove');
        lastSound = now;
      }
      travelled = Math.max(travelled, moved);
    };

    const end = (event) => {
      if (pointerId === null) return;
      if (event && event.pointerId != null && event.pointerId !== pointerId) return;
      if (travelled < 4) {
        pulse(16);
        playSfx('stickClick');
      } else {
        playSfx('stickUp');
      }
      reset();
    };

    stick.addEventListener('pointerdown', start);
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    stick.addEventListener('lostpointercapture', end);
    stick.addEventListener('keydown', (event) => {
      const step = 14;
      const key = event.key;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;
      event.preventDefault();
      stick.classList.add('is-active');
      setPosition(key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0,
        key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0);
      if (stickState) {
        stickState.x = key === 'ArrowLeft' ? -step / 20 : key === 'ArrowRight' ? step / 20 : 0;
        stickState.y = key === 'ArrowUp' ? -step / 20 : key === 'ArrowDown' ? step / 20 : 0;
        stickState.active = true;
      }
      pulse(5);
      playSfx('stickMove');
    });
    stick.addEventListener('keyup', (event) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        playSfx('stickUp');
        reset();
      }
    });
    stick.addEventListener('blur', reset);
    window.addEventListener('pointerup', end);
  });

  let frame = 0;
  let lastEvent = null;

  const applyTilt = () => {
    frame = 0;
    if (!lastEvent) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.max(-.5, Math.min(.5, (lastEvent.clientX - rect.left) / rect.width - .5));
    const ny = Math.max(-.5, Math.min(.5, (lastEvent.clientY - rect.top) / rect.height - .5));
    stage.style.setProperty('--ry', (nx * 7).toFixed(2) + 'deg');
    stage.style.setProperty('--rx', (-ny * 6).toFixed(2) + 'deg');
    stage.style.setProperty('--gx', ((nx + .5) * 100).toFixed(1) + '%');
    stage.style.setProperty('--gy', ((ny + .5) * 100).toFixed(1) + '%');
  };

  stage.addEventListener('pointermove', (event) => {
    if (root.querySelector('.ds-stick.is-active')) return;
    lastEvent = event;
    if (!frame) frame = requestAnimationFrame(applyTilt);
  });

  stage.addEventListener('pointerleave', () => {
    lastEvent = null;
    stage.style.setProperty('--rx', '0deg');
    stage.style.setProperty('--ry', '0deg');
    stage.style.setProperty('--gx', '50%');
    stage.style.setProperty('--gy', '18%');
  });

  window.LilyPad = {
    state: padState,
    pulse,
    sfx: playSfx,
    flashLight,
    rumble
  };
})();
