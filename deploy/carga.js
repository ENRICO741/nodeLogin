// Teste de carga (k6): usuários simultâneos fazendo o caminho do app (cadastro ou login, trilha inteira
// de aulas, depois trivia e revisão de aulas; ranking, conquistas, perfil e telemetria).
// Pausas curtas de propósito: cada usuário novo termina as 15 aulas em ~1,5 min e joga trivia no resto.
// Rode contra uma VM descartável, nunca a de produção: cria contas e enche telemetria e respostas.
//
// Dois cenários em paralelo: NOVOS se cadastram; EXISTENTES entram com contas de uma rodada anterior
// (USUARIOS = JSON com os apelidos; a senha é SENHA). Padrão: 100 novos por 2 min.
//   k6 run -e BASE_URL=https://guardiao-carga.brazilsouth.cloudapp.azure.com deploy/carga.js
//   k6 run -e BASE_URL=... -e NOVOS=50 -e EXISTENTES=50 -e USUARIOS=usuarios.json -e DURACAO=3m deploy/carga.js
/* global __ENV, __VU, open */
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const SITE = __ENV.BASE_URL;
const SENHA = 'Carga#Teste2026';
const NOVOS = Number(__ENV.NOVOS ?? 100);
const EXISTENTES = Number(__ENV.EXISTENTES ?? 0);
const CONTAS = EXISTENTES ? JSON.parse(open(__ENV.USUARIOS)) : [];
const ALTERNATIVAS = ['a', 'b', 'c', 'd'];
const trilhasConcluidas = new Counter('trilhas_concluidas');
const rodadasTrivia = new Counter('rodadas_trivia');

export const options = {
  scenarios: Object.fromEntries(
    Object.entries({ novos: NOVOS, existentes: EXISTENTES })
      .filter(([, vus]) => vus > 0)
      .map(([nome, vus]) => [
        nome,
        {
          executor: 'ramping-vus',
          stages: [
            { duration: '30s', target: vus },
            { duration: __ENV.DURACAO || '2m', target: vus },
            { duration: '15s', target: 0 },
          ],
        },
      ]),
  ),
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // bcrypt é lento de propósito; o resto do app tem de ser rápido.
    'http_req_duration{grupo:auth}': ['p(95)<2000', 'p(99)<3000'],
    'http_req_duration{grupo:app}': ['p(95)<100', 'p(99)<300'],
    // Todo usuário joga trivia; os novos precisam antes chegar ao fim da trilha.
    rodadas_trivia: [`count>=${NOVOS + EXISTENTES}`],
    ...(NOVOS && { trilhas_concluidas: [`count>=${NOVOS}`] }),
  },
};

// Estado de cada VU (cada VU é um usuário e mantém a sessão entre iterações).
let token;
let sessao;

function req(metodo, rota, corpo, nome, esperado = 200, grupo = 'app') {
  const res = http.request(metodo, `${SITE}/api${rota}`, corpo === undefined ? null : JSON.stringify(corpo), {
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    tags: { name: nome, grupo },
  });
  return check(res, { [`${nome} ${esperado}`]: (r) => r.status === esperado }) ? res : null;
}

const pausa = (min = 0.5, max = 1.5) => sleep(min + Math.random() * (max - min));
const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];
const evento = (tipo_evento, extra = {}) =>
  req('POST', '/eventos', { sessao_id: sessao, tipo_evento, ...extra }, 'POST /eventos', 204);

function cadastrar() {
  const apelido = `carga_${__VU}_${Date.now().toString(36)}`;
  const cadastro = req(
    'POST',
    '/auth/cadastro',
    {
      nome: `Carga ${__VU}`,
      apelido,
      email: `${apelido}@carga.teste`,
      senha: SENHA,
      consentiu_pesquisa: true,
    },
    'POST /auth/cadastro',
    201,
    'auth',
  );
  if (!cadastro) return null;
  token = cadastro.json('token');
  pausa();
  return apelido;
}

function entrar() {
  http.get(`${SITE}/`, { tags: { name: 'GET / (PWA)', grupo: 'app' } });
  // __VU é único entre os cenários, então cada VU existente pega uma conta diferente da lista.
  const apelido = exec.scenario.name === 'existentes' ? CONTAS[(__VU - 1) % CONTAS.length] : cadastrar();
  if (!apelido) return;
  const login = req(
    'POST',
    '/auth/login',
    { identificador: apelido, senha: SENHA },
    'POST /auth/login',
    200,
    'auth',
  );
  if (login) token = login.json('token');
  if (!token) return;
  sessao = req('POST', '/sessoes', { standalone: false, largura_tela: 390 }, 'POST /sessoes', 201)?.json(
    'id',
  );
}

function responderTodas(questoes, rota, nome) {
  for (const q of questoes) {
    pausa();
    req('POST', rota, { questao_id: q.id, alternativa: sortear(ALTERNATIVAS) }, nome);
  }
}

function fazerAula(id) {
  const aula = req('GET', `/aulas/${id}`, undefined, 'GET /aulas/:id');
  const visita = aula && req('POST', `/aulas/${id}/visitas`, undefined, 'POST /aulas/:id/visitas', 201);
  if (!visita) return false;
  evento('aula_iniciada', { tela: 'aula' });
  pausa(1.5, 3); // lendo o conteúdo
  evento('aula_conteudo_lido', { tela: 'aula', duracao_ms: 5000, metadata: { rolagem_max: 100 } });
  const visitaId = visita.json('id');
  responderTodas(aula.json('questoes'), `/visitas/${visitaId}/respostas`, 'POST /visitas/:id/respostas');
  if (!req('POST', `/visitas/${visitaId}/finalizar`, undefined, 'POST /visitas/:id/finalizar')) return false;
  evento('aula_concluida', { tela: 'aula' });
  return true;
}

function jogarTrivia() {
  const rodada = req(
    'POST',
    '/trivia/rodadas',
    { dificuldade: sortear(['facil', 'media', 'dificil']), limite: 5 },
    'POST /trivia/rodadas',
    201,
  );
  if (!rodada) return;
  evento('trivia_iniciada', { tela: 'trivia' });
  const id = rodada.json('id');
  responderTodas(
    rodada.json('questoes'),
    `/trivia/rodadas/${id}/respostas`,
    'POST /trivia/rodadas/:id/respostas',
  );
  if (req('POST', `/trivia/rodadas/${id}/finalizar`, undefined, 'POST /trivia/rodadas/:id/finalizar')) {
    rodadasTrivia.add(1);
    evento('resultado_visualizado', { tela: 'trivia' });
  }
}

export default function () {
  if (!token) {
    entrar();
    if (!token) return;
  }
  req('GET', '/auth/me', undefined, 'GET /auth/me');
  const resposta = req('GET', '/aulas', undefined, 'GET /aulas');
  if (!resposta) return;
  evento('tela_visualizada', { tela: 'aulas' });
  pausa();

  const aulas = resposta.json();
  const pendentes = aulas.filter((a) => !a.concluida);
  if (pendentes.length) {
    if (fazerAula(pendentes[0].id) && pendentes.length === 1) trilhasConcluidas.add(1);
  } else if (Math.random() < 0.25) {
    fazerAula(sortear(aulas).id); // revê uma aula já concluída
  } else {
    jogarTrivia();
  }
  pausa();
  if (Math.random() > 1 / 3) return; // navega por ranking, conquistas e perfil 1 a cada 3 vezes

  req('GET', '/ranking', undefined, 'GET /ranking');
  evento('tela_visualizada', { tela: 'ranking' });
  pausa();
  req('GET', '/badges', undefined, 'GET /badges');
  req('GET', '/perfil', undefined, 'GET /perfil');
  pausa();
}
