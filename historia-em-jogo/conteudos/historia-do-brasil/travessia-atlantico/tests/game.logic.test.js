import { describe, it, expect } from 'vitest';
import { loadGameInternals } from './gameLoader.js';

const { GameScene, EventTrack, SPEED_LEVELS } = loadGameInternals();

// ---------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------

// Cria uma "cena" mínima que herda os métodos reais de GameScene.prototype
// (levelUpSpeed, applyWind, applyCurrent), mas com o estado inicial que o
// teste precisar e sem nenhuma dependência real do Phaser (pulseShip é
// substituído por um stub para não tocar em this.tweens/this.ship).
function makeScene(overrides = {}) {
  const scene = Object.create(GameScene.prototype);
  Object.assign(
    scene,
    { speedMultiplier: 1, speedLevelIndex: 0, score: 0, windFlash: 0, currentFlash: 0 },
    overrides
  );
  scene.pulseShip = () => {};
  return scene;
}

function makeSceneForTrack(onMessage = () => {}) {
  return {
    message: { show: onMessage },
    tweens: { add: () => {} },
    cameras: { main: { flash: () => {} } },
  };
}

function makeTrack(sceneForTrack = makeSceneForTrack()) {
  const track = Object.create(EventTrack.prototype);
  track.scene = sceneForTrack;
  track.gates = [];
  track.storms = [];
  return track;
}

function makeGate(overrides = {}) {
  return {
    type: 'wind',
    sprite: { x: 500 },
    spec: { score: 12 },
    used: false,
    warned: false,
    worldY: 1000,
    w: 70,
    h: 70,
    ...overrides,
  };
}

function makeStorm(overrides = {}) {
  return {
    sprites: [],
    lightning: { setAlpha: () => {} },
    worldY: 1000,
    height: 220,
    gap: 210,
    gapX: 640,
    resolved: false,
    warned: false,
    ...overrides,
  };
}

const noopCallbacks = { wind: () => {}, current: () => {}, rock: () => {}, whirlpool: () => {} };

// ---------------------------------------------------------------------
// SPEED_LEVELS
// ---------------------------------------------------------------------

describe('SPEED_LEVELS', () => {
  it('define a escada de multiplicadores usada pelo sistema de vento/corrente', () => {
    expect(SPEED_LEVELS).toEqual([1, 1.2, 1.4, 1.5, 1.65, 1.8]);
  });
});

// ---------------------------------------------------------------------
// GameScene.levelUpSpeed
// ---------------------------------------------------------------------

describe('GameScene.levelUpSpeed', () => {
  it('sobe um nível a partir da velocidade base (1x -> 1.2x)', () => {
    const scene = makeScene();
    scene.levelUpSpeed();
    expect(scene.speedMultiplier).toBe(1.2);
    expect(scene.speedLevelIndex).toBe(1);
  });

  it('sobe a partir de um nível intermediário (1.4x -> 1.5x)', () => {
    const scene = makeScene({ speedMultiplier: 1.4, speedLevelIndex: 2 });
    scene.levelUpSpeed();
    expect(scene.speedMultiplier).toBe(1.5);
    expect(scene.speedLevelIndex).toBe(3);
  });

  it('caso de borda: no nível máximo (1.8x) permanece em 1.8x, sem estourar o array', () => {
    const scene = makeScene({ speedMultiplier: 1.8, speedLevelIndex: 5 });
    scene.levelUpSpeed();
    expect(scene.speedMultiplier).toBe(1.8);
    expect(scene.speedLevelIndex).toBe(5);
  });
});

// ---------------------------------------------------------------------
// GameScene.applyWind / applyCurrent
// ---------------------------------------------------------------------

describe('GameScene.applyWind / applyCurrent', () => {
  it('applyWind soma a pontuação, ativa windFlash e sobe a velocidade', () => {
    const scene = makeScene();
    scene.applyWind(12);
    expect(scene.score).toBe(12);
    expect(scene.windFlash).toBe(700);
    expect(scene.speedMultiplier).toBe(1.2);
  });

  it('applyCurrent soma a pontuação, ativa currentFlash e sobe a velocidade', () => {
    const scene = makeScene({ score: 5 });
    scene.applyCurrent(14);
    expect(scene.score).toBe(19);
    expect(scene.currentFlash).toBe(700);
    expect(scene.speedMultiplier).toBe(1.2);
  });

  it('caso de borda: vento e corrente sobem o MESMO nível de velocidade (não são bônus separados)', () => {
    const scene = makeScene();
    scene.applyWind(12);
    scene.applyCurrent(14);
    // dois eventos seguidos = dois níveis acima da base (1x -> 1.2x -> 1.4x)
    expect(scene.speedMultiplier).toBe(1.4);
    expect(scene.score).toBe(26);
  });
});

// ---------------------------------------------------------------------
// EventTrack.updateGates (vento, corrente, pedras, redemoinhos)
// ---------------------------------------------------------------------

describe('EventTrack.updateGates', () => {
  it('dispara o callback do tipo correspondente quando o navio colide com o gate', () => {
    const track = makeTrack();
    track.gates.push(makeGate({ type: 'wind', spec: { score: 12 } }));

    let windScore = null;
    const shipBounds = { x: 480, y: 980, width: 50, height: 82 }; // sobrepõe o gate (500,1000,70,70)
    track.updateGates(shipBounds, 1000, { ...noopCallbacks, wind: (s) => { windScore = s; } });

    expect(windScore).toBe(12);
    expect(track.gates[0].used).toBe(true);
  });

  it('não dispara nenhum callback quando não há intersecção com o gate', () => {
    const track = makeTrack();
    track.gates.push(makeGate({ type: 'rock', spec: { score: -10 }, worldY: 1000, w: 100, h: 100 }));

    let called = false;
    const shipBounds = { x: 900, y: 980, width: 50, height: 82 }; // longe do gate
    track.updateGates(shipBounds, 1000, { ...noopCallbacks, rock: () => { called = true; } });

    expect(called).toBe(false);
  });

  it('caso de borda: um gate já usado não dispara o callback de novo, mesmo colidindo outra vez', () => {
    const track = makeTrack();
    track.gates.push(makeGate({ used: true, warned: true }));

    let called = false;
    const shipBounds = { x: 480, y: 980, width: 50, height: 82 };
    track.updateGates(shipBounds, 1000, { ...noopCallbacks, wind: () => { called = true; } });

    expect(called).toBe(false);
  });

  it('caso de borda: emite aviso de perigo (rock/whirlpool) dentro da distância de alerta, antes da colisão', () => {
    const shown = [];
    const track = makeTrack(makeSceneForTrack((msg) => shown.push(msg)));
    track.gates.push(makeGate({ type: 'rock', spec: { score: -10 }, worldY: 1000, w: 100, h: 100 }));

    const shipBounds = { x: 900, y: 980, width: 50, height: 82 }; // não colide (longe em x)
    track.updateGates(shipBounds, /* shipY */ 1300, noopCallbacks); // dist = 1300-1000 = 300 (< 420)

    expect(shown.length).toBe(1);
    expect(track.gates[0].warned).toBe(true);
    expect(track.gates[0].used).toBe(false);
  });
});

// ---------------------------------------------------------------------
// EventTrack.updateStorms
// ---------------------------------------------------------------------

describe('EventTrack.updateStorms', () => {
  it("retorna 'none' enquanto o navio ainda não chegou perto da tempestade", () => {
    const track = makeTrack();
    track.storms.push(makeStorm());

    const result = track.updateStorms({ sprite: { y: 2000, x: 640 } });
    expect(result).toBe('none');
  });

  it("retorna 'active' e marca a tempestade como avisada quando o navio entra na faixa pelo vão seguro", () => {
    const track = makeTrack();
    const storm = makeStorm();
    track.storms.push(storm);

    const result = track.updateStorms({ sprite: { y: 1000, x: 640 } }); // centro do vão (gapX)
    expect(result).toBe('active');
    expect(storm.warned).toBe(true);
  });

  it("retorna 'hit' quando o navio está na faixa da tempestade mas fora do vão seguro", () => {
    const track = makeTrack();
    track.storms.push(makeStorm());

    const result = track.updateStorms({ sprite: { y: 1000, x: 640 + 200 } }); // fora do vão de 210px
    expect(result).toBe('hit');
  });

  it("retorna 'passed' e marca a tempestade como resolvida após atravessar com sucesso", () => {
    const track = makeTrack();
    const storm = makeStorm();
    track.storms.push(storm);

    track.updateStorms({ sprite: { y: 1000, x: 640 } }); // entra na faixa -> warned = true
    const result = track.updateStorms({ sprite: { y: 860, x: 640 } }); // já passou (worldY - height/2 = 890)

    expect(result).toBe('passed');
    expect(storm.resolved).toBe(true);
  });

  it('caso de borda: uma tempestade já resolvida é ignorada em atualizações futuras', () => {
    const track = makeTrack();
    track.storms.push(makeStorm({ resolved: true, warned: true }));

    const result = track.updateStorms({ sprite: { y: 1000, x: 640 } });
    expect(result).toBe('none');
  });
});
