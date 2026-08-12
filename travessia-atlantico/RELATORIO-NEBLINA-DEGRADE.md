# Relatório — neblina com degradê e visibilidade por proximidade

## Novo comportamento

- Duração total: 6,2 segundos.
- Entrada suave: 0,45 segundo.
- Saída em degradê: últimos 2,2 segundos do efeito.
- Opacidade máxima: `0.54`.
- Velocidade limitada gradualmente a aproximadamente 68% durante o pico da neblina.
- A velocidade normal retorna junto com o degradê de saída.

## Obstáculos durante a neblina

Pedras, redemoinhos, ondas e tempestades ficam quase invisíveis quando estão distantes.

- Começam a aparecer a aproximadamente 320 px do navio.
- Ficam totalmente visíveis somente perto de 135 px.
- Conforme a neblina desaparece, a visibilidade normal dos obstáculos retorna gradualmente.

Vento, corrente, HUD, navio e controles continuam visíveis. Nenhuma colisão ou posição de obstáculo foi alterada.

## Preservação

Nenhum arquivo ou efeito sonoro antigo foi removido. Músicas, aves, mar, redemoinhos, ondas, controles e tela cheia permanecem preservados.

## Validação

- `node --check js/game.js`: aprovado.
- Backup anterior ao ajuste: `js/game.js.before-fog-gradient-backup`.

