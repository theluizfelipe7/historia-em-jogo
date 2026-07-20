// =====================================================================
// Capitulo 2 â€” A Travessia do Atlantico e o Desvio (Volta do Mar)
// Serious Game â€” IFPA â€” Descobrimento do Brasil
// Estilo visual: Historical Comic Art (continuacao das HQs do projeto)
//
// Conceito historico do minigame:
//   Apos deixar Cabo Verde, a esquadra de Cabral executa a "Volta do Mar":
//   em vez de seguir junto a costa africana, os
//   navios se afastam bastante para o oeste, no meio do Atlantico, para
//   aproveitar ventos e correntes maritimas mais fortes. Esse desvio,
//   feito em aguas totalmente desconhecidas dos europeus da epoca, acaba
//   colocando a frota em rota de colisao com um territorio que nao
//   constava nos mapas â€” o futuro Brasil.
//
// Arquitetura do arquivo:
//   BootScene    -> gera todas as texturas do jogo em tempo de execucao
//                   (nao ha nenhuma imagem externa: tudo e vetorial,
//                   desenhado via Phaser.Graphics, no estilo HQ historica)
//   MenuScene    -> tela inicial (ja inclui tutorial de controles)
//   GameScene    -> minigame principal: travessia vertical do Atlantico
//   FailureScene -> tela de fracasso
//   VictoryScene -> tela de vitoria ("Terra a vista")
//   CreditsScene -> creditos
//
// Mecanica central (o que o jogo esta realmente ensinando):
//   O navio avanca sozinho para cima (rumo ao territÃ³rio desconhecido) e o
//   jogador apenas guia a frota para os lados. Faixas de VENTO e CORRENTE
//   favoraveis aumentam a velocidade (recompensando a logica real da Volta
//   do Mar). O oceano fica sempre em movimento: ondas, espuma, reflexos e
//   parallax reforcam a sensacao de navegacao.
// =====================================================================

// ---------------------------------------------------------------------
// Tratamento de erro amigavel: evita tela em branco caso algo falhe
// durante uma apresentacao em sala de aula ou em um evento.
// ---------------------------------------------------------------------
function showFriendlyError(message, filename, lineno) {
  const container = document.getElementById('game-container');
  if (!container) return;
  container.innerHTML = `
    <div class="error-box">
      <h1>Erro ao iniciar o minigame</h1>
      <p>${message || 'Erro desconhecido.'}</p>
      <p class="error-meta">Arquivo: ${filename || 'indisponivel'}:${lineno || 0}</p>
    </div>
  `;
}

window.addEventListener('error', (event) => {
  showFriendlyError(event.message, event.filename, event.lineno);
});

// Erros que acontecem dentro de Promises (ex.: no carregamento de fontes)
// nao disparam o evento 'error' acima â€” precisam ser tratados a parte,
// senao o jogo pode falhar silenciosamente e deixar a tela em branco.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  showFriendlyError(reason && reason.message ? reason.message : String(reason));
});

// ---------------------------------------------------------------------
// Constantes globais do jogo
// ---------------------------------------------------------------------
const GAME = {
  width: 1280,
  height: 720,

  // O "mundo" do minigame e vertical: o navio parte de baixo (Cabo Verde)
  // e viaja para cima, em direcao ao topo do mapa (Terra Desconhecida).
  // A camera acompanha o navio, dando a sensacao real de avanco pelo
  // oceano â€” e nao apenas um cenario decorativo passando ao fundo.
  worldWidth: 1280,
  worldHeight: 22000,

  // shipStartY/finishY foram aumentados (a travessia ficou bem mais longa)
  // para acompanhar o sistema de velocidade atual (base crescente + boost
  // 2x), que e bem mais rapido que o sistema antigo. Com a distancia
  // curta (8200), o navio completava a travessia cedo demais â€” a
  // sequencia de chegada disparava prematuramente e o navio "sumia"
  // no topo da tela de forma abrupta/estranha, bem antes do fim
  // pretendido da jornada. Aumentar a distancia tambem gera mais
  // obstaculos automaticamente, ja que o mapa aleatorio preenche toda a
  // distancia disponivel.
  shipStartY: 21200, // posicao inicial do navio, perto da base do mundo
  finishY: 620,      // quando o navio atinge este Y, a travessia terminou
  laneMinX: 90,      // limites do corredor de navegacao
  laneMaxX: 1190,

  // Duracao minima garantida da travessia (>= 1 minuto), independente da
  // velocidade alcancada pelo jogador. Ver GameScene.update().
  minDurationMs: 0,
  arrivalHoldMs: 1800,
  displayedKm: 7000,
  arrivalCutsceneProgress: 0.985
};
GAME.distanceTotal = GAME.shipStartY - GAME.finishY;
GAME.laneWidth = GAME.laneMaxX - GAME.laneMinX;
GAME.laneCenterX = (GAME.laneMinX + GAME.laneMaxX) / 2;

// Fontes carregadas no <head> do HTML (Cinzel para titulos/UI de destaque,
// IM Fell English para textos corridos â€” reforcam a leitura "manuscrito
// historico" pedida para acompanhar as HQs do projeto).
// Sistema de velocidade: um boost TEMPORARIO (pico por alguns segundos,
// depois esvai suave) somado a uma velocidade "de base" que cresce sozinha,
// aos poucos, ao longo de toda a travessia (nunca cai). Tanto vento quanto
// corrente concedem o mesmo boost compartilhado ao serem capturados.
const BOOST = {
  strength: 1.75,   // multiplicador no pico do boost
  durationMs: 4200, // tempo no pico antes de comecar a cair
  decayEase: 0.03   // suavizacao da queda depois que o boost acaba
};
const BASE_SPEED = {
  start: 122,      // velocidade "de base" no inicio da travessia
  growthEnd: 1.48  // multiplicador da base ao FINAL da travessia (so cresce)
};
const SHIP_SPEED_EASE = 0.08; // inercia: o navio persegue a velocidade-alvo aos poucos, nunca salta pra ela

const FONT_TITLE = "'Segoe UI', Arial, sans-serif";
const FONT_BODY = "'Segoe UI', Arial, sans-serif";

class SimpleSfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensure() {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch (_err) {
      this.enabled = false;
      return null;
    }
  }

  tone(freq, duration = 0.12, type = 'sine', volume = 0.05, when = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  collect() {
    this.tone(620, 0.09, 'triangle', 0.035, 0);
    this.tone(880, 0.12, 'triangle', 0.032, 0.08);
  }

  wave() {
    this.tone(190, 0.16, 'sawtooth', 0.025, 0);
    this.tone(135, 0.22, 'sine', 0.018, 0.07);
  }

  fog() {
    this.tone(260, 0.26, 'sine', 0.018, 0);
    this.tone(210, 0.28, 'sine', 0.014, 0.12);
  }

  danger() {
    this.tone(130, 0.18, 'sawtooth', 0.045, 0);
    this.tone(82, 0.26, 'square', 0.028, 0.09);
  }

  click() {
    this.tone(360, 0.045, 'triangle', 0.022, 0);
    this.tone(480, 0.055, 'triangle', 0.018, 0.045);
  }

  thunder() {
    this.tone(72, 0.18, 'sawtooth', 0.030, 0);
    this.tone(48, 0.34, 'sine', 0.022, 0.08);
  }

  arrival() {
    this.tone(420, 0.12, 'triangle', 0.026, 0);
    this.tone(640, 0.14, 'triangle', 0.024, 0.12);
    this.tone(860, 0.24, 'sine', 0.022, 0.26);
  }

  success() {
    this.tone(520, 0.10, 'triangle', 0.03, 0);
    this.tone(760, 0.10, 'triangle', 0.028, 0.09);
    this.tone(980, 0.16, 'triangle', 0.026, 0.18);
  }
}

const SFX = new SimpleSfx();

const COLORS = {
  ink: 0x1e1a12,
  paper: 0xe9d7ab,
  paperDark: 0xc7a96a,
  bronze: 0xaa7d3a,
  cream: 0xf6ecc8,
  oceanDeep: 0x030a10,
  oceanMid: 0x0a1c2a,
  oceanLight: 0x123246,
  oceanTropical: 0x163c34,
  warning: 0xc4552f,
  success: 0x6fa579,
  storm: 0x232a3d
};

// Estagios da rota (mesmo conceito historico do roteiro do capitulo),
// expressos como fracao da distancia percorrida: 0 = saida de Cabo Verde,
// 1 = chegada a Terra Desconhecida.
const ROUTE_STAGES = [
  { at: 0.00, local: 'Cabo Verde' },
  { at: 0.14, local: 'Atlantico Leste' },
  { at: 0.30, local: 'Volta do Mar' },
  { at: 0.62, local: 'Atlantico Sul' },
  { at: 0.90, local: 'Aguas Desconhecidas' },
  { at: 1.00, local: 'Terra Desconhecida' }
];

// ---------------------------------------------------------------------
// Funcoes auxiliares de desenho e UI (reaproveitadas em varias cenas)
// ---------------------------------------------------------------------

// O Phaser.GameObjects.Graphics NAO possui um metodo nativo
// "quadraticCurveTo" (essa e uma API do Canvas 2D puro, nao do Phaser).
// Esta funcao aproxima uma curva de Bezier quadratica com pequenos
// segmentos de reta via lineTo, que e um metodo real da API do Phaser.
// Retorna o ponto final, para permitir encadear curvas (ondas, faixas de
// vento, etc).
function quadraticCurveTo(g, x0, y0, cx, cy, x1, y1, segments = 14) {
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    g.lineTo(px, py);
  }
  return { x: x1, y: y1 };
}

// Interpola linearmente entre duas cores hexadecimais (0xRRGGBB).
function lerpColorHex(c1, c2, t) {
  const a = Phaser.Display.Color.IntegerToColor(c1);
  const b = Phaser.Display.Color.IntegerToColor(c2);
  const r = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Phaser.Math.Clamp(t, 0, 1) * 100);
  return Phaser.Display.Color.GetColor(r.r, r.g, r.b);
}

// Painel de pergaminho usado nos textos de menu/derrota/vitoria/creditos e
// na HUD do jogo. Sempre fixo a camera (scrollFactor 0), pois representa
// interface, nao cenario.
function drawPaper(scene, x, y, w, h, depth = 20, alpha = 0.95) {
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  g.fillStyle(COLORS.paper, alpha);
  g.fillRoundedRect(x, y, w, h, 14);
  g.lineStyle(3, COLORS.bronze, 0.9);
  g.strokeRoundedRect(x, y, w, h, 14);
  g.lineStyle(1, 0x7c5e2c, 0.22);
  for (let i = 0; i < 16; i++) {
    const px = x + 18 + ((i * 71) % Math.max(1, w - 36));
    const py = y + 14 + ((i * 43) % Math.max(1, h - 28));
    g.strokeLineShape(new Phaser.Geom.Line(px, py, px + 28, py + 5));
  }
  return g;
}

// Moldura no estilo "painel de quadrinho": linha de tinta dupla ao redor
// de toda a tela, com cantoneiras nos quatro cantos. Ancora a identidade
// visual "Historical Comic Art" em todas as cenas â€” o jogo deve parecer a
// continuacao fisica da HQ, nunca uma tela de jogo generica.
function drawComicFrame(scene, depth = 12) {
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  const margin = 10;
  const w = GAME.width - margin * 2;
  const h = GAME.height - margin * 2;

  g.lineStyle(6, COLORS.ink, 0.9);
  g.strokeRect(margin, margin, w, h);
  g.lineStyle(2, COLORS.cream, 0.5);
  g.strokeRect(margin + 8, margin + 8, w - 16, h - 16);

  const corner = 34;
  const corners = [
    [margin, margin], [GAME.width - margin, margin],
    [margin, GAME.height - margin], [GAME.width - margin, GAME.height - margin]
  ];
  g.lineStyle(4, COLORS.bronze, 0.85);
  corners.forEach(([cx, cy]) => {
    const sx = cx === margin ? 1 : -1;
    const sy = cy === margin ? 1 : -1;
    g.beginPath();
    g.moveTo(cx, cy + sy * corner);
    g.lineTo(cx, cy);
    g.lineTo(cx + sx * corner, cy);
    g.strokePath();
  });
  return g;
}

function makeText(scene, x, y, text, options = {}) {
  return scene.add.text(x, y, text, {
    fontFamily: options.font || FONT_BODY,
    fontSize: options.size || '18px',
    color: options.color || '#201a10',
    fontStyle: options.style || 'normal',
    align: options.align || 'left',
    wordWrap: options.wrap ? { width: options.wrap } : undefined,
    lineSpacing: options.lineSpacing || 0
  }).setDepth(options.depth || 30).setScrollFactor(0);
}

function makeButton(scene, x, y, w, h, label, callback, depth = 40) {
  const bg = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  const draw = (over = false) => {
    bg.clear();
    bg.fillStyle(over ? 0x4d341c : 0x241a10, 0.96);
    bg.fillRoundedRect(x, y, w, h, 10);
    bg.lineStyle(2, over ? COLORS.cream : COLORS.bronze, 1);
    bg.strokeRoundedRect(x, y, w, h, 10);
  };
  draw(false);
  const txt = makeText(scene, x + w / 2, y + h / 2, label, {
    font: FONT_TITLE,
    size: '19px',
    color: '#f6ecc8',
    style: 'bold',
    align: 'center',
    depth: depth + 1
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  const onClick = () => {
    SFX.click();
    callback();
  };
  const hit = scene.add.zone(x + w / 2, y + h / 2, w, h)
    .setDepth(depth + 2)
    .setScrollFactor(0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerover', () => draw(true));
  hit.on('pointerout', () => draw(false));
  hit.on('pointerdown', onClick);
  txt.on('pointerover', () => draw(true));
  txt.on('pointerout', () => draw(false));
  txt.on('pointerdown', onClick);
  return { bg, txt, hit };
}

// =====================================================================
// BootScene â€” gera todas as texturas do jogo (nenhuma imagem externa;
// tudo desenhado via Phaser.Graphics no estilo Historical Comic Art)
// =====================================================================
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    this.load.image('whirlpool', 'assets/redemoinho-ai.png');
  }

  create() {
    try {
      this.buildTextures();
      this.scene.start('MenuScene');
    } catch (err) {
      showFriendlyError(err && err.message ? err.message : String(err));
    }
  }

  buildTextures() {
    const g = this.add.graphics();

    // -----------------------------------------------------------------
    // Caravela: casco com curvas de Bezier (nao triangulo + retangulo
    // colados), sombra em hachura, velas latinas com borda curva e a
    // Cruz da Ordem de Cristo â€” simbolo classico das caravelas
    // portuguesas da epoca. Desenhada com a proa para CIMA, ja que o
    // navio viaja para o topo da tela neste minigame. Desenhada por
    // codigo (nao e uma imagem externa) para nao depender de nenhum
    // carregamento assincrono de arquivo.
    // -----------------------------------------------------------------
    g.clear();

    g.beginPath();
    let hp = { x: 70, y: 6 };
    g.moveTo(hp.x, hp.y);
    hp = quadraticCurveTo(g, hp.x, hp.y, 34, 70, 32, 150, 12);
    hp = quadraticCurveTo(g, hp.x, hp.y, 34, 182, 70, 190, 8);
    hp = quadraticCurveTo(g, hp.x, hp.y, 106, 182, 108, 150, 8);
    hp = quadraticCurveTo(g, hp.x, hp.y, 106, 70, 70, 6, 12);
    g.closePath();
    g.fillStyle(0x9c6a3c, 1);
    g.fillPath();
    g.lineStyle(3, COLORS.ink, 0.92);
    g.strokePath();

    // Linhas de tabuas do casco (sutil sugestao de madeira)
    g.lineStyle(1, 0x6b4526, 0.45);
    [90, 116, 142, 168].forEach((y) => {
      g.beginPath(); g.moveTo(40, y); g.lineTo(100, y); g.strokePath();
    });

    // Mastro
    g.lineStyle(5, 0x2a1a0e, 1);
    g.beginPath(); g.moveTo(70, 12); g.lineTo(70, 150); g.strokePath();

    // Vela latina esquerda
    g.beginPath();
    g.moveTo(70, 20);
    quadraticCurveTo(g, 70, 20, 40, 55, 20, 90, 10);
    g.lineTo(70, 112);
    g.closePath();
    g.fillStyle(0xf1e4bf, 1);
    g.fillPath();
    g.lineStyle(2, COLORS.ink, 0.55);
    g.strokePath();

    // Vela latina direita, com a Cruz da Ordem de Cristo
    g.beginPath();
    g.moveTo(70, 20);
    quadraticCurveTo(g, 70, 20, 100, 55, 120, 90, 10);
    g.lineTo(70, 112);
    g.closePath();
    g.fillStyle(0xf6ecc8, 1);
    g.fillPath();
    g.lineStyle(2, COLORS.ink, 0.55);
    g.strokePath();

    g.fillStyle(0xa7332a, 1);
    g.fillRect(92, 66, 22, 7);
    g.fillRect(100, 54, 7, 32);

    // Flamula no topo do mastro
    g.fillStyle(0xa7332a, 1);
    g.fillTriangle(70, 8, 70, 20, 90, 14);

    g.generateTexture('caravela', 140, 196);

    // Caravela de lado para a cutscene de chegada. Mantem o mesmo
    // vocabulário visual da caravela principal, mas em perfil lateral.
    g.clear();
    g.fillStyle(0x7d4e2a, 1);
    g.beginPath();
    g.moveTo(18, 92);
    quadraticCurveTo(g, 18, 92, 58, 130, 150, 124, 16);
    quadraticCurveTo(g, 150, 124, 204, 110, 218, 76, 14);
    g.lineTo(190, 98);
    g.lineTo(42, 98);
    g.closePath();
    g.fillPath();
    g.lineStyle(4, COLORS.ink, 0.88);
    g.strokePath();
    g.lineStyle(2, 0x5f371e, 0.58);
    [104, 114].forEach((y) => {
      g.beginPath(); g.moveTo(38, y); g.lineTo(185, y - 5); g.strokePath();
    });
    g.lineStyle(5, 0x2a1a0e, 1);
    g.beginPath(); g.moveTo(102, 24); g.lineTo(102, 105); g.strokePath();
    g.beginPath(); g.moveTo(145, 38); g.lineTo(145, 100); g.strokePath();
    g.fillStyle(0xf6ecc8, 1);
    g.beginPath();
    g.moveTo(106, 26);
    quadraticCurveTo(g, 106, 26, 52, 55, 44, 92, 12);
    g.lineTo(106, 92);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, COLORS.ink, 0.45);
    g.strokePath();
    g.fillStyle(0xf1e4bf, 1);
    g.beginPath();
    g.moveTo(148, 40);
    quadraticCurveTo(g, 148, 40, 184, 63, 192, 92, 10);
    g.lineTo(148, 92);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, COLORS.ink, 0.45);
    g.strokePath();
    g.fillStyle(0xa7332a, 1);
    g.fillRect(170, 66, 20, 6);
    g.fillRect(177, 56, 6, 26);
    g.fillStyle(0xa7332a, 1);
    g.fillTriangle(102, 22, 102, 34, 124, 28);
    g.lineStyle(3, 0xeef7f2, 0.7);
    g.beginPath(); g.moveTo(20, 126); quadraticCurveTo(g, 20, 126, 74, 144, 142, 128, 14); g.strokePath();
    g.generateTexture('caravela-side', 240, 150);

    // A partir daqui, todas as demais
    // texturas continuam sendo desenhadas por codigo abaixo.

    // -----------------------------------------------------------------
    // Textura de agua ambiente: linhas de onda em estilo tinta + leve
    // pontilhado, usada como camada flutuante e animada sobre o

    // gradiente do oceano (efeito de correnteza viva).
    // -----------------------------------------------------------------
    g.clear();
    g.lineStyle(2, 0xeaf6fa, 0.35);
    for (let row = 0; row < 4; row++) {
      const y0 = 20 + row * 40;
      g.beginPath();
      let p = { x: -10, y: y0 };
      g.moveTo(p.x, p.y);
      p = quadraticCurveTo(g, p.x, p.y, 30, y0 - 12, 70, y0, 10);
      p = quadraticCurveTo(g, p.x, p.y, 110, y0 + 12, 170, y0, 10);
      g.strokePath();
    }
    g.fillStyle(0xffffff, 0.05);
    for (let i = 0; i < 20; i++) {
      g.fillCircle(Phaser.Math.Between(0, 160), Phaser.Math.Between(0, 160), Phaser.Math.Between(1, 2));
    }
    g.generateTexture('water-tile', 160, 160);

    // Camadas adicionais do mar: ondulacao larga, reflexos e espuma.
    // Usadas em velocidades diferentes para criar parallax sem depender
    // de imagens externas.
    g.clear();
    g.lineStyle(3, 0x5aa7b6, 0.22);
    for (let row = 0; row < 5; row++) {
      const y0 = 22 + row * 46;
      g.beginPath();
      g.moveTo(-20, y0);
      quadraticCurveTo(g, -20, y0, 70, y0 - 22, 170, y0 + 4, 18);
      quadraticCurveTo(g, 170, y0 + 4, 250, y0 + 22, 340, y0 - 8, 18);
      g.strokePath();
    }
    g.generateTexture('water-swell', 320, 240);

    g.clear();
    g.lineStyle(2, 0xf6ecc8, 0.26);
    for (let row = 0; row < 4; row++) {
      const y0 = 18 + row * 48;
      g.beginPath();
      g.moveTo(18, y0);
      quadraticCurveTo(g, 18, y0, 84, y0 - 9, 140, y0 + 3, 10);
      g.strokePath();
      g.beginPath();
      g.moveTo(190, y0 + 22);
      quadraticCurveTo(g, 190, y0 + 22, 250, y0 + 8, 310, y0 + 16, 10);
      g.strokePath();
    }
    g.generateTexture('water-reflect', 340, 220);

    g.clear();
    g.lineStyle(2, 0xffffff, 0.34);
    for (let row = 0; row < 4; row++) {
      const y0 = 20 + row * 54;
      g.beginPath();
      g.moveTo(8, y0);
      quadraticCurveTo(g, 8, y0, 32, y0 - 12, 58, y0, 8);
      quadraticCurveTo(g, 58, y0, 85, y0 + 13, 118, y0 - 2, 8);
      g.strokePath();
    }
    g.fillStyle(0xffffff, 0.18);
    for (let i = 0; i < 34; i++) {
      g.fillCircle(Phaser.Math.Between(0, 180), Phaser.Math.Between(0, 220), Phaser.Math.Between(1, 2));
    }
    g.generateTexture('foam-tile', 180, 220);

    g.clear();
    g.fillStyle(0xffffff, 0.78);
    g.fillCircle(8, 8, 2);
    g.fillCircle(19, 5, 1.5);
    g.fillCircle(29, 10, 1.2);
    g.lineStyle(2, 0xf5ffff, 0.38);
    g.beginPath();
    g.moveTo(4, 13);
    quadraticCurveTo(g, 4, 13, 16, 7, 32, 12, 8);
    g.strokePath();
    g.generateTexture('foam-speck', 38, 18);

    g.clear();
    g.lineStyle(2, 0xffffff, 0.62);
    g.beginPath();
    g.moveTo(18, 0);
    g.lineTo(2, 46);
    g.strokePath();
    g.lineStyle(1, 0xc9f4ff, 0.34);
    g.beginPath();
    g.moveTo(24, 8);
    g.lineTo(13, 40);
    g.strokePath();
    g.generateTexture('rain-drop', 28, 50);

    // -----------------------------------------------------------------
    // Gradiente vertical do oceano ao longo de todo o mundo do jogo:
    // aguas profundas e escuras perto de Cabo Verde (base do mundo) ate
    // tons mais claros e "tropicais" perto da costa (topo do mundo).
    // Gerado em baixa resolucao e esticado via setDisplaySize â€” como e
    // um gradiente puramente vertical, o estiramento nao gera artefatos.
    // -----------------------------------------------------------------
    g.clear();
    const gradH = 920;
    for (let y = 0; y < gradH; y++) {
      const t = y / gradH; // 0 = topo do mundo (perto da costa) .. 1 = base (Cabo Verde)
      let color;
      if (t < 0.15) color = lerpColorHex(COLORS.oceanTropical, COLORS.oceanLight, t / 0.15);
      else if (t < 0.55) color = lerpColorHex(COLORS.oceanLight, COLORS.oceanMid, (t - 0.15) / 0.4);
      else color = lerpColorHex(COLORS.oceanMid, COLORS.oceanDeep, (t - 0.55) / 0.45);
      g.fillStyle(color, 1);
      g.fillRect(0, y, 8, 1);
    }
    g.generateTexture('sea-gradient', 8, gradH);

    // -----------------------------------------------------------------
    // Nuvem (com leve contorno de tinta) e ave (par de "M" conectados)
    // -----------------------------------------------------------------
    g.clear();
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(16, 18, 10);
    g.fillCircle(32, 14, 13);
    g.fillCircle(48, 18, 9);
    g.fillRoundedRect(10, 18, 48, 14, 7);
    g.lineStyle(2, COLORS.ink, 0.16);
    g.strokeCircle(16, 18, 10);
    g.strokeCircle(32, 14, 13);
    g.strokeCircle(48, 18, 9);
    g.strokeRoundedRect(10, 18, 48, 14, 7);
    g.generateTexture('cloud', 66, 38);

    g.clear();
    g.lineStyle(4, 0x1c2733, 0.8);
    g.beginPath();
    g.moveTo(0, 12); g.lineTo(12, 0); g.lineTo(24, 10); g.lineTo(36, 0); g.lineTo(48, 12);
    g.strokePath();
    g.generateTexture('bird', 48, 20);

    g.clear();
    g.fillStyle(0x78c7d2, 0.72);
    g.fillEllipse(18, 10, 24, 10);
    g.fillTriangle(5, 10, 0, 4, 0, 16);
    g.fillStyle(0xe6ffff, 0.50);
    g.fillCircle(26, 8, 1.4);
    g.lineStyle(1, 0x062331, 0.35);
    g.strokeEllipse(18, 10, 24, 10);
    g.generateTexture('fish-small', 34, 20);

    g.clear();
    g.lineStyle(3, 0x6fa36d, 0.72);
    g.beginPath();
    g.moveTo(5, 18);
    quadraticCurveTo(g, 5, 18, 24, 2, 44, 16, 10);
    g.strokePath();
    g.lineStyle(2, 0xb49a5a, 0.70);
    g.beginPath();
    g.moveTo(16, 10);
    quadraticCurveTo(g, 16, 10, 28, 25, 48, 21, 8);
    g.strokePath();
    g.fillStyle(0xf6ecc8, 0.38);
    g.fillCircle(52, 20, 2);
    g.generateTexture('sea-debris', 58, 32);

    // -----------------------------------------------------------------
    // Vento e corrente favoraveis agora sao itens pequenos e coletaveis
    // (ver icon-wind / icon-current mais abaixo), enquanto o oceano fica
    // sempre em movimento por ondas, espuma e reflexos.

    // -----------------------------------------------------------------
    // PEDRA: obstaculo perigoso, com halo de espuma ao redor (perigo na
    // agua) e facetas de sombra/luz para dar volume.
    // -----------------------------------------------------------------
    g.clear();
    g.fillStyle(0xdfe9ee, 0.18);
    g.fillCircle(60, 58, 54);
    g.lineStyle(3, 0xdfe9ee, 0.45);
    g.strokeCircle(60, 58, 48);
    g.beginPath();
    g.moveTo(58, 8);
    g.lineTo(98, 28);
    g.lineTo(108, 67);
    g.lineTo(76, 100);
    g.lineTo(32, 94);
    g.lineTo(10, 60);
    g.lineTo(26, 22);
    g.closePath();
    g.fillStyle(0x565a58, 1);
    g.fillPath();
    g.lineStyle(3, 0x1a1a18, 0.9);
    g.strokePath();
    g.fillStyle(0x7b817c, 0.85);
    g.fillTriangle(32, 28, 58, 10, 50, 42);
    g.fillStyle(0x3b3f3d, 0.72);
    g.fillTriangle(74, 34, 98, 52, 72, 62);
    g.lineStyle(2, 0x9ea59f, 0.55);
    g.beginPath(); g.moveTo(34, 54); g.lineTo(58, 44); g.lineTo(84, 58); g.strokePath();
    g.generateTexture('rock', 120, 112);

    // -----------------------------------------------------------------
    // REDEMOINHO: massa circular escura com espirais de espuma em
    // perspectiva. A leitura precisa ser imediata: agua sugada para um
    // centro perigoso, nao um icone abstrato.
    // -----------------------------------------------------------------
    if (!this.textures.exists('whirlpool')) {
      g.clear();
      g.fillStyle(0x000711, 0.34);
      g.fillEllipse(110, 120, 188, 132);
      g.fillStyle(0x021525, 0.96);
      g.fillEllipse(110, 108, 184, 142);
      g.fillStyle(0x0d4c62, 0.68);
      g.fillEllipse(110, 108, 150, 110);
      g.fillStyle(0x167f91, 0.38);
      g.fillEllipse(110, 108, 116, 82);

      const drawWhirlpoolArm = (offset, width, color, alpha, radiusStart, radiusEnd, squash = 0.78) => {
        g.lineStyle(width, color, alpha);
        g.beginPath();
        for (let step = 0; step <= 1.001; step += 0.035) {
          const angle = offset + step * Math.PI * 2.25;
          const radius = Phaser.Math.Linear(radiusStart, radiusEnd, step);
          const x = 110 + Math.cos(angle) * radius;
          const y = 108 + Math.sin(angle) * radius * squash;
          if (step === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      };

      [0, 2.1, 4.2].forEach((offset) => {
        drawWhirlpoolArm(offset, 14, 0x020914, 0.48, 88, 15);
        drawWhirlpoolArm(offset + 0.08, 8, 0x52d5e6, 0.86, 82, 12);
        drawWhirlpoolArm(offset + 0.18, 4, 0xecffff, 0.82, 72, 8);
      });

      g.lineStyle(4, 0xbaf3fa, 0.58);
      g.strokeEllipse(110, 108, 178, 132);
      g.lineStyle(2, 0xffefae, 0.45);
      g.strokeEllipse(110, 108, 198, 148);
      g.lineStyle(2, 0xffffff, 0.42);
      [[32, 75, 58, 52, 88, 62], [132, 48, 166, 60, 178, 91], [44, 142, 78, 158, 112, 146], [127, 150, 156, 136, 181, 151]].forEach(([x0, y0, cx, cy, x1, y1]) => {
        g.beginPath();
        g.moveTo(x0, y0);
        quadraticCurveTo(g, x0, y0, cx, cy, x1, y1, 12);
        g.strokePath();
      });

      g.fillStyle(0x02070c, 1);
      g.fillEllipse(110, 108, 48, 36);
      g.fillStyle(0x000000, 0.72);
      g.fillEllipse(110, 110, 28, 22);
      g.lineStyle(5, 0x72d7e5, 0.76);
      g.strokeEllipse(110, 108, 60, 44);
      g.fillStyle(0xffffff, 0.82);
      g.fillCircle(64, 54, 5);
      g.fillCircle(165, 80, 4);
      g.fillCircle(70, 149, 3);
      g.fillCircle(143, 147, 3);
      g.fillCircle(190, 114, 3);
      g.generateTexture('whirlpool', 220, 220);
    }


    // -----------------------------------------------------------------
    // Icones pequenos de status/coletaveis: vento, corrente e
    // tempestade. Vento e corrente tambem sao usados como ITENS no
    // cenario (halo de destaque atras do desenho, como um "gem" de HQ).
    // -----------------------------------------------------------------
    g.clear();
    g.fillStyle(0xffefae, 0.18);
    g.fillCircle(36, 36, 34);
    g.lineStyle(3, 0xffefae, 0.85);
    g.strokeCircle(36, 36, 31);
    g.lineStyle(2, 0x6a4b18, 0.38);
    g.strokeCircle(36, 36, 25);
    g.fillStyle(0xfffbdf, 0.98);
    g.fillTriangle(33, 11, 33, 58, 58, 42);
    g.fillStyle(0xe0c371, 0.92);
    g.fillTriangle(31, 22, 13, 54, 31, 54);
    g.lineStyle(3, 0x6f4e22, 0.82);
    g.beginPath();
    g.moveTo(33, 10);
    g.lineTo(33, 60);
    g.strokePath();
    g.lineStyle(3, 0xffffff, 0.9);
    [[8, 23, 24, 17, 43, 21], [6, 36, 23, 29, 47, 34], [10, 49, 27, 44, 45, 48]].forEach(([x0, y0, cx, cy, x1, y1]) => {
      g.beginPath();
      g.moveTo(x0, y0);
      quadraticCurveTo(g, x0, y0, cx, cy, x1, y1, 10);
      g.strokePath();
    });
    g.fillStyle(0xffffff, 0.95);
    g.fillTriangle(51, 34, 62, 40, 50, 46);
    g.generateTexture('icon-wind', 72, 72);

    g.clear();
    g.fillStyle(0x082c38, 0.88);
    g.fillCircle(36, 36, 31);
    g.fillStyle(0x70e4df, 0.18);
    g.fillCircle(36, 36, 34);
    g.lineStyle(3, 0x98fff4, 0.86);
    g.strokeCircle(36, 36, 30);
    [[15, 26, 30, 15, 48, 23], [12, 38, 33, 28, 58, 37], [18, 50, 34, 58, 52, 48]].forEach(([x0, y0, cx, cy, x1, y1], i) => {
      const bright = i === 1;
      g.lineStyle(bright ? 6 : 4, bright ? 0xb6fff8 : 0x4fc9c4, bright ? 0.96 : 0.82);
      g.beginPath();
      g.moveTo(x0, y0);
      quadraticCurveTo(g, x0, y0, cx, cy, x1, y1, 14);
      g.strokePath();
      g.fillStyle(bright ? 0xb6fff8 : 0x4fc9c4, 0.96);
      g.fillTriangle(x1 + 7, y1, x1 - 7, y1 - 7, x1 - 5, y1 + 8);
    });
    g.fillStyle(0xeaffff, 0.95);
    g.fillCircle(20, 22, 2.5);
    g.fillCircle(54, 53, 2.5);
    g.lineStyle(2, 0x05212c, 0.55);
    g.strokeCircle(36, 36, 22);
    g.generateTexture('icon-current', 72, 72);

    g.clear();
    g.fillStyle(0x232a3d, 1);
    g.fillRoundedRect(8, 20, 40, 20, 10);
    g.fillCircle(20, 20, 10);
    g.fillCircle(36, 18, 12);
    g.lineStyle(2, 0x0b0f18, 0.8);
    g.strokeRoundedRect(8, 20, 40, 20, 10);
    g.fillStyle(0xf7edb8, 1);
    g.beginPath();
    g.moveTo(30, 40); g.lineTo(22, 52); g.lineTo(28, 52); g.lineTo(22, 66);
    g.lineTo(36, 50); g.lineTo(30, 50); g.lineTo(36, 40); g.closePath();
    g.fillPath();
    g.generateTexture('icon-storm', 56, 70);



    // -----------------------------------------------------------------
    // Massa de TEMPESTADE: nuvens escuras sobrepostas, bloqueando parte
    // do corredor de navegacao (o jogador deve desviar pelo espaco livre)
    // -----------------------------------------------------------------
    g.clear();
    g.beginPath();
    let sp = { x: 40, y: 200 };
    g.moveTo(sp.x, sp.y);
    sp = quadraticCurveTo(g, sp.x, sp.y, 60, 60, 220, 40, 14);
    sp = quadraticCurveTo(g, sp.x, sp.y, 400, 10, 520, 70, 14);
    sp = quadraticCurveTo(g, sp.x, sp.y, 660, 110, 660, 240, 14);
    sp = quadraticCurveTo(g, sp.x, sp.y, 640, 360, 460, 390, 14);
    sp = quadraticCurveTo(g, sp.x, sp.y, 260, 410, 120, 380, 14);
    sp = quadraticCurveTo(g, sp.x, sp.y, 20, 340, 40, 200, 14);
    g.closePath();
    g.fillStyle(0x141a28, 0.88);
    g.fillPath();
    g.lineStyle(4, 0x0b0f18, 0.85);
    g.strokePath();

    // veios internos, sugerindo volume sem poluir o desenho
    g.lineStyle(2, 0x2c3550, 0.5);
    g.beginPath();
    let vp = { x: 140, y: 150 };
    g.moveTo(vp.x, vp.y);
    quadraticCurveTo(g, vp.x, vp.y, 300, 100, 460, 150, 12);
    g.strokePath();
    g.generateTexture('storm-cloud', 700, 420);

    // Raio (usado como flash dramatico proximo a tempestade)
    g.clear();
    g.fillStyle(0xf7edb8, 0.95);
    g.beginPath();
    g.moveTo(26, 0); g.lineTo(8, 46); g.lineTo(22, 46); g.lineTo(0, 96);
    g.lineTo(30, 42); g.lineTo(16, 42); g.lineTo(38, 0); g.closePath();
    g.fillPath();
    g.generateTexture('lightning', 40, 96);

    // Onda gigante: obstaculo nao fatal que empurra o navio lateralmente.
    // Inspirada na referencia em HQ: crista branca, hachuras internas e
    // bolhas pequenas, mas sem moldura quadrada para funcionar no mapa.
    g.clear();
    g.fillStyle(0x061724, 0.22);
    g.fillEllipse(132, 118, 224, 98);
    g.fillStyle(0x174b60, 0.96);
    g.beginPath();
    g.moveTo(12, 124);
    let waveP = { x: 12, y: 124 };
    waveP = quadraticCurveTo(g, waveP.x, waveP.y, 48, 64, 92, 72, 16);
    waveP = quadraticCurveTo(g, waveP.x, waveP.y, 120, 78, 132, 38, 14);
    waveP = quadraticCurveTo(g, waveP.x, waveP.y, 184, 44, 205, 97, 16);
    waveP = quadraticCurveTo(g, waveP.x, waveP.y, 224, 140, 258, 112, 10);
    g.lineTo(258, 158);
    g.lineTo(12, 158);
    g.closePath();
    g.fillPath();

    g.fillStyle(0x2f8191, 0.9);
    g.beginPath();
    g.moveTo(36, 138);
    quadraticCurveTo(g, 36, 138, 78, 84, 116, 85, 15);
    quadraticCurveTo(g, 116, 85, 150, 90, 165, 54, 12);
    quadraticCurveTo(g, 165, 54, 201, 66, 214, 106, 12);
    g.lineTo(214, 152);
    g.lineTo(36, 152);
    g.closePath();
    g.fillPath();

    g.lineStyle(6, 0xf7ffff, 0.98);
    g.beginPath();
    g.moveTo(20, 118);
    quadraticCurveTo(g, 20, 118, 58, 58, 99, 69, 16);
    quadraticCurveTo(g, 99, 69, 125, 80, 136, 39, 12);
    quadraticCurveTo(g, 136, 39, 176, 46, 194, 78, 12);
    quadraticCurveTo(g, 194, 78, 210, 112, 244, 98, 10);
    g.strokePath();

    g.fillStyle(0xf5ffff, 0.86);
    g.fillCircle(128, 43, 10);
    g.fillCircle(147, 48, 8);
    g.fillCircle(166, 58, 6);
    g.fillCircle(188, 73, 5);

    g.lineStyle(3, 0x08121b, 0.58);
    [52, 70, 88, 106, 124].forEach((x, i) => {
      g.beginPath();
      g.moveTo(x, 138);
      quadraticCurveTo(g, x, 138, x + 18, 104 - i * 4, x + 34, 78 + i * 2, 10);
      g.strokePath();
    });
    g.lineStyle(2, 0xd8f3f6, 0.55);
    [44, 60, 76, 92].forEach((x, i) => {
      g.beginPath();
      g.moveTo(x, 142);
      quadraticCurveTo(g, x, 142, x + 42, 132 - i * 3, x + 94, 138 - i * 6, 12);
      g.strokePath();
    });
    g.lineStyle(3, 0xb9e7ec, 0.72);
    g.beginPath();
    g.moveTo(24, 152);
    quadraticCurveTo(g, 24, 152, 98, 166, 210, 140, 18);
    g.strokePath();
    g.fillStyle(0xf7ffff, 0.82);
    [[156, 28, 3], [173, 34, 3], [189, 44, 2.5], [202, 58, 2.2], [215, 78, 2], [232, 91, 1.8]].forEach(([x, y, r]) => {
      g.fillCircle(x, y, r);
    });
    g.lineStyle(3, 0x08121b, 0.68);
    g.beginPath();
    g.moveTo(12, 124);
    quadraticCurveTo(g, 12, 124, 48, 64, 92, 72, 14);
    quadraticCurveTo(g, 92, 72, 120, 78, 132, 38, 12);
    quadraticCurveTo(g, 132, 38, 184, 44, 205, 97, 12);
    g.strokePath();
    g.generateTexture('giant-wave', 272, 174);

    // Nevoa: banco visual no mapa. Ao tocar, a visibilidade diminui por
    // alguns segundos, reforcando a ideia de aguas desconhecidas.
    g.clear();
    g.fillStyle(0xffffff, 0.58);
    g.fillCircle(70, 72, 44);
    g.fillCircle(128, 54, 58);
    g.fillCircle(204, 68, 50);
    g.fillCircle(258, 86, 38);
    g.fillRoundedRect(46, 72, 250, 66, 32);
    g.lineStyle(4, 0xdfe8df, 0.72);
    g.strokeRoundedRect(48, 74, 246, 62, 32);
    g.lineStyle(3, 0xffffff, 0.48);
    [122, 148, 172].forEach((y, i) => {
      g.beginPath();
      g.moveTo(20 + i * 20, y);
      quadraticCurveTo(g, 20 + i * 20, y, 126, y + 24, 320, y - 8, 18);
      g.strokePath();
    });
    g.generateTexture('fog-bank', 340, 190);

    // Sinal de terra: folhas/galhos flutuando perto do fim da travessia.
    g.clear();
    g.lineStyle(4, 0x5a3a1d, 0.95);
    g.beginPath();
    g.moveTo(20, 44);
    quadraticCurveTo(g, 20, 44, 62, 25, 102, 48, 12);
    g.strokePath();
    g.fillStyle(0x3f7d3a, 0.95);
    g.fillEllipse(45, 34, 34, 16);
    g.fillEllipse(72, 46, 40, 17);
    g.fillStyle(0x78a85e, 0.92);
    g.fillEllipse(93, 37, 32, 14);
    g.lineStyle(2, 0xf6ecc8, 0.36);
    g.beginPath(); g.moveTo(32, 34); g.lineTo(103, 45); g.strokePath();
    g.generateTexture('land-sign', 128, 80);

    // -----------------------------------------------------------------
    // Linha da costa: praia + vegetacao + silhuetas de arvores, revelada
    // quando a frota se aproxima do fim da travessia (Terra a vista!)
    // -----------------------------------------------------------------
    g.clear();
    g.fillStyle(0xd8c48a, 1);
    g.fillRoundedRect(0, 330, 1400, 90, 0);
    g.fillStyle(0x3f6a3a, 1);
    for (let i = 0; i < 9; i++) g.fillCircle(80 + i * 160, 260 - (i % 2) * 40, 120);
    g.fillStyle(0x2c5230, 1);
    for (let i = 0; i < 6; i++) g.fillCircle(180 + i * 220, 200, 90);
    g.fillStyle(0x1f3a24, 1);
    for (let i = 0; i < 20; i++) {
      const x = 40 + i * 68;
      g.fillTriangle(x, 300, x - 16, 340, x + 16, 340);
    }
    g.generateTexture('coastline', 1400, 420);

    // -----------------------------------------------------------------
    // Rosa dos ventos decorativa (canto da HUD, reforco de identidade
    // "mapa historico")
    // -----------------------------------------------------------------
    g.clear();
    g.lineStyle(2, COLORS.bronze, 0.9);
    g.strokeCircle(45, 45, 38);
    g.strokeCircle(45, 45, 28);
    g.lineStyle(2, COLORS.ink, 0.7);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i;
      const x1 = 45 + Math.cos(angle) * 30;
      const y1 = 45 + Math.sin(angle) * 30;
      const x2 = 45 + Math.cos(angle) * 8;
      const y2 = 45 + Math.sin(angle) * 8;
      g.beginPath(); g.moveTo(x2, y2); g.lineTo(x1, y1); g.strokePath();
    }
    g.fillStyle(COLORS.bronze, 1);
    g.fillTriangle(45, 8, 40, 45, 50, 45);
    g.generateTexture('compass-rose', 90, 90);

    // Particula de espuma (rastro do navio)
    g.clear();
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(10, 10, 8);
    g.generateTexture('wake-particle', 20, 20);

    g.destroy();
  }
}

// =====================================================================
// AmbientBackdrop â€” cenario decorativo animado (nuvens/aves) para as
// cenas que NAO rolam camera (Menu, Intro, Falha, Vitoria, Creditos).
// =====================================================================
class AmbientBackdrop {
  constructor(scene, alpha = 1) {
    this.scene = scene;
    const g = scene.add.graphics().setDepth(0);
    for (let y = 0; y < GAME.height; y += 16) {
      const t = y / GAME.height;
      const color = lerpColorHex(COLORS.oceanLight, COLORS.oceanDeep, t);
      g.fillStyle(color, alpha);
      g.fillRect(0, y, GAME.width, 17);
    }

    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const cloud = scene.add.image(
        Phaser.Math.Between(20, GAME.width - 20),
        Phaser.Math.Between(30, 170),
        'cloud'
      ).setDepth(2).setAlpha(0.14 + Math.random() * 0.16).setScale(Phaser.Math.FloatBetween(1.0, 2.2));
      this.clouds.push(cloud);
    }

    this.birds = [];
    for (let i = 0; i < 5; i++) {
      const bird = scene.add.image(
        Phaser.Math.Between(0, GAME.width),
        Phaser.Math.Between(70, 240),
        'bird'
      ).setDepth(3).setAlpha(0.32).setScale(Phaser.Math.FloatBetween(0.5, 1.0));
      this.birds.push(bird);
    }

    this.updateHandler = (_time, delta) => this.update(delta);
    scene.events.on('update', this.updateHandler);
    scene.events.once('shutdown', () => scene.events.off('update', this.updateHandler));
  }

  update(delta) {
    const dt = delta / 16.67;
    this.clouds.forEach((c, i) => {
      c.x -= (0.08 + i * 0.01) * dt;
      if (c.x < -140) c.x = GAME.width + 140;
    });
    this.birds.forEach((b, i) => {
      b.x -= (0.5 + i * 0.08) * dt;
      b.y += Math.sin((this.scene.time.now + i * 300) / 450) * 0.16;
      if (b.x < -80) { b.x = GAME.width + 80; b.y = Phaser.Math.Between(70, 240); }
    });
  }
}

// =====================================================================
// MenuScene â€” tela inicial
// =====================================================================
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    new AmbientBackdrop(this);
    drawComicFrame(this);
    const startRun = () => this.scene.start('GameScene');
    const params = new URLSearchParams(window.location.search);
    if (params.get('play') === '1') {
      this.time.delayedCall(80, startRun);
    }

    // Cabeçalho curto, como a abertura de um capítulo de HQ.
    makeText(this, 640, 34, 'CAPÍTULO 2  •  MARÇO DE 1500', {
      font: FONT_TITLE, size: '14px', style: 'bold', color: '#d7bd78', align: 'center', depth: 10
    }).setOrigin(0.5);
    makeText(this, 640, 70, 'TRAVESSIA DO ATLÂNTICO', {
      font: FONT_TITLE, size: '38px', style: 'bold', color: '#fff4cf', align: 'center', depth: 10
    }).setOrigin(0.5);
    makeText(this, 640, 104, 'A Volta do Mar  •  Ventos, correntes e uma costa fora dos mapas', {
      size: '17px', color: '#d8c99e', align: 'center', depth: 10
    }).setOrigin(0.5);

    // Painel esquerdo: contexto histórico e rota visual da Volta do Mar.
    drawPaper(this, 48, 128, 460, 444, 12, 0.96);
    makeText(this, 78, 153, 'A MISSÃO', {
      font: FONT_TITLE, size: '22px', style: 'bold', color: '#241a10', depth: 14
    });
    makeText(this, 78, 190,
      'Depois de Cabo Verde, a esquadra de Cabral\n' +
      'se afasta da costa africana. É a Volta do Mar:\n' +
      'um grande desvio para oeste, em busca dos\n' +
      'ventos e correntes do Atlântico.',
      { size: '16px', color: '#2f2418', lineSpacing: 7, depth: 14 }
    );

    const route = this.add.graphics().setDepth(14).setScrollFactor(0);
    route.fillStyle(0x183f52, 0.13);
    route.fillRoundedRect(76, 316, 404, 212, 12);
    route.lineStyle(2, 0x7d5a28, 0.45);
    route.strokeRoundedRect(76, 316, 404, 212, 12);
    route.fillStyle(0x9a7a3f, 0.65);
    route.fillCircle(125, 355, 8);
    route.fillCircle(430, 478, 9);
    // Rota pontilhada em arco: o desvio para oeste é a ideia central.
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const x = 137 + 278 * t;
      const y = 360 + 112 * t + Math.sin(t * Math.PI) * 66;
      route.fillStyle(0x7d3f23, i % 2 ? 0.35 : 0.9);
      route.fillCircle(x, y, i % 2 ? 2 : 3);
    }
    makeText(this, 98, 332, 'CABO VERDE', { size: '12px', style: 'bold', color: '#3b2a18', depth: 15 });
    makeText(this, 368, 494, 'COSTA\nDESCONHECIDA', { size: '12px', style: 'bold', color: '#3b2a18', align: 'center', depth: 15 });
    makeText(this, 165, 452, 'VOLTA DO MAR', { font: FONT_TITLE, size: '14px', style: 'bold', color: '#7d3f23', depth: 15 });
    const menuShip = this.add.image(275, 402, 'caravela').setDepth(16).setScale(0.62).setAlpha(0.98).setAngle(18);
    this.tweens.add({ targets: menuShip, y: 409, angle: 13, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    makeText(this, 92, 542, 'OBJETIVO  •  Complete 7.000 km e alcance a costa.', {
      size: '13px', style: 'bold', color: '#5b3b1e', depth: 15
    });

    // Painel direito: tutorial visual e legenda, legíveis numa só olhada.
    drawPaper(this, 528, 128, 704, 444, 12, 0.96);
    makeText(this, 560, 153, 'COMO NAVEGAR', {
      font: FONT_TITLE, size: '22px', style: 'bold', color: '#241a10', depth: 14
    });
    const keycap = (x, y, label) => {
      const g = this.add.graphics().setDepth(15).setScrollFactor(0);
      g.fillStyle(0x241a10, 0.96); g.fillRoundedRect(x, y, 38, 34, 6);
      g.lineStyle(2, COLORS.bronze, 1); g.strokeRoundedRect(x, y, 38, 34, 6);
      makeText(this, x + 19, y + 17, label, { size: '16px', style: 'bold', color: '#fff4cf', align: 'center', depth: 16 }).setOrigin(0.5);
    };
    keycap(560, 198, '←'); keycap(604, 198, '↑'); keycap(648, 198, '→'); keycap(604, 238, '↓');
    makeText(this, 704, 205, 'PC', { size: '12px', style: 'bold', color: '#7d3f23', depth: 15 });
    makeText(this, 704, 224, 'Setas ou WASD', { size: '16px', style: 'bold', color: '#2f2418', depth: 15 });
    makeText(this, 704, 247, 'Guie para os lados; o navio avança sozinho.', { size: '13px', color: '#4d3b27', depth: 15 });
    makeText(this, 956, 205, 'CELULAR', { size: '12px', style: 'bold', color: '#7d3f23', depth: 15 });
    makeText(this, 956, 226, '☝  Toque e arraste', { size: '16px', style: 'bold', color: '#2f2418', depth: 15 });
    makeText(this, 956, 249, 'Jogue em modo paisagem.', { size: '13px', color: '#4d3b27', depth: 15 });

    const divider = this.add.graphics().setDepth(14).setScrollFactor(0);
    divider.lineStyle(2, 0x7d5a28, 0.45); divider.lineBetween(560, 290, 1200, 290);
    makeText(this, 560, 308, 'LEGENDA DE BORDO', {
      font: FONT_TITLE, size: '17px', style: 'bold', color: '#241a10', depth: 15
    });
    const legend = [
      { key: 'icon-wind', label: 'VENTO', note: 'ganha velocidade', x: 570, y: 360 },
      { key: 'icon-current', label: 'CORRENTE', note: 'ganha velocidade', x: 870, y: 360 },
      { key: 'giant-wave', label: 'ONDA / NEBLINA', note: 'desvia ou encobre', x: 570, y: 430 },
      { key: 'icon-storm', label: 'TEMPESTADE / PEDRAS', note: 'perigo fatal', x: 870, y: 430 },
      { key: 'whirlpool', label: 'REDEMOINHO', note: 'perigo fatal', x: 570, y: 500 }
    ];
    legend.forEach((item) => {
      const icon = this.add.image(item.x, item.y, item.key).setDepth(15).setScrollFactor(0);
      if (item.key === 'giant-wave') icon.setDisplaySize(48, 30);
      else if (item.key === 'icon-storm') icon.setDisplaySize(30, 38);
      else icon.setDisplaySize(38, 38);
      makeText(this, item.x + 34, item.y - 11, item.label, { size: '13px', style: 'bold', color: '#2f2418', depth: 15 });
      makeText(this, item.x + 34, item.y + 8, item.note, { size: '12px', color: '#6c5130', depth: 15 });
    });

    makeButton(this, 210, 602, 420, 62, 'JOGAR  •  ANCORAS FORA!', startRun);
    makeButton(this, 652, 610, 260, 50, 'TELA CHEIA', () => {
      try {
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
      } catch (err) {
        // Alguns navegadores bloqueiam fullscreen fora de contexto permitido.
      }
    });
    makeButton(this, 934, 610, 180, 50, 'CRÉDITOS', () => this.scene.start('CreditsScene'));
    makeText(this, 640, 691, 'ENTER / ESPAÇO para jogar  •  Uma vida: escolha sua rota com cuidado.', {
      size: '12px', color: '#cdbf94', depth: 20, align: 'center'
    }).setOrigin(0.5);
    this.input.keyboard.once('keydown-ENTER', startRun);
    this.input.keyboard.once('keydown-SPACE', startRun);
  }
}

// =====================================================================
// OceanWorld â€” cenario da travessia: gradiente do oceano (mundo todo),
// agua ambiente animada, nuvens/aves e a revelacao da costa no final.
// =====================================================================
class OceanWorld {
  constructor(scene) {
    this.scene = scene;

    // Base: gradiente vertical do oceano, posicionado no espaco do MUNDO
    // (acompanha a rolagem normal da camera, como o proprio cenario).
    this.gradient = scene.add.image(GAME.worldWidth / 2, GAME.worldHeight / 2, 'sea-gradient')
      .setDisplaySize(GAME.worldWidth, GAME.worldHeight)
      .setDepth(-10);

    // Camadas de agua fixas na camera e animadas em velocidades
    // diferentes. Isso remove qualquer sensacao de oceano estatico e cria
    // ondas, reflexos, espuma e parallax constante.
    this.swellTile = scene.add.tileSprite(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 'water-swell')
      .setDepth(-9).setScrollFactor(0).setAlpha(0.38);
    this.waterTile = scene.add.tileSprite(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 'water-tile')
      .setDepth(-8).setScrollFactor(0).setAlpha(0.30);
    this.reflectionTile = scene.add.tileSprite(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 'water-reflect')
      .setDepth(-7).setScrollFactor(0).setAlpha(0.28);
    this.foamTile = scene.add.tileSprite(GAME.width / 2, GAME.height / 2, GAME.width, GAME.height, 'foam-tile')
      .setDepth(-6).setScrollFactor(0).setAlpha(0.18);

    this.foamSpecks = [];
    for (let i = 0; i < 10; i++) {
      const speck = scene.add.image(
        Phaser.Math.Between(70, GAME.width - 70),
        Phaser.Math.Between(80, GAME.height - 45),
        'foam-speck'
      ).setDepth(-5).setScrollFactor(0)
        .setAlpha(Phaser.Math.FloatBetween(0.08, 0.20))
        .setScale(Phaser.Math.FloatBetween(0.45, 0.92))
        .setAngle(Phaser.Math.Between(-10, 10));
      speck.baseAlpha = speck.alpha;
      speck.drift = Phaser.Math.FloatBetween(0.15, 0.55);
      speck.speed = Phaser.Math.FloatBetween(16, 42);
      this.foamSpecks.push(speck);
    }

    this.fish = [];
    for (let i = 0; i < 5; i++) {
      const fish = scene.add.image(
        Phaser.Math.Between(85, GAME.width - 85),
        Phaser.Math.Between(95, GAME.height - 70),
        'fish-small'
      ).setDepth(-4).setScrollFactor(0)
        .setAlpha(Phaser.Math.FloatBetween(0.10, 0.18))
        .setScale(Phaser.Math.FloatBetween(0.42, 0.72))
        .setFlipX(Phaser.Math.Between(0, 1) === 1);
      fish.speed = Phaser.Math.FloatBetween(10, 28);
      fish.side = fish.flipX ? -1 : 1;
      fish.phase = Phaser.Math.Between(0, 1200);
      this.fish.push(fish);
    }

    this.seaDecor = [];
    for (let i = 0; i < 8; i++) {
      const progress = Phaser.Math.FloatBetween(0.08, 0.94);
      const decor = scene.add.image(
        Phaser.Math.Between(GAME.laneMinX + 70, GAME.laneMaxX - 70),
        GAME.shipStartY - GAME.distanceTotal * progress,
        'sea-debris'
      ).setDepth(-2)
        .setAlpha(0.20)
        .setScale(Phaser.Math.FloatBetween(0.45, 0.78))
        .setAngle(Phaser.Math.Between(-24, 24));
      decor.spin = Phaser.Math.FloatBetween(-0.012, 0.012);
      this.seaDecor.push(decor);
    }

    // Nuvens/aves decorativas, fixas na camera (o oceano nao tem
    // referencia fixa de "posicao do ceu" â€” sao apenas atmosfera).
    // Faixa Y estreita e BEM alta na tela (15 a 95): os icones de vento/
    // corrente/perigo entram em quadro vindos de cima e, se as nuvens
    // ocupassem uma faixa larga (era 40-190), ficavam visualmente
    // "coladas" nos icones bem no momento em que o jogador mais precisa
    // ve-los com clareza. Alpha tambem mais baixo, pra ficar claramente
    // so atmosfera de fundo.
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const cloud = scene.add.image(
        Phaser.Math.Between(20, GAME.width - 20),
        Phaser.Math.Between(15, 95),
        'cloud'
      ).setDepth(2).setScrollFactor(0).setAlpha(0.10 + Math.random() * 0.10)
        .setScale(Phaser.Math.FloatBetween(0.85, 1.6));
      this.clouds.push(cloud);
    }

    this.birds = [];
    for (let i = 0; i < 4; i++) {
      const bird = scene.add.image(
        Phaser.Math.Between(0, GAME.width),
        Phaser.Math.Between(90, 260),
        'bird'
      ).setDepth(3).setScrollFactor(0).setAlpha(0.3).setScale(Phaser.Math.FloatBetween(0.5, 1.0));
      this.birds.push(bird);
    }

    this.coast = null;
    this.landSigns = [];
    [0.76, 0.83, 0.89, 0.94].forEach((p, i) => {
      const sign = scene.add.image(
        Phaser.Math.Between(GAME.laneMinX + 80, GAME.laneMaxX - 80),
        GAME.shipStartY - GAME.distanceTotal * p,
        'land-sign'
      ).setDepth(7).setAlpha(0).setScale(0.72 + i * 0.06).setAngle(Phaser.Math.Between(-18, 18));
      this.landSigns.push(sign);
    });

    // Tom dourado que vai aparecendo suavemente conforme a frota se
    // aproxima da costa (ultimos ~22% da travessia) â€” reforco
    // atmosferico de "terra a vista", complementar ao clima.
    this.approachTint = scene.add.graphics().setDepth(5).setScrollFactor(0).setAlpha(0);
    this.approachTint.fillStyle(0xd8b86a, 1);
    this.approachTint.fillRect(0, 0, GAME.width, GAME.height);
  }

  // Revela a linha da costa no topo do mundo, quando a frota se aproxima
  // do fim da travessia ("Terra a vista!").
  revealCoast() {
    if (this.coast) return;
    this.coast = this.scene.add.image(GAME.worldWidth / 2, GAME.finishY - 170, 'coastline')
      .setDepth(6).setDisplaySize(GAME.worldWidth + 120, 460).setAlpha(0);
    this.scene.tweens.add({ targets: this.coast, alpha: 1, duration: 1400 });
  }

  update(delta, forwardSpeed, progress = 0) {
    const dt = delta / 1000;
    const flow = Math.max(48, forwardSpeed);
    this.swellTile.tilePositionY -= flow * dt * 0.22;
    this.swellTile.tilePositionX += Math.sin(this.scene.time.now / 1200) * 0.18;
    this.waterTile.tilePositionY -= flow * dt * 0.62;
    this.waterTile.tilePositionX += flow * dt * 0.035;
    this.reflectionTile.tilePositionY -= flow * dt * 0.38;
    this.reflectionTile.tilePositionX += Math.sin(this.scene.time.now / 700) * 0.38;
    this.foamTile.tilePositionY -= flow * dt * 0.92;
    this.foamTile.tilePositionX -= flow * dt * 0.025;
    this.foamTile.setAlpha(0.15 + progress * 0.09);
    if ((this.scene.frameCounter || 0) % 2 === 0) this.foamSpecks.forEach((speck, i) => {
      speck.y += (speck.speed + flow * 0.08) * dt * 2;
      speck.x += Math.sin((this.scene.time.now + i * 170) / 850) * speck.drift;
      speck.setAlpha((speck.baseAlpha + progress * 0.04) * (0.78 + Math.sin((this.scene.time.now + i * 210) / 900) * 0.18));
      if (speck.y > GAME.height + 20) {
        speck.y = -20;
        speck.x = Phaser.Math.Between(70, GAME.width - 70);
      }
    });
    if ((this.scene.frameCounter || 0) % 2 === 0) this.fish.forEach((fish, i) => {
      fish.x += fish.side * fish.speed * dt;
      fish.y += Math.sin((this.scene.time.now + fish.phase) / 900) * 0.035 * (delta / 16.67);
      fish.setAlpha((0.10 + progress * 0.06) * (0.82 + Math.sin((this.scene.time.now + i * 130) / 1100) * 0.12));
      if (fish.side > 0 && fish.x > GAME.width + 30) {
        fish.x = -30;
        fish.y = Phaser.Math.Between(95, GAME.height - 70);
      } else if (fish.side < 0 && fish.x < -30) {
        fish.x = GAME.width + 30;
        fish.y = Phaser.Math.Between(95, GAME.height - 70);
      }
    });
    this.approachTint.setAlpha(progress > 0.78 ? (progress - 0.78) * 0.5 : 0);
    this.landSigns.forEach((sign) => {
      const dist = Math.abs(sign.y - this.scene.ship.sprite.y);
      const visible = progress > 0.72 && dist < 620;
      sign.setAlpha(visible ? 0.86 : 0);
      sign.angle += 0.025 * (delta / 16.67);
    });
    if ((this.scene.frameCounter || 0) % 3 === 0) this.seaDecor.forEach((decor, i) => {
      const dist = Math.abs(decor.y - this.scene.ship.sprite.y);
      const visible = dist < 610;
      decor.setAlpha(visible ? 0.16 + Math.sin((this.scene.time.now + i * 260) / 1200) * 0.04 : 0);
      decor.angle += decor.spin * (delta / 16.67);
    });

    this.clouds.forEach((cloud, i) => {
      cloud.x -= (0.06 + i * 0.01) * (delta / 16.67);
      if (cloud.x < -140) cloud.x = GAME.width + 140;
    });
    this.birds.forEach((bird, i) => {
      bird.x -= (0.5 + i * 0.07) * (delta / 16.67);
      bird.y += Math.sin((this.scene.time.now + i * 300) / 450) * 0.16;
      if (bird.x < -80) { bird.x = GAME.width + 80; bird.y = Phaser.Math.Between(90, 260); }
    });
  }
}

// =====================================================================
// LogbookHUD â€” "Diario de Bordo", com barra de progresso VERTICAL
// (o trajeto e vertical: Cabo Verde na base, Terra Desconhecida no topo)
// e rosa dos ventos decorativa.
// =====================================================================
class LogbookHUD {
  constructor(scene) {
    this.scene = scene;

    // Diario compacto: distancia navegada em KM, sem pontuacao aparente.
    drawPaper(scene, 20, 18, 150, 58, 60, 0.95);
    makeText(scene, 40, 28, 'DISTANCIA', { font: FONT_TITLE, size: '11px', style: 'bold', color: '#5f4420', depth: 70 });
    this.scoreText = makeText(scene, 40, 48, '0 km', { font: FONT_TITLE, size: '20px', style: 'bold', color: '#241a10', depth: 70 });

    // Indicador de velocidade permanente (fica sempre visivel na tela,
    // em vez de um aviso passageiro toda vez que o jogador pega um
    // booster).
    drawPaper(scene, 186, 18, 132, 58, 60, 0.95);
    makeText(scene, 252, 28, 'VELOCIDADE', {
      font: FONT_TITLE, size: '11px', style: 'bold', color: '#5f4420', align: 'center', depth: 70
    }).setOrigin(0.5, 0);
    this.speedText = makeText(scene, 252, 46, '1.00x', {
      font: FONT_TITLE, size: '22px', style: 'bold', color: '#241a10', align: 'center', depth: 70
    }).setOrigin(0.5);

    // Barra de progresso vertical, lateral direita da tela (agora com
    // mais espaco, ja que nao ha mais a barra grande do topo).
    this.trackX = GAME.width - 46;
    this.trackTop = 40;
    this.trackBottom = GAME.height - 40;
    drawPaper(scene, this.trackX - 30, this.trackTop - 26, 60, this.trackBottom - this.trackTop + 50, 60, 0.9);
    makeText(scene, this.trackX, this.trackTop - 16, 'ROTA', {
      font: FONT_TITLE, size: '14px', style: 'bold', color: '#241a10', align: 'center', depth: 70
    }).setOrigin(0.5);

    this.trackBg = scene.add.graphics().setDepth(68).setScrollFactor(0);
    this.trackBg.fillStyle(0x1e1a12, 0.55);
    this.trackBg.fillRoundedRect(this.trackX - 7, this.trackTop, 14, this.trackBottom - this.trackTop, 7);

    ROUTE_STAGES.forEach((stage) => {
      const y = Phaser.Math.Linear(this.trackBottom, this.trackTop, stage.at);
      const mark = scene.add.graphics().setDepth(70).setScrollFactor(0);
      mark.fillStyle(COLORS.bronze, 1);
      mark.fillCircle(this.trackX, y, 5);
    });

    this.trackFill = scene.add.graphics().setDepth(69).setScrollFactor(0);
    this.compass = scene.add.image(GAME.width - 60, GAME.height - 56, 'compass-rose')
      .setDepth(70).setScrollFactor(0).setAlpha(0.9);
  }

  update(state) {
    this.scoreText.setText(`${Math.round(state.distanceKm)} km`);

    this.speedText.setText(`${state.speedMultiplier.toFixed(2)}x`);
    this.speedText.setColor(state.speedMultiplier > 1.02 ? '#1c6b5e' : '#241a10');

    this.trackFill.clear();
    this.trackFill.fillStyle(state.inStorm ? COLORS.warning : COLORS.bronze, 1);
    const fillY = Phaser.Math.Linear(this.trackBottom, this.trackTop, state.progress);
    this.trackFill.fillRoundedRect(this.trackX - 7, fillY, 14, this.trackBottom - fillY, 7);
  }
}

// =====================================================================
// MessageLayer â€” legendas narrativas temporizadas (fixas na camera)
// =====================================================================
class MessageLayer {
  constructor(scene) {
    this.scene = scene;
    this.y = GAME.height - 58;

    this.bg = scene.add.graphics().setDepth(88).setScrollFactor(0).setAlpha(0);
    this.bg.fillStyle(0x0a0f16, 0.5);
    this.bg.fillRoundedRect(GAME.width / 2 - 390, this.y - 35, 780, 70, 14);

    this.text = makeText(scene, GAME.width / 2, this.y, '', {
      font: FONT_TITLE, size: '18px', color: '#f6ecc8', style: 'bold',
      align: 'center', wrap: 720, lineSpacing: 5, depth: 90
    }).setOrigin(0.5).setAlpha(0);
  }

  show(message, ms = 2000) {
    this.text.setText(message).setAlpha(0.9);
    this.bg.setAlpha(0.78);
    this.scene.tweens.killTweensOf([this.text, this.bg]);
    this.scene.tweens.add({ targets: [this.text, this.bg], alpha: 0, delay: ms, duration: 420 });
  }
}

// =====================================================================
// ShipController â€” movimento vertical automatico + direcao lateral do
// jogador (teclado, mouse/touch); formacao com dois navios de escolta.
// =====================================================================
class ShipController {
  constructor(scene) {
    this.scene = scene;
    this.sprite = scene.add.image(GAME.laneCenterX, GAME.shipStartY, 'caravela').setDepth(25).setScale(0.56);

    this.velocityX = 0;
    this.target = null;
    this.impulseX = 0;
    this.controlPenalty = 0;

    this.wake = scene.add.particles(this.sprite.x, this.sprite.y + 74, 'wake-particle', {
      speedY: { min: 24, max: 56 },
      speedX: { min: -12, max: 12 },
      lifespan: 440,
      frequency: 150,
      quantity: 1,
      alpha: { start: 0.42, end: 0 },
      scale: { start: 0.42, end: 0.08 }
    }).setDepth(20);

    this.keys = scene.input.keyboard.addKeys('W,A,S,D');
    this.cursors = scene.input.keyboard.createCursorKeys();

    scene.input.on('pointerdown', (p) => {
      SFX.ensure();
      this.setTargetFromPointer(p);
    });
    scene.input.on('pointermove', (p) => { if (p.isDown) this.setTargetFromPointer(p); });
    scene.input.on('pointerup', () => { this.target = null; });
    scene.input.keyboard.once('keydown', () => SFX.ensure());
  }

  // Converte a posicao do ponteiro (tela) para coordenada de MUNDO, ja
  // que a camera rola verticalmente acompanhando o navio.
  setTargetFromPointer(pointer) {
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.target = { x: worldPoint.x };
  }

  update(delta, forwardSpeed, modifiers) {
    const dt = Math.min(delta / 16.67, 2);
    let ax = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) ax -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) ax += 1;

    if (this.target) {
      const dx = this.target.x - this.sprite.x;
      if (Math.abs(dx) > 14) ax = Phaser.Math.Clamp(dx / 90, -1, 1);
    }

    const accel = 1.05 * modifiers.control;
    this.controlPenalty = Math.max(0, this.controlPenalty - delta);
    const penalty = this.controlPenalty > 0 ? 0.58 : 1;
    this.velocityX += ax * accel * penalty * dt;
    if (Math.abs(this.impulseX) > 0.05) {
      this.velocityX += this.impulseX * dt;
      this.impulseX *= 0.86;
    } else {
      this.impulseX = 0;
    }
    this.velocityX *= 0.91;
    this.velocityX = Phaser.Math.Clamp(this.velocityX, -8.8, 8.8);

    this.sprite.x = Phaser.Math.Clamp(this.sprite.x + this.velocityX * dt, GAME.laneMinX + 30, GAME.laneMaxX - 30);
    this.sprite.y -= forwardSpeed * (delta / 1000);
    this.sprite.angle = Phaser.Math.Linear(this.sprite.angle, this.velocityX * 2.4, 0.11);

    this.wake.setPosition(this.sprite.x, this.sprite.y + 58);
  }

  bounds() {
    return new Phaser.Geom.Rectangle(this.sprite.x - 18, this.sprite.y - 28, 36, 56);
  }

  pushFromWave(sourceX) {
    const dir = this.sprite.x < sourceX ? -1 : 1;
    this.impulseX += dir * 3.4;
    this.controlPenalty = 1200;
  }
}

// =====================================================================
// EventTrack â€” eventos da travessia pre-posicionados no mundo (faixas de
// vento/corrente e a tempestade), pautando o ritmo da narrativa.
// =====================================================================
class EventTrack {
  constructor(scene) {
    this.scene = scene;
    this.gates = [];
    this.storms = [];
    this.buildTrack();
  }

  // Mapa ALEATORIO (gerado a cada partida) â€” bem mais denso e perigoso
  // que a versao anterior. As zonas de vento/corrente sao pequenos itens
  // coletaveis (exige pontaria); pedra, redemoinho e tempestade sao os
  // riscos fatais e aparecem com bastante frequencia.
  buildTrack() {
    const totalDistance = GAME.distanceTotal;
    const margin = 780; // trecho final sem obstaculos, para a chegada cinematica
    // Perigos (pedra/redemoinho) dominam a mistura de eventos; mais itens
    // no total agora (pedido: mais obstaculos).
    const weightedTypes = [
      'wind', 'wind', 'current', 'current',
      'wave', 'fog',
      'rock', 'rock', 'rock', 'rock', 'rock', 'rock', 'rock',
      'whirlpool', 'whirlpool', 'whirlpool', 'whirlpool', 'whirlpool'
    ];

    // Regras de espacamento â€” calibradas pra sempre sobrar tempo real de
    // reposicionar o navio lateralmente antes do proximo perigo, mesmo no
    // boost mais forte (~300+ de velocidade):
    //  - MIN_STORM_GAP: distancia minima entre o CENTRO de duas tempestades.
    //  - MIN_STORM_LEADIN: distancia minima entre QUALQUER obstaculo
    //    anterior (incluindo vento/corrente) e uma tempestade â€” evita o
    //    buff nascendo colado nela, sem tempo de desviar depois de pegar.
    //  - MAX_GAPX_SHIFT / MAX_HAZARD_SHIFT: o quanto o "ponto de
    //    referencia" (vao seguro da tempestade, ou posicao do ultimo
    //    perigo) pode se deslocar lateralmente de um obstaculo pro
    //    proximo â€” impede dois perigos seguidos em lados opostos da
    //    pista sem dar tempo de atravessar.
    const MIN_STORM_GAP = 760;
    const MIN_STORM_LEADIN = 430;
    const MAX_GAPX_SHIFT = 320;
    const MAX_HAZARD_SHIFT = 210;

    let traveled = 380;
    let stormsPlaced = 0;
    let lastStormTraveled = -Infinity;
    let lastObstacleTraveled = -Infinity;
    let lastAnchorX = GAME.laneCenterX;
    let lastCenterHazardTraveled = -Infinity;
    let guard = 0;
    const guaranteedStorms = [0.18, 0.38, 0.61, 0.84].map((p) => Math.floor(totalDistance * p));
    guaranteedStorms.forEach((distance, i) => {
      const gapX = Phaser.Math.Clamp(
        GAME.laneCenterX + (i % 2 === 0 ? -1 : 1) * Phaser.Math.Between(130, 260),
        GAME.laneMinX + 190,
        GAME.laneMaxX - 190
      );
      this.spawnStorm(GAME.shipStartY - distance, 250, 285, gapX, true);
    });
    stormsPlaced = guaranteedStorms.length;

    while (traveled < totalDistance - margin && guard < 120) {
      guard++;
      traveled += Phaser.Math.Between(135, 215);
      if (traveled >= totalDistance - margin) break;

      const midCourse = traveled > totalDistance * 0.25 && traveled < totalDistance * 0.85;
      const nearGuaranteedStorm = guaranteedStorms.some((d) => Math.abs(d - traveled) < 720);
      const farEnoughFromLastStorm = (traveled - lastStormTraveled) >= MIN_STORM_GAP;
      const farEnoughFromLastObstacle = (traveled - lastObstacleTraveled) >= MIN_STORM_LEADIN;
      const wantsStorm = !nearGuaranteedStorm && farEnoughFromLastStorm && farEnoughFromLastObstacle &&
        (stormsPlaced < 8 && midCourse && Phaser.Math.Between(0, 100) < 22);

      if (wantsStorm) {
        const minX = Phaser.Math.Clamp(lastAnchorX - MAX_GAPX_SHIFT, GAME.laneMinX + 180, GAME.laneMaxX - 180);
        const maxX = Phaser.Math.Clamp(lastAnchorX + MAX_GAPX_SHIFT, GAME.laneMinX + 180, GAME.laneMaxX - 180);
        const gapX = minX < maxX ? Phaser.Math.Between(minX, maxX) : lastAnchorX;
        this.spawnStorm(GAME.shipStartY - traveled, 235, 280, gapX);
        stormsPlaced++;
        lastStormTraveled = traveled;
        lastObstacleTraveled = traveled;
        lastAnchorX = gapX;
        traveled += 150; // evita empilhar outro obstaculo logo depois
        continue;
      }

      const type = weightedTypes[Phaser.Math.Between(0, weightedTypes.length - 1)];
      const w = { wind: 58, current: 58, wave: 150, fog: 230, rock: 96, whirlpool: 146 }[type];
      const isHazard = type === 'rock' || type === 'whirlpool';

      let x;
      if (isHazard) {
        const minLaneX = GAME.laneMinX + w / 2 + 10;
        const maxLaneX = GAME.laneMaxX - w / 2 - 10;
        const sameSidePressure = traveled - lastObstacleTraveled < 520;
        const canUseCenter = traveled - lastCenterHazardTraveled > 620;
        const wantsCenter = canUseCenter && Phaser.Math.Between(0, 100) < 32;
        if (wantsCenter) {
          x = Phaser.Math.Clamp(
            GAME.laneCenterX + Phaser.Math.Between(-140, 140),
            minLaneX,
            maxLaneX
          );
          lastCenterHazardTraveled = traveled;
        } else if (sameSidePressure) {
          const side = lastAnchorX < GAME.laneCenterX ? 1 : -1;
          const target = GAME.laneCenterX + side * Phaser.Math.Between(190, 390);
          x = Phaser.Math.Clamp(target, minLaneX, maxLaneX);
        } else {
          const minX = Phaser.Math.Clamp(lastAnchorX - MAX_HAZARD_SHIFT, minLaneX, maxLaneX);
          const maxX = Phaser.Math.Clamp(lastAnchorX + MAX_HAZARD_SHIFT, minLaneX, maxLaneX);
          x = minX < maxX ? Phaser.Math.Between(minX, maxX) : lastAnchorX;
        }
        lastAnchorX = x;
      } else {
        x = Phaser.Math.Between(GAME.laneMinX + w / 2 + 10, GAME.laneMaxX - w / 2 - 10);
      }
      this.spawnGate(GAME.shipStartY - traveled, type, x);
      lastObstacleTraveled = traveled;
    }
  }

  // Vento e corrente sao itens PEQUENOS e coletaveis (icones) â€” precisa
  // de pontaria para pegar. Pedra/redemoinho tambem sao pequenos, mas sao
  // riscos fatais (naufragio), nao itens a coletar.
  spawnGate(worldY, type, x) {
    const specs = {
      wind: { key: 'icon-wind', w: 58, h: 58, score: 12 },
      current: { key: 'icon-current', w: 58, h: 58, score: 14 },
      wave: { key: 'giant-wave', w: 150, h: 96, score: 0 },
      fog: { key: 'fog-bank', w: 230, h: 120, score: 0 },
      rock: { key: 'rock', w: 96, h: 92, score: -10 },
      whirlpool: { key: 'whirlpool', w: 146, h: 146, hitW: 92, hitH: 92, score: -10 }
    };
    const spec = specs[type];
    const sprite = this.scene.add.image(x, worldY, spec.key).setDepth(14).setDisplaySize(spec.w, spec.h);
    if (type === 'whirlpool') {
      sprite.setAlpha(0.94);
      this.scene.tweens.add({
        targets: sprite,
        angle: 360,
        duration: 3600,
        repeat: -1,
        ease: 'Linear'
      });
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0.72,
        duration: 820,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
    this.gates.push({ type, sprite, spec, used: false, warned: false, worldY, w: spec.w, h: spec.h });
  }

  // A tempestade agora e desenhada como DUAS massas de nuvem separadas,
  // com um vao visivel de verdade entre elas â€” antes o vao so existia na
  // logica de colisao (invisivel), o que fazia parecer "sem escapatoria".
  spawnStorm(worldY, height, gap, gapX, guaranteed = false) {
    const leftEdge = GAME.laneMinX - 40;
    const rightEdge = GAME.laneMaxX + 40;
    const gapLeft = gapX - gap / 2;
    const gapRight = gapX + gap / 2;
    const leftWidth = Math.max(60, gapLeft - leftEdge);
    const rightWidth = Math.max(60, rightEdge - gapRight);

    const leftSprite = this.scene.add.image(leftEdge + leftWidth / 2, worldY, 'storm-cloud')
      .setDepth(16).setDisplaySize(leftWidth, height);
    const rightSprite = this.scene.add.image(gapRight + rightWidth / 2, worldY, 'storm-cloud')
      .setDepth(16).setDisplaySize(rightWidth, height);

    // Varios raios espalhados pelas duas metades da nuvem (antes era sÃ³
    // um, perto do vÃ£o) â€” pedido: mais raios em cima da nuvem.
    const lightnings = [
      this.scene.add.image(leftEdge + leftWidth * 0.35, worldY - 40, 'lightning').setDepth(17).setAlpha(0),
      this.scene.add.image(gapX - 70, worldY - 30, 'lightning').setDepth(17).setAlpha(0),
      this.scene.add.image(gapRight + rightWidth * 0.4, worldY - 20, 'lightning').setDepth(17).setAlpha(0)
    ];
    const guide = this.scene.add.graphics().setDepth(15).setAlpha(0.18);
    guide.lineStyle(3, 0xdff6f7, 0.75);
    guide.beginPath();
    guide.moveTo(gapX - gap * 0.36, worldY);
    quadraticCurveTo(guide, gapX - gap * 0.36, worldY, gapX, worldY - 18, gapX + gap * 0.36, worldY, 12);
    guide.strokePath();

    this.storms.push({
      sprites: [leftSprite, rightSprite, guide], lightnings, worldY, height, gap, gapX, guaranteed, resolved: false, warned: false, lastThunderAt: -9999
    });
  }

  // Colisao/coleta das faixas de vento, corrente, pedras e redemoinhos â€”
  // cada uma e aplicada uma unica vez (used) quando o navio entra na
  // area. Os perigos devem ser lidos visualmente pelo jogador; as mensagens
  // na tela ficam reservadas para contexto historico/narrativo.
  updateGates(shipBounds, shipY, callbacks) {
    this.gates.forEach((gate) => {
      if (gate.used) {
        const shouldLinger = gate.type === 'fog' || gate.type === 'wave';
        const screenY = gate.sprite.y - this.scene.cameras.main.scrollY;
        const fullyBelowScreen = screenY > GAME.height + gate.h / 2 + 90;
        if (shouldLinger && !gate.cleaned && fullyBelowScreen) {
          gate.cleaned = true;
          this.scene.tweens.add({
            targets: gate.sprite,
            alpha: 0,
            duration: 420,
            onComplete: () => gate.sprite.destroy()
          });
        }
        return;
      }

      const isHazard = gate.type === 'rock' || gate.type === 'whirlpool' || gate.type === 'wave';
      if (!gate.warned && isHazard) {
        const dist = shipY - gate.worldY;
        if (dist > 0 && dist < 420) {
          gate.warned = true;
        }
      }

      const hitW = gate.spec.hitW || gate.w;
      const hitH = gate.spec.hitH || gate.h;
      const rect = new Phaser.Geom.Rectangle(
        gate.sprite.x - hitW / 2, gate.worldY - hitH / 2, hitW, hitH
      );
      if (Phaser.Geom.Intersects.RectangleToRectangle(shipBounds, rect)) {
        gate.used = true;
        callbacks[gate.type](gate.spec.score, gate);
        // Buffs coletaveis somem ao serem pegos. Onda e neblina ficam
        // visiveis ate sairem da tela; senao parecem "apagadas" no meio
        // da travessia logo depois que o navio encosta nelas.
        if (gate.type !== 'fog' && gate.type !== 'wave') {
          this.scene.tweens.add({
            targets: gate.sprite,
            alpha: 0,
            duration: 300,
            onComplete: () => gate.sprite.destroy()
          });
        }
      }
    });
  }

  // Verifica a tempestade: retorna 'hit' se o navio atravessar a faixa
  // fora do corredor seguro, 'active' se estiver dentro da faixa mas a
  // salvo, 'passed' ao ultrapassar com sucesso, ou 'none'.
  updateStorms(ship) {
    let result = 'none';
    this.storms.forEach((storm) => {
      if (storm.resolved) {
        const screenY = storm.worldY - this.scene.cameras.main.scrollY;
        const fullyBelowScreen = screenY > GAME.height + storm.height / 2 + 110;
        if (!storm.cleaned && fullyBelowScreen) {
          storm.cleaned = true;
          storm.sprites.forEach((s) => s.destroy());
          storm.lightnings.forEach((l) => l.destroy());
        }
        return;
      }
      const distToBand = Math.abs(ship.sprite.y - storm.worldY);

      if (distToBand < 420 && !storm.warned) {
        storm.warned = true;
      }

      if (distToBand < 280 && Phaser.Math.Between(0, 1000) < 26) {
        const boltCount = Phaser.Math.Between(0, 100) < 35 ? 2 : 1;
        const pool = Phaser.Utils.Array.Shuffle(storm.lightnings.slice());
        for (let i = 0; i < boltCount && i < pool.length; i++) {
          const bolt = pool[i];
          bolt.setAlpha(1);
          this.scene.tweens.add({ targets: bolt, alpha: 0, duration: 180 + i * 60 });
        }
        this.scene.cameras.main.flash(90, 246, 232, 172, false);
        if (this.scene.time.now - storm.lastThunderAt > 1200) {
          storm.lastThunderAt = this.scene.time.now;
          SFX.thunder();
        }
      }

      // O desenho da nuvem e um "borrao" arredondado, nao um retangulo
      // perfeito â€” sobra bastante espaco transparente perto das bordas da
      // caixa do sprite (principalmente nos cantos). Isso faz o hitbox
      // "logico" (baseado so em gapX/gap) avancar bem alem de onde a
      // nuvem aparece de verdade, matando o jogador em agua
      // aparentemente livre (bug relatado). Por isso o vao seguro (X) e
      // um pouco mais generoso que a largura nominal, e a faixa de
      // perigo (Y) tambem e um pouco menor que a altura do sprite.
      const collisionHalfHeight = (storm.height * 0.54) / 2;
      const gapForgiveness = 34;
      const inBand = ship.sprite.y < storm.worldY + collisionHalfHeight && ship.sprite.y > storm.worldY - collisionHalfHeight;
      if (inBand) {
        result = 'active';
        const inGap = Math.abs(ship.sprite.x - storm.gapX) < storm.gap / 2 + gapForgiveness;
        if (!inGap) result = 'hit';
      } else if (ship.sprite.y <= storm.worldY - collisionHalfHeight && storm.warned) {
        storm.resolved = true;
        result = 'passed';
        // A tempestade ja nao colide mais, mas continua visivel ate sair
        // por baixo da tela. Antes ela era destruida aqui e "sumia" no
        // meio do quadro, o que parecia bug visual.
      }
    });
    return result;
  }
}

// =====================================================================
// GameScene â€” minigame principal: travessia vertical do Atlantico
// =====================================================================
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.cameras.main.fadeIn(420);
    // OBS: nao usar cameras.main.setZoom() aqui â€” a HUD/UI inteira usa
    // scrollFactor(0) para ficar fixa na tela, mas isso NAO da imunidade
    // a zoom (zoom e uma transformacao da camera inteira, afeta tambem
    // scrollFactor 0). Aplicar zoom desalinhava toda a moldura, caixas e
    // botoes. Para "ver mais mundo" sem quebrar a UI, seria necessario
    // uma segunda camera dedicada so pra UI â€” nao vale a complexidade
    // agora. Em vez disso, o navio ficou menor (ver ShipController).

    this.traveled = 0;
    this.score = 0;
    this.elapsed = 0;
    this.baseSpeedMultiplier = 1;
    this.boostMultiplier = 1;
    this.boostTimer = 0;
    this.windFlash = 0;
    this.currentFlash = 0;
    this.fogTimer = 0;
    this.waveFlash = 0;
    this.inStorm = false;
    this.finished = false;
    this.arrived = false;
    this.arrivalTimer = 0;
    this.nextMessage = 0;
    this.stageIndex = 0;
    this.forwardSpeed = 100;
    this.targetScrollY = 0;

    // Mensagens narrativas disparadas por distancia percorrida, ligando
    // a mecanica ao conceito historico da Volta do Mar.
    this.messages = [
      { at: 0, text: 'Março de 1500: apos Cabo Verde, a esquadra se afasta da costa africana.' },
      { at: GAME.distanceTotal * 0.12, text: 'A manobra buscava ventos e correntes melhores no Atlantico aberto.' },
      { at: GAME.distanceTotal * 0.25, text: 'Essa rota larga era conhecida como Volta do Mar.' },
      { at: GAME.distanceTotal * 0.39, text: 'Quanto mais a frota seguia para oeste, menos conhecidos eram os mapas europeus.' },
      { at: GAME.distanceTotal * 0.55, text: 'O oceano era caminho e risco: navegar exigia leitura de vento, corrente e clima.' },
      { at: GAME.distanceTotal * 0.70, text: 'A travessia nao tinha como objetivo declarado encontrar novas terras.' },
      { at: GAME.distanceTotal * 0.84, text: 'Sinais naturais no mar indicavam que a costa podia estar proxima.' },
      { at: GAME.distanceTotal * 0.94, text: 'O desvio para oeste colocou a esquadra diante de uma terra fora dos mapas europeus.' }
    ];

    this.world = new OceanWorld(this);
    this.ship = new ShipController(this);
    this.track = new EventTrack(this);
    this.hud = new LogbookHUD(this);
    this.message = new MessageLayer(this);
    drawComicFrame(this);
    this.cameras.main.scrollY = Phaser.Math.Clamp(
      this.ship.sprite.y - GAME.height * 0.78,
      0,
      Math.max(0, GAME.worldHeight - GAME.height)
    );

    this.buildWeatherBands();
    this.weatherBandIndex = 0;
    this.currentWeather = 'clear';
    this.weatherOverlay = this.add.graphics().setDepth(10).setScrollFactor(0).setAlpha(0);
    this.weatherOverlay.fillStyle(0x0a0f1a, 1);
    this.weatherOverlay.fillRect(0, 0, GAME.width, GAME.height);
    this.fogOverlay = this.add.graphics().setDepth(11).setScrollFactor(0).setAlpha(0);
    this.fogOverlay.fillStyle(0xdde7df, 1);
    this.fogOverlay.fillRect(0, 0, GAME.width, GAME.height);
    this.fogOverlay.lineStyle(2, 0xffffff, 0.22);
    for (let y = 90; y < GAME.height; y += 95) {
      this.fogOverlay.beginPath();
      this.fogOverlay.moveTo(-40, y);
      quadraticCurveTo(this.fogOverlay, -40, y, GAME.width * 0.35, y - 34, GAME.width + 40, y + 12, 24);
      this.fogOverlay.strokePath();
    }
    this.rainDrops = [];
    for (let i = 0; i < 18; i++) {
      const drop = this.add.image(
        Phaser.Math.Between(30, GAME.width - 20),
        Phaser.Math.Between(-80, GAME.height + 60),
        'rain-drop'
      ).setDepth(23).setScrollFactor(0).setAlpha(0).setVisible(false)
        .setScale(Phaser.Math.FloatBetween(0.72, 1.08));
      drop.speed = Phaser.Math.FloatBetween(420, 620);
      drop.drift = Phaser.Math.FloatBetween(60, 105);
      this.rainDrops.push(drop);
    }
    this.shipWindLines = this.add.graphics().setDepth(24).setAlpha(0);

    this.message.show('Conduza o navio pela Volta do Mar rumo ao oeste.', 2600);
    this.addFullscreenButton();
  }

  // Mudanca de clima: divide a travessia em trechos alternados de tempo
  // "claro" e "nublado/tempestuoso" (apenas visual â€” a dificuldade real
  // vem dos obstaculos, nao do clima). Da variedade atmosferica e reforca
  // a sensacao de perigo crescente ao longo da viagem.
  buildWeatherBands() {
    this.weatherBands = [];
    let t = 0;
    const moodCycle = ['clear', 'overcast', 'rain', 'clear', 'overcast'];
    let moodIndex = 0;
    let guard = 0;
    while (t < GAME.distanceTotal && guard < 30) {
      guard++;
      const len = Phaser.Math.Between(1100, 1900);
      this.weatherBands.push({ start: t, end: t + len, mood: moodCycle[moodIndex % moodCycle.length] });
      t += len;
      moodIndex++;
    }
  }

  updateWeather() {
    // this.traveled nunca diminui, entao a faixa atual so pode avancar â€”
    // nao precisamos re-escanear do zero a cada frame, so seguir em frente
    // a partir de onde paramos na ultima chamada.
    while (
      this.weatherBandIndex < this.weatherBands.length - 1 &&
      this.traveled >= this.weatherBands[this.weatherBandIndex].end
    ) {
      this.weatherBandIndex++;
    }
    const band = this.weatherBands[this.weatherBandIndex];
    const mood = band ? band.mood : 'clear';
    if (mood !== this.currentWeather) {
      this.currentWeather = mood;
      const isRain = mood === 'rain';
      if (isRain) this.rainDrops.forEach((drop) => drop.setVisible(true));
      this.tweens.add({
        targets: this.weatherOverlay,
        alpha: isRain ? 0.06 : mood === 'overcast' ? 0.22 : 0,
        duration: 900
      });
      this.tweens.add({
        targets: this.rainDrops,
        alpha: isRain ? 0.46 : 0,
        duration: 700,
        onComplete: () => {
          if (this.currentWeather !== 'rain') this.rainDrops.forEach((drop) => drop.setVisible(false));
        }
      });
    }
  }

  updateRain(delta) {
    if (!this.rainDrops || this.currentWeather !== 'rain') return;
    if ((this.frameCounter || 0) % 3 !== 0) return;
    const dt = (delta / 1000) * 3;
    this.rainDrops.forEach((drop) => {
      if (!drop.visible) return;
      drop.y += drop.speed * dt;
      drop.x -= drop.drift * dt;
      if (drop.y > GAME.height + 70 || drop.x < -40) {
        drop.y = Phaser.Math.Between(-120, -20);
        drop.x = Phaser.Math.Between(80, GAME.width + 60);
      }
    });
  }

  updateSpeedLines(delta) {
    const active = (this.windFlash > 0 || this.currentFlash > 0 || this.boostMultiplier > 1.08) && !this.arrived;
    this.shipWindLines.clear();
    if (!active) {
      this.shipWindLines.setAlpha(0);
      return;
    }

    const ship = this.ship.sprite;
    const g = this.shipWindLines;
    const pulse = 0.36 + Math.sin(this.time.now / 115) * 0.08;
    const color = this.currentFlash > 0 ? 0xa9efe5 : 0xf5fbff;
    const sway = Math.sin(this.time.now / 140) * 4;
    const fade = Phaser.Math.Clamp((this.boostMultiplier - 1) / (BOOST.strength - 1), 0.28, 1);
    const alpha = pulse * fade;

    g.setAlpha(alpha);
    g.lineStyle(3, color, 0.72);
    [
      [-32, 14, -78, 34, -54, 10],
      [32, 14, 78, 34, 54, 10],
      [-24, 46, -66, 68, -48, 42],
      [24, 46, 66, 68, 48, 42]
    ].forEach(([x0, y0, x1, y1, cx, cy], i) => {
      const sideSway = i % 2 === 0 ? -sway : sway;
      g.beginPath();
      g.moveTo(ship.x + x0, ship.y + y0);
      quadraticCurveTo(g, ship.x + x0, ship.y + y0, ship.x + cx + sideSway, ship.y + cy, ship.x + x1, ship.y + y1, 12);
      g.strokePath();
    });

    g.lineStyle(2, 0xffffff, 0.45);
    for (let i = 0; i < 3; i++) {
      const x = ship.x + Phaser.Math.Linear(-18, 18, i / 2);
      const y = ship.y + 58 + ((this.time.now / 55 + i * 12) % 18);
      g.beginPath();
      g.moveTo(x, y);
      quadraticCurveTo(g, x, y, x + (i - 1) * 12, y + 8, x + (i - 1) * 22, y + 16, 8);
      g.strokePath();
    }
  }

  addFullscreenButton() {
    const routeLeft = GAME.width - 76;
    const gap = 12;
    const width = 128;
    const height = 42;
    const x = routeLeft - gap - width;
    const y = 20;

    const btn = makeButton(this, x, y, width, height, 'TELA CHEIA', () => {
      try {
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
      } catch (err) {
        // Fullscreen e opcional; se o navegador bloquear, o jogo continua.
      }
    }, 100);
    btn.txt.setFontSize('13px');
  }

  // As funcoes abaixo traduzem em regras de jogo o conceito central do
  // capitulo: a Volta do Mar era vantajosa porque trocava a costa
  // africana por ventos e correntes oceanicas mais fortes. Vento e corrente concedem o MESMO
  // boost compartilhado (2x por alguns segundos) ao serem capturados; a
  // velocidade "de base" cresce sozinha e aos poucos ao longo de toda a
  // travessia. Pedra, redemoinho e tempestade sao os riscos fatais â€” o
  // jogo tem apenas um navio, entao um erro grave gera naufragio.
  //
  // Chamada uma vez por frame a partir de update(). Calcula, nessa ordem:
  // 1) a velocidade-base (cresce com o progresso, nunca cai);
  // 2) o boost (fica no pico enquanto o timer > 0; ao expirar, esvai
  //    suavemente â€” nunca cai de uma vez);
  // 3) a velocidade REAL do navio, que persegue esse alvo aos poucos
  //    (inercia/peso), em vez de mudar instantaneamente.
  updateSpeed(delta) {
    const dt = delta / 16.67;

    const progress = Phaser.Math.Clamp(this.traveled / GAME.distanceTotal, 0, 1);
    this.baseSpeedMultiplier = Phaser.Math.Linear(1, BASE_SPEED.growthEnd, progress);

    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - delta);
    } else if (this.boostMultiplier > 1) {
      this.boostMultiplier = Phaser.Math.Linear(this.boostMultiplier, 1, BOOST.decayEase * dt);
      if (this.boostMultiplier < 1.01) this.boostMultiplier = 1;
    }

    const targetSpeed = BASE_SPEED.start * this.baseSpeedMultiplier * this.boostMultiplier;
    this.forwardSpeed = Phaser.Math.Linear(this.forwardSpeed, targetSpeed, SHIP_SPEED_EASE * dt);
  }

  // Pulso rapido de escala no navio (feedback tatil ao pegar o booster).
  // A velocidade em si fica visivel de forma permanente na HUD, nao em
  // texto flutuante/aviso passageiro.
  pulseShip() {
    this.tweens.add({
      targets: this.ship.sprite, scale: this.ship.sprite.scale * 1.18,
      duration: 140, yoyo: true, ease: 'Sine.easeOut'
    });
  }

  applyWind(score) {
    this.boostMultiplier = BOOST.strength;
    this.boostTimer = BOOST.durationMs;
    this.windFlash = BOOST.durationMs;
    this.score += score;
    SFX.collect();
    this.pulseShip();
  }

  applyCurrent(score) {
    this.boostMultiplier = BOOST.strength;
    this.boostTimer = BOOST.durationMs;
    this.currentFlash = BOOST.durationMs;
    this.score += score;
    SFX.collect();
    this.pulseShip();
  }

  applyWave(gate) {
    this.waveFlash = 900;
    SFX.wave();
    this.ship.pushFromWave(gate.sprite.x);
    this.cameras.main.shake(140, 0.004);
  }

  applyFog() {
    this.fogTimer = 3600;
    SFX.fog();
    this.message.show('No Atlantico aberto, neblina e clima instavel tornavam a navegacao incerta.', 2200);
  }

  update(time, delta) {
    if (this.finished) return;
    this.elapsed += delta;
    this.frameCounter = (this.frameCounter || 0) + 1;

    const shipBounds = this.ship.bounds();

    if (!this.arrived) {
      this.track.updateGates(shipBounds, this.ship.sprite.y, {
        wind: (s) => this.applyWind(s),
        current: (s) => this.applyCurrent(s),
        wave: (_s, gate) => this.applyWave(gate),
        fog: () => this.applyFog(),
        rock: () => this.fail('O navio bateu nas pedras e naufragou.'),
        whirlpool: () => this.fail('O navio foi tragado por um redemoinho e naufragou.')
      });
      if (this.finished) return;

      const stormState = this.track.updateStorms(this.ship);
      if (stormState === 'hit') { this.fail('O navio foi atingido pela tempestade e naufragou.'); return; }
      if (stormState === 'passed') {
        this.score += 40;
        SFX.success();
      }
      this.inStorm = stormState === 'active';
    }

    // A velocidade (base + boost, com inercia do navio incluida) e
    // calculada de uma vez em updateSpeed â€” ver o comentario ali pra
    // detalhes de como base/boost/inercia se combinam.
    this.updateSpeed(delta);
    this.windFlash = Math.max(0, this.windFlash - delta);
    this.currentFlash = Math.max(0, this.currentFlash - delta);
    this.fogTimer = Math.max(0, this.fogTimer - delta);
    this.waveFlash = Math.max(0, this.waveFlash - delta);
    this.fogOverlay.setAlpha(this.fogTimer > 0 ? 0.34 : 0);
    this.updateSpeedLines(delta);

    const modifiers = { control: 1.0 };

    // Uma vez que a distancia total foi alcancada, o navio para de
    // avancar (fica em aguas seguras proximo a costa) ate que a duracao
    // minima da travessia seja cumprida â€” garante >= 1 minuto de jogo
    // independente de quao rapido o jogador tenha navegado.
    this.ship.update(delta, this.arrived ? 0 : this.forwardSpeed, modifiers);
    this.traveled = Math.max(this.traveled, GAME.shipStartY - this.ship.sprite.y);
    this.updateWeather();
    this.updateRain(delta);

    this.score += (this.forwardSpeed > 100 ? 0.03 : 0.008) * (delta / 16.67);

    if (this.messages[this.nextMessage] && this.traveled >= this.messages[this.nextMessage].at) {
      this.message.show(this.messages[this.nextMessage].text, 2600);
      this.nextMessage++;
    }

    // Anuncia a troca de trecho da rota (Cabo Verde, Volta do Mar, etc)
    // como uma mensagem passageira, ja que nao ha mais uma barra fixa
    // mostrando "Local:" o tempo todo.
    const p = Phaser.Math.Clamp(this.traveled / GAME.distanceTotal, 0, 1);
    const stage = ROUTE_STAGES.reduce((last, cur, i) => (p >= cur.at ? i : last), 0);
    if (stage !== this.stageIndex) {
      this.stageIndex = stage;
      this.message.show(`Trecho da rota: ${ROUTE_STAGES[stage].local}`, 1800);
    }

    if (!this.arrived && this.traveled >= GAME.distanceTotal * GAME.arrivalCutsceneProgress) {
      this.arrived = true;
      this.traveled = GAME.distanceTotal;
      this.world.revealCoast();
      SFX.arrival();
      this.message.show('Terra a vista! A costa surge antes que a frota avance mais.', 2400);
    }

    // A camera segue o navio verticalmente, mantendo-o na parte inferior
    // da tela para revelar o que vem pela frente (efeito "rail" de HQ).
    //
    // Correcao da "barreira invisivel": se deixassemos a camera rolar ate
    // scrollY=0 (limite do topo do mundo), ela parava de acompanhar o
    // navio bem antes dele chegar perto do topo da TELA. A versao antiga
    // "congelava" a camera de proposito pouco antes da chegada e deixava
    // o navio subir sozinho â€” mas com o navio mais rapido agora, isso
    // fazia ele sumir da tela por varios segundos. Em vez de congelar,
    // vamos reenquadrando o navio mais pro topo da tela aos poucos
    // conforme ele se aproxima do fim â€” ele nunca desaparece de vista.
    const approachDistance = 480;
    const distToFinish = Math.max(0, this.ship.sprite.y - GAME.finishY);
    const approachT = 1 - Phaser.Math.Clamp(distToFinish / approachDistance, 0, 1); // 0 longe, 1 na chegada
    const followFraction = Phaser.Math.Linear(0.78, 0.24, approachT);

    const desiredScrollY = this.ship.sprite.y - GAME.height * followFraction;
    const maxScrollY = Math.max(0, GAME.worldHeight - GAME.height);
    this.targetScrollY = Phaser.Math.Clamp(desiredScrollY, 0, maxScrollY);
    this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, this.targetScrollY, 0.09);


    const travelProgress = Phaser.Math.Clamp(this.traveled / GAME.distanceTotal, 0, 1);
    this.world.update(delta, this.arrived ? 0 : this.forwardSpeed, travelProgress);
    this.hud.update(this.stateForHUD());

    if (this.arrived) {
      this.arrivalTimer += delta;
      if (this.arrivalTimer >= GAME.arrivalHoldMs) this.win();
    }
  }

  stateForHUD() {
    const p = Phaser.Math.Clamp(this.traveled / GAME.distanceTotal, 0, 1);
    return {
      progress: p,
      score: this.score,
      distanceKm: p * GAME.displayedKm,
      speedMultiplier: this.baseSpeedMultiplier * this.boostMultiplier,
      windActive: this.windFlash > 0,
      currentActive: this.currentFlash > 0,
      fogActive: this.fogTimer > 0,
      waveActive: this.waveFlash > 0,
      inStorm: this.inStorm
    };
  }

  fail(reason) {
    if (this.finished) return;
    this.finished = true;
    SFX.danger();
    this.cameras.main.shake(220, 0.01);
    this.cameras.main.fadeOut(500);
    this.time.delayedCall(520, () => {
      this.scene.start('FailureScene', { reason, score: Math.round(this.score) });
    });
  }

  win() {
    if (this.finished) return;
    this.finished = true;
    this.cameras.main.fadeOut(600);
    this.time.delayedCall(620, () => {
      this.scene.start('ArrivalScene', {
        score: Math.round(this.score),
        time: Math.round(this.elapsed / 1000),
        distanceKm: GAME.displayedKm
      });
    });
  }
}

// =====================================================================
// FailureScene â€” tela de naufragio
// =====================================================================
class FailureScene extends Phaser.Scene {
  constructor() { super('FailureScene'); }

  init(data) {
    this.reason = (data && data.reason) || 'O navio nao resistiu a travessia.';
    this.finalScore = (data && data.score) || 0;
  }

  create() {
    new AmbientBackdrop(this, 0.55);
    drawComicFrame(this);
    drawPaper(this, 260, 108, 760, 420, 20);

    makeText(this, 300, 146, 'NAUFRAGIO!', { font: FONT_TITLE, size: '32px', style: 'bold', color: '#5a1f16', depth: 22 });
    makeText(this, 300, 206, this.reason, { size: '20px', color: '#241a10', wrap: 660, lineSpacing: 8, depth: 22 });
    makeText(this, 300, 288,
      'A Volta do Mar exigia calculo: afastar-se demais da costa, sem cuidado ' +
      'com ventos, correntes e tempestades, colocava toda a expedicao em risco.',
      { size: '18px', color: '#4a3d2c', wrap: 660, lineSpacing: 8, depth: 22 }
    );
    makeText(this, 300, 348, `Pontuacao ate o naufragio: ${this.finalScore}`, {
      font: FONT_TITLE, size: '17px', style: 'bold', color: '#5f4420', depth: 22
    });

    makeButton(this, 300, 400, 340, 56, 'TENTAR NOVAMENTE', () => this.scene.start('GameScene'));
    // "Pular para a historia": permite ao aluno continuar o capitulo mesmo
    // apos o naufragio, sem ficar bloqueado pelo minigame. Neste arquivo
    // (capitulo standalone) o destino e o Menu; quando integrado ao
    // sistema maior de capitulos, trocar por scene.start do proximo
    // quadro/capitulo da HQ.
    makeButton(this, 300, 468, 340, 50, 'PULAR PARA A HISTORIA', () => this.scene.start('MenuScene'));
  }
}

// =====================================================================
// ArrivalScene - cutscene de chegada lateral na costa
// =====================================================================
class ArrivalScene extends Phaser.Scene {
  constructor() { super('ArrivalScene'); }

  init(data) {
    this.finalScore = (data && data.score) || 0;
    this.finalTime = (data && data.time) || 0;
    this.distanceKm = (data && data.distanceKm) || GAME.displayedKm;
  }

  create() {
    this.cameras.main.fadeIn(450);

    const sea = this.add.graphics().setDepth(0);
    sea.fillStyle(0x0a2c3b, 1);
    sea.fillRect(0, 0, GAME.width, GAME.height);
    sea.fillStyle(0x164f57, 0.58);
    sea.fillRect(0, 430, GAME.width, 290);

    this.swell = this.add.tileSprite(GAME.width / 2, 500, GAME.width, 440, 'water-swell')
      .setDepth(1).setAlpha(0.32);
    this.reflect = this.add.tileSprite(GAME.width / 2, 500, GAME.width, 420, 'water-reflect')
      .setDepth(2).setAlpha(0.24);
    this.foam = this.add.tileSprite(GAME.width / 2, 500, GAME.width, 420, 'foam-tile')
      .setDepth(3).setAlpha(0.20);

    const coast = this.add.image(GAME.width / 2, 118, 'coastline')
      .setDepth(4).setDisplaySize(GAME.width + 80, 320);

    for (let i = 0; i < 5; i++) {
      const sign = this.add.image(150 + i * 245, 510 + (i % 2) * 48, 'land-sign')
        .setDepth(6).setScale(0.62).setAlpha(0.68).setAngle(-14 + i * 8);
      this.tweens.add({ targets: sign, x: sign.x - 22, duration: 2200 + i * 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    const ship = this.add.image(-160, 470, 'caravela-side')
      .setDepth(9).setScale(0.88).setAlpha(0.98);
    this.tweens.add({
      targets: ship,
      x: GAME.width * 0.58,
      y: 396,
      duration: 4300,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: ship,
      angle: 2,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    drawComicFrame(this, 30);
    drawPaper(this, 170, 486, 940, 112, 35, 0.94);
    makeText(this, 210, 512, '22 DE ABRIL DE 1500', {
      font: FONT_TITLE, size: '18px', style: 'bold', color: '#5f4420', depth: 36
    });
    makeText(this, 210, 542,
      'Depois da Volta do Mar, sinais de terra aparecem. A esquadra se aproxima da costa desconhecida.',
      { size: '19px', color: '#241a10', wrap: 820, depth: 36 }
    );

    this.time.delayedCall(5200, () => {
      this.cameras.main.fadeOut(520);
      this.time.delayedCall(540, () => this.scene.start('VictoryScene', {
        score: this.finalScore,
        time: this.finalTime,
        distanceKm: this.distanceKm
      }));
    });
  }

  update(_time, delta) {
    const dt = delta / 1000;
    this.swell.tilePositionY -= 34 * dt;
    this.swell.tilePositionX += 16 * dt;
    this.reflect.tilePositionY -= 58 * dt;
    this.reflect.tilePositionX += Math.sin(this.time.now / 500) * 0.5;
    this.foam.tilePositionY -= 92 * dt;
    this.foam.tilePositionX -= 18 * dt;
  }
}

// =====================================================================
// VictoryScene â€” "Terra a vista!"
// =====================================================================
class VictoryScene extends Phaser.Scene {
  constructor() { super('VictoryScene'); }

  init(data) {
    this.finalScore = (data && data.score) || 0;
    this.finalTime = (data && data.time) || 0;
    this.distanceKm = (data && data.distanceKm) || GAME.displayedKm;
  }

  create() {
    new AmbientBackdrop(this, 0.9);
    drawComicFrame(this);
    const coast = this.add.image(GAME.width / 2, 176, 'coastline')
      .setDepth(4).setDisplaySize(GAME.width + 70, 350).setAlpha(0);
    this.tweens.add({ targets: coast, alpha: 1, duration: 900 });

    const ship = this.add.image(GAME.width / 2, 480, 'caravela-side')
      .setDepth(10).setScale(0.72).setAngle(-2);
    this.tweens.add({ targets: ship, y: 452, angle: 2, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    for (let i = 0; i < 4; i++) {
      const sign = this.add.image(210 + i * 260, 508 + (i % 2) * 22, 'land-sign')
        .setDepth(8).setScale(0.62).setAlpha(0.72).setAngle(-10 + i * 7);
      this.tweens.add({ targets: sign, x: sign.x - 26, duration: 2200 + i * 280, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    }

    drawPaper(this, 170, 300, 940, 316, 20, 0.94);
    makeText(this, 640, 344, 'TERRA A VISTA!', {
      font: FONT_TITLE, size: '34px', style: 'bold', color: '#1f4a2b', align: 'center', depth: 22
    }).setOrigin(0.5);
    makeText(this, 220, 390,
      '22 de abril de 1500. Depois de cerca de 7.000 km de viagem, a Volta do Mar ' +
      'levou a esquadra para oeste do Atlantico. A manobra afastou os navios da costa ' +
      'africana e acabou aproximando Cabral de uma terra que nao aparecia nos mapas europeus.',
      { size: '18px', color: '#241a10', wrap: 840, lineSpacing: 7, depth: 22 }
    );

    makeText(this, 220, 500,
      'Resumo: voce aproveitou ventos e correntes favoraveis, desviou de riscos do Atlantico e completou o desvio para oeste.',
      { size: '17px', color: '#4a3d2c', wrap: 840, lineSpacing: 5, depth: 22 }
    );

    makeText(this, 220, 548, `Distancia didatica: ${this.distanceKm.toLocaleString('pt-BR')} km  -  Tempo: ${this.finalTime}s  -  Pontuacao: ${this.finalScore}`, {
      font: FONT_TITLE, size: '17px', style: 'bold', color: '#5f4420', depth: 22
    });

    makeButton(this, 320, 642, 280, 46, 'PROXIMO CAPITULO', () => this.scene.start('MenuScene'));
    makeButton(this, 680, 642, 250, 46, 'JOGAR NOVAMENTE', () => this.scene.start('GameScene'));
  }
}

// =====================================================================
// CreditsScene â€” creditos do projeto
// =====================================================================
class CreditsScene extends Phaser.Scene {
  constructor() { super('CreditsScene'); }

  create() {
    new AmbientBackdrop(this, 0.6);
    drawComicFrame(this);
    drawPaper(this, 320, 120, 640, 440, 20);

    makeText(this, 356, 152, 'CREDITOS', { font: FONT_TITLE, size: '28px', style: 'bold', color: '#241a10', depth: 22 });
    makeText(this, 356, 210,
      'Serious Game - Descobrimento do Brasil\n' +
      'Instituto Federal do Para (IFPA)\n\n' +
      'Capitulo 2: A Travessia do Atlantico e o Desvio\n' +
      '(Marco e Abril de 1500)\n\n' +
      'Tecnologias: HTML5, CSS3, JavaScript, Phaser 3\n' +
      'Estilo visual: Historical Comic Art',
      { size: '18px', color: '#2f2418', wrap: 560, lineSpacing: 10, depth: 22 }
    );

    makeButton(this, 356, 480, 240, 54, 'VOLTAR AO MENU', () => this.scene.start('MenuScene'));
  }
}

// =====================================================================
// Configuracao e inicializacao do Phaser
// =====================================================================
function getRenderResolution() {
  const dpr = window.devicePixelRatio || 1;
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.innerWidth || GAME.width, window.innerHeight || GAME.height) < 720;
  const cap = (isTouch || smallScreen) ? 1.25 : 1.5;
  return Math.min(Math.max(dpr, 1), cap);
}

function startGame() {
  try {
    const config = {
      type: Phaser.CANVAS,
      width: GAME.width,
      height: GAME.height,
      resolution: getRenderResolution(),
      parent: 'game-container',
      backgroundColor: '#060f18',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        fullscreenTarget: 'game-container'
      },
      fps: { target: 60, min: 24, panicMax: 120 },
      render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
      scene: [BootScene, MenuScene, GameScene, ArrivalScene, FailureScene, VictoryScene, CreditsScene]
    };
    new Phaser.Game(config);
  } catch (err) {
    showFriendlyError(err && err.message ? err.message : String(err));
  }
}

startGame();


