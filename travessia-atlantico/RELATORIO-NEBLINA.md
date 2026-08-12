# Relatório — debuff de neblina

## Ajustes realizados

- Duração aumentada de 3,6 para 4,4 segundos.
- Opacidade anterior de `0.34` substituída por uma variação suave entre `0.40` e `0.50`.
- Faixas claras de névoa ficaram mais numerosas e um pouco mais espessas.
- O som de vento frio acompanha a nova duração do efeito.

O efeito dificulta mais a visualização, mas mantém o navio, o HUD e os perigos reconhecíveis.

## Preservação

Nenhum obstáculo, colisão, controle, música, efeito sonoro ou asset existente foi removido. Somente `js/game.js` foi alterado.

## Validação

- `node --check js/game.js`: aprovado.
- Verificação visual no navegador: aprovada.

