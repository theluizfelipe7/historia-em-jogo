# Ajuste da onda do Firefly

- O MP4 recebido tinha 8 segundos, resolução 1280×720 e uma transição inicial com fundo verde.
- Foi aproveitado somente o trecho estável com fundo rosa.
- O fundo foi removido e convertido em transparência.
- A animação foi organizada em 25 quadros de 280×280 px.
- A spritesheet final possui 1400×1400 px, em grade 5×5.
- Os quadros foram organizados em movimento de ida e volta para evitar salto no loop.
- A velocidade da onda foi ajustada para 10 quadros por segundo, completando o ciclo em aproximadamente 2,5 segundos.

Arquivos alterados:

- `assets/img/onda-frame.png`
- `assets/img/onda-spritesheet.png`
- `js/game.js`: somente a velocidade da animação da onda, de 5 para 10 quadros por segundo.

Os arquivos anteriores da onda e o `game.js` original estão preservados em `.backup-original-wave/` para comparação. Nenhum outro som, asset, obstáculo, controle, HUD, menu ou mecânica foi alterado ou removido.
