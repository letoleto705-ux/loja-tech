(function () {
    const LIMITE_INATIVIDADE_MS = 600000;
    const INTERVALO_VERIFICACAO_MS = 1000;
    const CHAVE_TOKEN = 'tech_token';
    const CHAVE_SESSAO = 'tech_sessao_ativa';
    const CHAVE_ULTIMA_ATIVIDADE = 'tech_ultima_atividade';
    const PARAMETRO_SESSAO_EXPIRADA = 'sessaoExpirada';
    const MENSAGEM_EXPIRACAO = 'Sua sessão expirou por inatividade. Por favor, faça login novamente para continuar.';
    const EVENTOS_ATIVIDADE = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    let ultimaAtividade = 0;
    let ultimaGravacao = 0;
    let autenticado = false;
    let expirando = false;

    function temSessao() {
        return Boolean(localStorage.getItem(CHAVE_TOKEN));
    }

    function redirecionarParaLogin(mostrarMensagem) {
        const caminhoAtual = window.location.pathname;
        const estaNaTelaLogin = caminhoAtual.endsWith('/index.html') || caminhoAtual === '/';
        if (mostrarMensagem && !estaNaTelaLogin) {
            const urlLogin = new URL('index.html', window.location.href);
            urlLogin.searchParams.set(PARAMETRO_SESSAO_EXPIRADA, '1');
            window.location.href = urlLogin.href;
            return;
        }
        if (mostrarMensagem) alert(MENSAGEM_EXPIRACAO);
        if (estaNaTelaLogin) {
            window.location.reload();
            return;
        }
        window.location.href = new URL('index.html', window.location.href).href;
    }

    function encerrarSessaoPorInatividade() {
        if (expirando) return;
        expirando = true;
        localStorage.removeItem(CHAVE_TOKEN);
        localStorage.removeItem(CHAVE_SESSAO);
        localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
        sessionStorage.clear();
        redirecionarParaLogin(true);
    }

    function registrarAtividade() {
        if (!temSessao() || expirando) return;
        const agora = Date.now();
        ultimaAtividade = agora;
        if (agora - ultimaGravacao >= 1000) {
            localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(agora));
            ultimaGravacao = agora;
        }
    }

    function iniciarMonitoramento() {
        if (!temSessao()) {
            if (autenticado) {
                redirecionarParaLogin(false);
                localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
            } else if (localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE)) {
                localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
            }
            autenticado = false;
            ultimaAtividade = 0;
            ultimaGravacao = 0;
            return;
        }

        if (!autenticado) {
            autenticado = true;
            const atividadeSalva = Number(localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE));
            ultimaAtividade = Number.isFinite(atividadeSalva) && atividadeSalva > 0
                ? atividadeSalva
                : Date.now();
            ultimaGravacao = atividadeSalva || 0;
            if (!atividadeSalva) {
                localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(ultimaAtividade));
                ultimaGravacao = ultimaAtividade;
            }
        }

        const atividadeCompartilhada = Number(localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE));
        if (Number.isFinite(atividadeCompartilhada) && atividadeCompartilhada > ultimaAtividade) {
            ultimaAtividade = atividadeCompartilhada;
        }
        if (Date.now() - ultimaAtividade >= LIMITE_INATIVIDADE_MS) {
            encerrarSessaoPorInatividade();
        }
    }

    EVENTOS_ATIVIDADE.forEach(evento => {
        window.addEventListener(evento, registrarAtividade, { passive: true });
    });

    window.addEventListener('storage', evento => {
        if (evento.key === CHAVE_ULTIMA_ATIVIDADE && evento.newValue) {
            const atividade = Number(evento.newValue);
            if (Number.isFinite(atividade) && atividade > ultimaAtividade) {
                ultimaAtividade = atividade;
            }
        }
        if (evento.key === CHAVE_TOKEN && evento.oldValue && !evento.newValue && autenticado) {
            autenticado = false;
            localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
            redirecionarParaLogin(false);
        }
    });

    window.addEventListener('DOMContentLoaded', () => {
        const url = new URL(window.location.href);
        if (url.searchParams.get(PARAMETRO_SESSAO_EXPIRADA) === '1') {
            url.searchParams.delete(PARAMETRO_SESSAO_EXPIRADA);
            window.history.replaceState({}, '', url.href);
            alert(MENSAGEM_EXPIRACAO);
        }
    });

    iniciarMonitoramento();
    window.setInterval(iniciarMonitoramento, INTERVALO_VERIFICACAO_MS);
})();
