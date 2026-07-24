import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_JS_PATH = path.join(__dirname, '..', 'game.js');

/**
 * Carrega o game.js REAL do projeto (sem modificá-lo em disco) dentro de uma
 * sandbox com stubs mínimos de `window`, `document` e `Phaser`, e devolve as
 * classes/constantes internas para os testes chamarem diretamente.
 *
 * Por que isso é necessário:
 * game.js é um script de navegador comum (sem `export`), pensado para ser
 * carregado via <script> na página — não dá para fazer `import` dele direto
 * num teste Node. Além disso, ao ser carregado ele já dispara
 * `window.addEventListener(...)` e, no final do arquivo, chama `startGame()`
 * (que tenta criar um `new Phaser.Game(...)`). Os stubs abaixo neutralizam
 * esses efeitos colaterais sem precisar tocar no arquivo original; o próprio
 * game.js já envolve a criação do jogo num try/catch, então o erro que o
 * stub de `Phaser.Game` lança de propósito é engolido normalmente.
 */
export function loadGameInternals() {
  const source = readFileSync(GAME_JS_PATH, 'utf-8');

  const fakeWindow = { addEventListener: () => {} };
  const fakeDocument = { fonts: undefined, getElementById: () => null };

  class FakeScene {}
  const FakePhaser = {
    Scene: FakeScene,
    AUTO: 'AUTO',
    Scale: { FIT: 'FIT', CENTER_BOTH: 'CENTER_BOTH' },
    Math: {
      Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
      Between: (min) => min,
      Linear: (a, b, t) => a + (b - a) * t,
    },
    Geom: {
      Rectangle: function Rectangle(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
      },
      Intersects: {
        RectangleToRectangle: (a, b) =>
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y,
      },
    },
    // startGame() tenta criar isto ao carregar o arquivo. Deixamos falhar de
    // propósito — o próprio game.js já captura esse erro num try/catch.
    Game: class {
      constructor() {
        throw new Error('Phaser.Game indisponível no ambiente de teste (esperado).');
      }
    },
  };

  // Reexecuta o código-fonte real dentro de uma função isolada, "vazando"
  // apenas as classes/constantes que os testes precisam através do return
  // final. Nada é salvo em disco — o game.js original não é alterado.
  const wrapped = `(function (window, document, Phaser) {\n${source}\nreturn { GameScene, EventTrack, SPEED_LEVELS };\n})`;
  const factory = new Function('return ' + wrapped)();
  return factory(fakeWindow, fakeDocument, FakePhaser);
}
