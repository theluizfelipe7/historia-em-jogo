# Redemoinho do Firefly reparado

O MP4 recebido tinha 8 segundos, resolução 1280×720 e o redemoinho ampliado além dos limites do vídeo. Partes do círculo estavam cortadas nas quatro bordas.

## Correção aplicada

- Foram extraídos 25 quadros dos primeiros 2,5 segundos do vídeo.
- O movimento do centro do redemoinho foi preservado.
- A borda cortada foi substituída pela borda completa da versão anterior.
- A união recebeu uma transição circular suave, sem linhas retas visíveis.
- Os últimos quadros foram suavizados em direção ao primeiro para reduzir o salto do loop.
- A transparência, o tamanho de 230×230 px e a grade 5×5 de 1150×1150 px foram preservados.

Arquivos alterados:

- `assets/img/redemoinho-frame.png`
- `assets/img/redemoinho-spritesheet.png`

Nenhum código, som, obstáculo, controle, menu, HUD ou configuração de frequência foi alterado. A versão completa anterior do redemoinho está preservada em `.backup-pre-firefly-repair/`.
