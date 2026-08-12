/**
 * História em Jogo — JavaScript puro
 *
 * Este arquivo cuida somente de:
 * 1. alternar entre a tela inicial, a trilha e os capítulos;
 * 2. salvar o progresso no navegador;
 * 3. desbloquear o Capítulo 2 depois da conclusão do Capítulo 1.
 *
 * Os textos e a estrutura visual estão no index.html.
 */

(function () {
  "use strict";

  const CHAVE_DO_PROGRESSO = "historia-em-jogo:progresso:v1";
  const ID_DA_HISTORIA = "historia-do-brasil";

  const ROTAS = {
    inicio: "inicio",
    historia: "historia-do-brasil",
    "capitulo-partida-de-portugal": "capitulo-partida-de-portugal",
    "capitulo-travessia-atlantico": "capitulo-travessia-atlantico",
  };

  function lerProgresso() {
    try {
      const salvo = window.localStorage.getItem(CHAVE_DO_PROGRESSO);
      return salvo ? JSON.parse(salvo) : {};
    } catch (_erro) {
      return {};
    }
  }

  function salvarProgresso(progresso) {
    try {
      window.localStorage.setItem(
        CHAVE_DO_PROGRESSO,
        JSON.stringify(progresso),
      );
    } catch (_erro) {
      // Se o armazenamento estiver bloqueado, a página continua funcionando.
    }
  }

  function capituloConcluido(capituloId) {
    const progresso = lerProgresso();
    const capitulo = progresso[ID_DA_HISTORIA]?.[capituloId];
    return Boolean(capitulo?.hq || capitulo?.minigame);
  }

  function concluirCapitulo(capituloId) {
    const progresso = lerProgresso();
    const progressoDaHistoria = { ...(progresso[ID_DA_HISTORIA] || {}) };

    progressoDaHistoria[capituloId] = {
      ...(progressoDaHistoria[capituloId] || {}),
      hq: true,
    };

    salvarProgresso({
      ...progresso,
      [ID_DA_HISTORIA]: progressoDaHistoria,
    });

    atualizarInterface();
  }

  function reiniciarProgresso() {
    const progresso = lerProgresso();
    delete progresso[ID_DA_HISTORIA];
    salvarProgresso(progresso);
    atualizarInterface();
  }

  function contarCapitulosConcluidos() {
    return [
      "partida-de-portugal",
      "travessia-atlantico",
      "chegada-a-terra",
    ].filter(capituloConcluido).length;
  }

  function mostrarTela(nomeDaTela) {
    document.querySelectorAll("[data-view]").forEach(function (tela) {
      tela.hidden = tela.dataset.view !== nomeDaTela;
    });

    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function rotaAtual() {
    const hash = window.location.hash.replace(/^#/, "");

    if (hash === "historia-do-brasil") return "historia";
    if (hash === "capitulo-partida-de-portugal")
      return "capitulo-partida-de-portugal";
    if (hash === "capitulo-travessia-atlantico")
      return "capitulo-travessia-atlantico";
    return "inicio";
  }

  function abrirRota(nomeDaRota) {
    if (
      nomeDaRota === "capitulo-travessia-atlantico" &&
      !capituloConcluido("partida-de-portugal")
    ) {
      nomeDaRota = "historia";
    }

    const novoHash = ROTAS[nomeDaRota] || ROTAS.inicio;

    if (window.location.hash === `#${novoHash}`) {
      mostrarTela(nomeDaRota);
      return;
    }

    window.location.hash = novoHash;
  }

  function atualizarInterface() {
    const primeiroConcluido = capituloConcluido("partida-de-portugal");
    const segundoConcluido = capituloConcluido("travessia-atlantico");
    const totalConcluido = contarCapitulosConcluidos();
    const percentual = Math.round((totalConcluido / 3) * 100);

    document
      .querySelectorAll("[data-home-completed]")
      .forEach(function (elemento) {
        elemento.textContent = String(totalConcluido);
      });

    document
      .querySelectorAll("[data-history-completed]")
      .forEach(function (elemento) {
        elemento.textContent = String(totalConcluido);
      });

    document
      .querySelectorAll("[data-progress-percent]")
      .forEach(function (elemento) {
        elemento.textContent = `${percentual}%`;
      });

    document.querySelectorAll("[data-progress-bar]").forEach(function (barra) {
      barra.style.width = `${percentual}%`;
    });

    const proximoCapitulo = document.querySelector("[data-next-chapter]");
    if (proximoCapitulo) {
      if (!primeiroConcluido) {
        proximoCapitulo.innerHTML =
          'próximo: <span class="text-gold-soft">Capítulo 1 — A Partida de Portugal</span>';
      } else if (!segundoConcluido) {
        proximoCapitulo.innerHTML =
          'próximo: <span class="text-gold-soft">Capítulo 2 — A Travessia do Atlântico e o Desvio</span>';
      } else {
        proximoCapitulo.innerHTML =
          '<span class="inline-block border-2 border-ink bg-gold px-2 py-[2px] font-display text-sm leading-none tracking-wider text-ink uppercase shadow-[2px_2px_0_rgba(18,20,26,.8)]">Trilha concluída até aqui</span>';
      }
    }

    // Liberação visual do Capítulo 2.
    const cardDoCapituloDois = document.querySelector(
      "[data-chapter-two-card]",
    );
    const imagemDoCapituloDois = document.querySelector(
      "[data-chapter-two-image]",
    );
    const cadeadoDoCapituloDois = document.querySelector(
      "[data-chapter-two-lock]",
    );
    const mensagemBloqueada = document.querySelector(
      "[data-chapter-two-locked]",
    );
    const acoesDoCapituloDois = document.querySelector(
      "[data-chapter-two-actions]",
    );

    cardDoCapituloDois?.classList.toggle("opacity-80", !primeiroConcluido);
    cardDoCapituloDois?.classList.toggle("saturate-[.55]", !primeiroConcluido);
    imagemDoCapituloDois?.classList.toggle("opacity-60", !primeiroConcluido);
    imagemDoCapituloDois?.classList.toggle(
      "grayscale-[65%]",
      !primeiroConcluido,
    );

    if (cadeadoDoCapituloDois) cadeadoDoCapituloDois.hidden = primeiroConcluido;
    if (mensagemBloqueada) mensagemBloqueada.hidden = primeiroConcluido;
    if (acoesDoCapituloDois) acoesDoCapituloDois.hidden = !primeiroConcluido;

    // Selos, botões e links de conclusão.
    ["partida-de-portugal", "travessia-atlantico"].forEach(
      function (capituloId) {
        const concluido = capituloConcluido(capituloId);

        document
          .querySelectorAll(`[data-completed-stamp="${capituloId}"]`)
          .forEach(function (selo) {
            selo.hidden = !concluido;
          });

        document
          .querySelectorAll(`[data-complete="${capituloId}"]`)
          .forEach(function (botao) {
            botao.disabled = concluido;
          });

        document
          .querySelectorAll(`[data-complete-label="${capituloId}"]`)
          .forEach(function (rotulo) {
            rotulo.textContent = concluido
              ? "Capítulo concluído"
              : "Marcar como concluído";
          });

        document
          .querySelectorAll(`[data-next-link="${capituloId}"]`)
          .forEach(function (link) {
            link.hidden = !concluido;
          });
      },
    );
  }

  // Links entre as telas.
  document.querySelectorAll("[data-route]").forEach(function (link) {
    link.addEventListener("click", function (evento) {
      evento.preventDefault();
      abrirRota(link.dataset.route);
    });
  });

  // Links que apenas rolam até uma seção da tela inicial.
  document.querySelectorAll("[data-scroll]").forEach(function (link) {
    link.addEventListener("click", function (evento) {
      evento.preventDefault();
      mostrarTela("inicio");
      window.history.replaceState(null, "", "#inicio");

      window.setTimeout(function () {
        document
          .getElementById(link.dataset.scroll)
          ?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    });
  });

  document.querySelectorAll("[data-complete]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      concluirCapitulo(botao.dataset.complete);
    });
  });

  document.querySelectorAll("[data-reset-progress]").forEach(function (botao) {
    botao.addEventListener("click", reiniciarProgresso);
  });

  window.addEventListener("hashchange", function () {
    const rota = rotaAtual();

    if (
      rota === "capitulo-travessia-atlantico" &&
      !capituloConcluido("partida-de-portugal")
    ) {
      abrirRota("historia");
      return;
    }

    mostrarTela(rota);
    atualizarInterface();
  });

  atualizarInterface();
  const rotaInicial = rotaAtual();

  if (
    rotaInicial === "capitulo-travessia-atlantico" &&
    !capituloConcluido("partida-de-portugal")
  ) {
    abrirRota("historia");
  } else {
    mostrarTela(rotaInicial);
  }
})();
