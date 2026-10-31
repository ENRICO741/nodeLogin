"""Análise dos questionários e das métricas do Guardião Impacta para o TCC.

Uso: python analise.py <pasta_dados>   |   python analise.py --demo [pasta]
Saída: CSVs, PNGs, resumo-tcc.md e apendice.md em <pasta_dados>/saida/.

ENTRADA (na pasta de dados; nome exato com data opcional; com mais de um, vale o modificado por último)
  - pesquisa-questionario-<data>.csv: sempre obrigatório.
  - pesquisa-engajamento-<data>.csv, pesquisa-respostas-<data>.csv, pesquisa-eventos-<data>.csv,
    pesquisa-pontos-<data>.csv, pesquisa-badges-<data>.csv, pesquisa-sessoes-<data>.csv (Admin → Estatísticas):
    obrigatórios quando há respostas do pós. Sem nenhum pós, só as descritivas do pré.

CONTRATO DE pesquisa-questionario-<data>.csv (o mesmo combinado com a exportação do app; não mudar sozinho)
  Formato longo, UTF-8 (BOM opcional), separador vírgula, uma linha por resposta. Colunas:
    participante   pseudônimo do participante, o mesmo das outras visões pesquisa-*.
    momento        'pre' | 'pos'
    item           código do item no questionário, como em ITENS (ex.: FA1, PU2_R, KS3, HXA2, ATN, A6, ABR1).
    valor          Escalas: 1..5 ou 1..7 (ITENS.escala); 0 = "Não vi / não usei esse recurso".
                   Escolhas: índice da opção, começando em 0, na ordem de docs/questionario-pesquisa.txt
                     (ex.: C1 0 = Sim, 1 = Não, 2 = Não lembro). Os rótulos estão em ITENS.opcoes.
                   Múltipla escolha (A6): uma linha por opção marcada.
                   Abertas (ABR1, ABR2): o texto.
                   Item não exibido por desvio (ex.: C2 a C4 e UES do pré quando C1 ≠ Sim): sem linha.
    respondido_em  momento do envio (ISO 8601). Sem fuso = horário de Brasília, como nas outras visões; com fuso,
                   é convertido para ele.
  No máximo um envio por participante e momento. Havendo mais de um, vale o primeiro (com aviso).

PROTOCOLO: coleta de 09/10 a 08/11/2026. O pós libera 14 dias depois do pré e fecha em min(pré + 28 dias, 08/11).
"""

import json
import os
import re
import sys
import tempfile
import unicodedata
import warnings
from html import unescape
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats  # noqa: E402

# ---------------------------------------------------------------- itens (fonte: docs/questionario-pesquisa.txt)

UES = {'FA': ['FA1', 'FA2', 'FA3'], 'PU': ['PU1_R', 'PU2_R', 'PU3_R'],
       'AE': ['AE1', 'AE2', 'AE3'], 'RW': ['RW1', 'RW2', 'RW3']}
UES_ITENS = sum(UES.values(), [])
# Conhecimento: 7 situações (julgamento situacional), 1 por área do HAIS-Q. Valor = índice da opção (0 a 3);
# o 3 é sempre "Não sei o que faria.". Acerto = 1; erro ou "Não sei" = 0; nota = soma de 0 a 7. Gabarito: o mesmo de
# backend/src/modulos/questionarios/definicao.js (não vai ao front).
K = ['KS1', 'KS2', 'KS3', 'KS4', 'KS5', 'KS6', 'KS7']
GABARITO = {'KS1': 2, 'KS2': 1, 'KS3': 2, 'KS4': 0, 'KS5': 2, 'KS6': 1, 'KS7': 0}
NAO_SEI = 3
AREAS_K = {'KS1': 'Senhas', 'KS2': 'E-mail', 'KS3': 'Internet', 'KS4': 'Redes sociais', 'KS5': 'Dispositivos móveis',
           'KS6': 'Manuseio de informação', 'KS7': 'Incidentes'}
# Nível de conhecimento pelos acertos (0 a 7), em faixas fixas definidas antes da coleta.
NIVEIS_K = ['baixo (0–2)', 'médio (3–4)', 'alto (5–7)']
HEXAD = {'Filantropo': ['HXP1', 'HXP4'], 'Socializador': ['HXS2', 'HXS4'], 'Conquistador': ['HXA2', 'HXA4'],
         'Jogador': ['HXR2', 'HXR4'], 'Espirito_livre': ['HXF1', 'HXF3']}
GAM = ['GAM1', 'GAM2', 'GAM3', 'GAM4', 'GAM5', 'GAM6_R', 'EXT', 'APR1']
NAO_LEMBRO = 'Não lembro'
OPCOES = {
    'A1': ['18-24', '25-34', '35-44', '45-54', '55 ou mais'],
    'A2': ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'],
    'A3': ['Até o ensino médio (completo ou não)', 'Superior incompleto', 'Superior completo', 'Pós-graduação'],
    'A4': ['Administrativo', 'Financeiro ou contábil', 'Recursos humanos', 'Comercial ou vendas',
           'Marketing ou comunicação', 'Jurídico', 'Atendimento ao cliente', 'Operações ou logística', 'Outra'],
    'A5': ['Nunca', 'Raramente (menos de 1 vez por mês)', 'Algumas vezes por mês', 'Algumas vezes por semana',
           'Todos os dias'],
    'A6': ['Duolingo', 'Kahoot!', 'Quizizz', 'Khan Academy',
           'Treinamento da empresa com pontos, medalhas ou ranking', 'Outra', 'Nenhuma'],
    'C1': ['Sim', 'Não', NAO_LEMBRO],
    'C2': ['Menos de 6 meses', 'Entre 6 meses e 1 ano', 'Entre 1 e 2 anos', 'Mais de 2 anos', NAO_LEMBRO],
    'C3': ['Vídeo ou curso online', 'Palestra ou aula presencial', 'Material para leitura',
           'Simulação de e-mail falso (phishing)', 'Jogo ou quiz com pontos ou ranking', 'Outro'],
    'C4': ['Sim', 'Não', NAO_LEMBRO],
    'MOT': ['Pontos', 'Conquistas', 'Ranking', 'Trivia', 'Explicações depois das respostas', 'Nenhum deles'],
    'CMP': ['Muito pior', 'Pior', 'Igual', 'Melhor', 'Muito melhor', 'Não lembro o suficiente para comparar'],
    # Situações de conhecimento: resumo de cada opção, na ordem do questionário (* = correta).
    'KS1': ['Passa a senha', 'Passa a senha e troca depois', '* Desliga e procura o canal oficial', 'Não sei'],
    'KS2': ['Abre o link', '* Confirma com o colega por outro meio', 'Responde o próprio e-mail', 'Não sei'],
    'KS3': ['Compra pelo cadeado', 'Compra pelo logotipo e cores', '* Confere ou digita o endereço', 'Não sei'],
    'KS4': ['* Tira outra foto sem crachá e tela', 'Posta só para amigos', 'Posta assim', 'Não sei'],
    'KS5': ['Usa o Wi-Fi com senha', 'Usa o Wi-Fi em modo anônimo', '* Usa dados móveis ou VPN', 'Não sei'],
    'KS6': ['Conecta no computador do trabalho', '* Entrega à TI sem conectar', 'Conecta num computador pessoal',
            'Não sei'],
    'KS7': ['* Avisa a TI logo', 'Apaga e passa antivírus', 'Não faz nada', 'Não sei'],
}
SIM, NENHUMA, CMP_NAO_LEMBRO = 0, 6, 5  # posições (a partir de 0) usadas na análise


def _tabela_itens():
    linhas = []

    def add(momentos, bloco, codigos, tipo, escala=None):
        for m in momentos:
            for c in codigos:
                linhas.append((m, c, bloco, escala or len(OPCOES.get(c, [])), c.endswith('_R'), tipo,
                               OPCOES.get(c)))

    add(['pre'], 'anamnese', ['A1', 'A2', 'A3', 'A4', 'A5'], 'escolha')
    add(['pre'], 'anamnese', ['A6'], 'multi')
    add(['pre'], 'treinamento', ['C1', 'C2', 'C3', 'C4'], 'escolha')
    for bloco, itens in UES.items():
        add(['pre', 'pos'], bloco, itens, 'likert', 5)
    add(['pre', 'pos'], 'conhecimento', K, 'escolha')
    for bloco, itens in HEXAD.items():
        add(['pre'], bloco, itens, 'likert', 7)
    add(['pre'], 'atencao', ['ATN'], 'likert', 7)  # no meio do Hexad: 7 pontos no pré, 5 no pós
    add(['pos'], 'atencao', ['ATN'], 'likert', 5)
    add(['pos'], 'app', GAM, 'likert', 5)
    add(['pos'], 'motivador', ['MOT'], 'escolha')
    add(['pos'], 'comparacao', ['CMP'], 'escolha')
    add(['pos'], 'abertas', ['ABR1', 'ABR2'], 'texto')
    return pd.DataFrame(linhas, columns=['momento', 'codigo', 'bloco', 'escala', 'invertido', 'tipo', 'opcoes']
                        ).set_index(['momento', 'codigo'])


# Uma linha por (momento, código). escala = pontos da Likert ou nº de opções na escolha; texto = 0.
ITENS = _tabela_itens()

# Reserva para rodar fora do repositório (sem conteudo/aulas); o teste confere que bate com as pastas.
TITULOS_RESERVA = {
    'Bem-vindo à Cybersecurity': '01', 'O que Estamos Protegendo?': '02', 'Os 3 Pilares da Segurança': '03',
    'O Inimigo Está Disfarçado': '04', 'Phishing: O Golpe Mais Comum': '05', 'Engenharia Social': '06',
    'A Senha é Sua Primeira Defesa': '07', 'Quando o Arquivo é uma Armadilha': '08',
    'A Internet Não é um Lugar Seguro': '09', 'Seu Celular Também Está na Mira': '10',
    'Dados nas Mãos Erradas': '11', 'Segurança Dentro da Empresa': '12', 'Você Detectou um Incidente': '13',
    'A Empresa Está Sob Ataque': '14', 'Missão Final: Primeira Linha de Defesa': '15',
}


def _titulos_das_aulas():
    """<title> de conteudo/aulas/<pasta>/aula.html (o importador grava esse texto em aulas.titulo) → nº da pasta."""
    titulos = {}
    for p in sorted((Path(__file__).resolve().parent.parent / 'conteudo' / 'aulas').glob('*/aula.html')):
        m = re.search(r'<title>(.*?)</title>', p.read_text(encoding='utf-8'), re.S)
        if m:
            titulos[unicodedata.normalize('NFC', unescape(m.group(1).strip()))] = p.parent.name[:2]
    if not titulos:
        print('Aviso: conteudo/aulas não encontrado; títulos das aulas da lista de reserva.')
    return titulos or TITULOS_RESERVA


TITULO_AULA = _titulos_das_aulas()
AULAS_K = {'KS1': ['07'], 'KS2': ['04', '05', '06'], 'KS3': ['08', '09'], 'KS4': ['06', '11'], 'KS5': ['09', '10'],
           'KS6': ['01', '02', '12'], 'KS7': ['13', '14']}

# ---------------------------------------------------------------- app

COLUNAS = {
    'questionario': ['participante', 'momento', 'item', 'valor', 'respondido_em'],
    'engajamento': ['participante', 'dias_ativos', 'sessoes', 'tempo_total_s', 'aulas_concluidas',
                    'respostas_aulas', 'rodadas_trivia', 'respostas_trivia', 'acertos_trivia', 'pontos', 'badges',
                    'visitas_ranking', 'visitas_conquistas', 'primeira_atividade', 'ultima_atividade'],
    'respostas': ['participante', 'tipo', 'contexto', 'questao_id', 'correta', 'respondido_em'],
    'eventos': ['participante', 'tipo_evento', 'tela', 'elemento', 'duracao_ms', 'metadata', 'criado_em'],
    'pontos': ['participante', 'origem', 'pontos', 'criado_em'],
    'badges': ['participante', 'badge', 'obtida_em'],
    'sessoes': ['participante', 'iniciada_em', 'finalizada_em', 'duracao_s'],
}
# Métricas de uso por participante, todas "até o pós" (corte_uso). Sem trivia: ela só abre depois das 15 aulas.
USO = ['dias_ativos', 'sessoes', 'tempo_min', 'aulas_concluidas', 'badges', 'visitas_ranking', 'visitas_conquistas',
       'repeticoes_sem_pontos', 'pontos', 'respostas']
PERGUNTA_PROVISORIA = 'confirmacao-leitura'  # "Terminou?" das aulas 02 a 15: sempre "Sim", fica fora do acerto
FUSO = 'America/Sao_Paulo'
# PESQUISA_DATA_FIM=2026-11-07 é o último dia aceito; o pós fecha às 00:00 de 08/11, horário de SP. É o FECHA_POS
# do backend (modulos/questionarios/service.js): min(pré + 28 dias, (PESQUISA_DATA_FIM + 1) 00:00 SP).
# Elegível ao pós = a janela abriu antes de fechar: pré + 14 dias < FIM_COLETA.
FIM_COLETA = pd.Timestamp('2026-11-08 00:00')
LIBERA_POS = pd.Timedelta(days=14)  # o pós libera 14 dias depois do pré
JANELA_POS = pd.Timedelta(days=28)  # e fecha 28 dias depois dele (ou em FIM_COLETA, o que vier antes)
FAIXAS = ['0–4', '5–10', '11–15']  # aulas concluídas até o pós; definidas antes da coleta


def ler(dados, visao, **kw):
    # Casa pesquisa-engajamento.csv (baixado pela tela) e pesquisa-engajamento-2026-10-01.csv.
    # Nome exato, com data opcional: pesquisa-questionario*.csv também casaria pesquisa-questionarios-<data>.csv.
    arquivos = [a for a in Path(dados).glob(f'pesquisa-{visao}*.csv')
                if re.fullmatch(rf'pesquisa-{re.escape(visao)}(-\d{{4}}-\d{{2}}-\d{{2}})?\.csv', a.name)]
    if not arquivos:
        raise FileNotFoundError(f'Falta o arquivo pesquisa-{visao}-<data>.csv em {dados}')
    arquivo = max(arquivos, key=lambda a: a.stat().st_mtime)
    t = pd.read_csv(arquivo, encoding='utf-8-sig', **kw)
    faltam = [c for c in COLUNAS[visao] if c not in t.columns]
    if faltam:
        raise ValueError(f'{arquivo.name}: faltam as colunas {", ".join(faltam)}')
    return t


def corte_uso(envios, participantes):
    """Fim do "uso até o pós": o envio do pós; sem pós, o fechamento da janela, min(pré + 28 dias, FIM_COLETA);
    sem pré, FIM_COLETA. Uma definição só para as faixas e as correlações com o uso."""
    pre = envios['pre'].reindex(participantes)
    fecha = (pre + JANELA_POS).where(pre + JANELA_POS < FIM_COLETA, FIM_COLETA)
    return envios['pos'].reindex(participantes).fillna(fecha).rename('corte')


def cortar(t, coluna_data, corte):
    """Linhas de `t` antes do corte do participante (sem corte, todas), com a data local em `quando`."""
    t = t.assign(quando=hora_local(t[coluna_data]))
    if corte is None:
        return t
    limite = t.participante.map(corte)
    return t[limite.isna() | (t.quando < limite)]


def rolagem(metadata):
    """rolagem_max do metadata de aula_conteudo_lido; nulo, vazio ou inválido = ausente."""
    try:
        m = json.loads(metadata) if isinstance(metadata, str) and metadata.strip() else None
    except ValueError:
        m = None
    return m.get('rolagem_max', np.nan) if isinstance(m, dict) else np.nan


def features(dados, envios=None):
    """Métricas por participante, contando só o uso antes de corte_uso (sem `envios`, o período inteiro)."""
    e = ler(dados, 'engajamento', dtype={'participante': str}).set_index('participante')
    corte = corte_uso(envios, e.index) if envios is not None else None
    f = pd.DataFrame(index=e.index)
    f['acerto_trivia'] = e.acertos_trivia / e.respostas_trivia.replace(0, np.nan)
    f['periodo_dias'] = (pd.to_datetime(e.ultima_atividade, format='ISO8601')
                         - pd.to_datetime(e.primeira_atividade, format='ISO8601')).dt.days + 1

    r = ler(dados, 'respostas', dtype={'participante': str})
    r['correta'] = r.correta.astype(bool)  # CSV só com cabeçalho chega como texto
    provisoria = (r.tipo == 'aula') & (r.get('chave') == PERGUNTA_PROVISORIA)  # CSV antigo: sem a coluna
    ids_provisoria = set(r.loc[provisoria, 'questao_id'].astype(str))
    primeira = hora_local(r.respondido_em).groupby(r.participante).min().rename('primeira_atividade')
    r = cortar(r, 'respondido_em', corte).sort_values('quando')
    provisoria = (r.tipo == 'aula') & (r.get('chave') == PERGUNTA_PROVISORIA)
    # Respondeu de novo uma questão de aula que já tinha acertado: não rende pontos, então é uso voluntário.
    # Só aula: a trivia sorteia as questões e repete sem a pessoa escolher.
    ra = r[r.tipo == 'aula']
    acertos_antes = ra.groupby(['participante', 'questao_id']).correta.cumsum() - ra.correta
    f['repeticoes_sem_pontos'] = (acertos_antes > 0).groupby(ra.participante).sum()
    aulas = r[(r.tipo == 'aula') & ~provisoria]
    f['acerto_aulas'] = aulas.groupby('participante').correta.mean()
    f['respostas'] = r[~provisoria].groupby('participante').size()
    concluidas = aulas_por_participante(r)
    f['aulas_concluidas'] = pd.Series({p: len(x) for p, x in concluidas.items()}, dtype=float)

    pontos = cortar(ler(dados, 'pontos', dtype={'participante': str}), 'criado_em', corte)
    f['pontos'] = pontos.groupby('participante').pontos.sum()
    badges = cortar(ler(dados, 'badges', dtype={'participante': str}), 'obtida_em', corte)
    f['badges'] = badges.groupby('participante').size()
    sessoes = cortar(ler(dados, 'sessoes', dtype={'participante': str}), 'iniciada_em', corte)
    f['dias_ativos'] = sessoes.quando.dt.normalize().groupby(sessoes.participante).nunique()
    f['sessoes'] = sessoes.groupby('participante').size()
    # Sessão em que o pós foi respondido: só o tempo até o corte. Sem fim registrado, a duração exportada.
    fim = hora_local(sessoes.finalizada_em)
    limite = sessoes.participante.map(corte) if corte is not None else fim
    fim = fim.where(fim.isna() | limite.isna() | (fim <= limite), limite)
    segundos = (fim - sessoes.quando).dt.total_seconds().clip(lower=0).fillna(sessoes.duracao_s)
    f['tempo_min'] = segundos.groupby(sessoes.participante).sum() / 60

    ev = cortar(ler(dados, 'eventos', dtype={'participante': str}), 'criado_em', corte)
    telas = ev[ev.tipo_evento == 'tela_visualizada']
    f['visitas_ranking'] = telas[telas.tela == '/ranking'].groupby('participante').size()
    f['visitas_conquistas'] = telas[telas.tela == '/conquistas'].groupby('participante').size()
    leitura = ev[ev.tipo_evento == 'aula_conteudo_lido'].copy()
    leitura['rolagem'] = leitura.metadata.map(rolagem)
    f['leitura_mediana_s'] = leitura.groupby('participante').duracao_ms.median() / 1000
    f['rolagem_mediana'] = leitura.groupby('participante').rolagem.median()
    quiz = ev[ev.tipo_evento == 'quiz_respondido']
    na_trivia = quiz.tela.fillna('').str.startswith('/trivia')
    # O "Terminou?" (elemento = id da questão) é um toque em "Sim": fora do tempo de resposta das aulas.
    real = ~quiz.elemento.astype(str).isin(ids_provisoria)
    f['resposta_mediana_aula_s'] = quiz[~na_trivia & real].groupby('participante').duracao_ms.median() / 1000
    f['resposta_mediana_trivia_s'] = quiz[na_trivia].groupby('participante').duracao_ms.median() / 1000

    f[USO] = f[USO].fillna(0).astype(float)  # CSV só com cabeçalho chega como texto
    return f, concluidas, primeira


def aulas_por_participante(respostas):
    # ponytail: "concluída" = respondeu alguma questão da aula; a visão de respostas não tem a conclusão.
    a = respostas[respostas.tipo == 'aula']
    titulo = a.contexto.astype(str).str.strip().map(lambda s: unicodedata.normalize('NFC', s))
    numero = titulo.map(TITULO_AULA)
    desconhecidos = sorted(titulo[numero.isna()].unique())
    if desconhecidos:
        print(f'Aviso: título(s) de aula sem pasta em TITULO_AULA: {desconhecidos}')
    return numero.dropna().groupby(a.participante).agg(set).rename('aulas')


def itens_cobertos(aulas):
    """Itens K cujas aulas a pessoa concluiu (basta uma das aulas do item)."""
    return {k for k, numeros in AULAS_K.items() if set(aulas) & set(numeros)}


def faixa_uso(aulas):
    """Faixa de uso pelas aulas concluídas até o pós: 0–4, 5–10 e 11–15 (definidas antes da coleta)."""
    return pd.Series(pd.cut(aulas, bins=[-1, 4, 10, 15], labels=FAIXAS), index=aulas.index).astype(object) \
        .rename('faixa_uso')


# ---------------------------------------------------------------- questionário

def hora_local(serie):
    """Texto ISO 8601 → horário de Brasília sem fuso. Sem fuso, o valor já é tomado como horário de Brasília."""
    def converter(v):
        try:
            ts = pd.Timestamp(v)
        except (ValueError, TypeError):
            return pd.NaT
        return ts.tz_convert(FUSO).tz_localize(None) if ts.tzinfo else ts

    return pd.to_datetime(serie.map({v: converter(v) for v in serie.dropna().unique()}))


def ler_questionario(dados):
    """Devolve (largo por momento, múltipla escolha, abertas, envios por participante × momento, nº duplicatas)."""
    q = ler(dados, 'questionario', dtype={c: str for c in COLUNAS['questionario']})
    for c in ['participante', 'momento', 'item']:
        q[c] = q[c].str.strip()
    q['momento'] = q.momento.str.lower()
    q = q.dropna(subset=['participante', 'momento', 'item'])  # linhas em branco
    # No máximo um envio por momento: vale o primeiro.
    q['envio'] = hora_local(q.respondido_em)
    primeiro = q.groupby(['participante', 'momento']).envio.transform('min')
    sem_data = q.envio.isna()
    if sem_data.any():  # contrato: a data vem em todas as linhas; sem ela, a linha fica no envio da pessoa
        print(f'Aviso: {sem_data.sum()} linha(s) sem respondido_em válido; mantidas no envio do participante '
              f'({q[sem_data & primeiro.isna()].groupby(["participante", "momento"]).ngroups} envio(s) inteiro(s) '
              'sem data ficam fora dos prazos: elegibilidade, pré contaminado e dias entre os questionários).')
    repetido = ~sem_data & primeiro.notna() & (q.envio != primeiro)
    duplicatas = q[repetido].groupby(['participante', 'momento']).ngroups
    if duplicatas:
        print(f'Aviso: {duplicatas} envio(s) repetido(s) do mesmo participante e momento: vale o primeiro.')
    q = q[~repetido]
    envios = q.groupby(['participante', 'momento']).envio.min().unstack().reindex(columns=['pre', 'pos'])

    q = q.join(ITENS[['escala', 'tipo']], on=['momento', 'item'])
    desconhecidos = q[q.tipo.isna()]
    if len(desconhecidos):
        print(f'Aviso: {len(desconhecidos)} linha(s) com momento/item fora de ITENS ignoradas: '
              f'{sorted(set(desconhecidos.momento + ":" + desconhecidos.item))[:10]}')
    q = q[q.tipo.notna()]

    textos = q[q.tipo == 'texto'].drop_duplicates(['participante', 'momento', 'item'])[
        ['participante', 'momento', 'item', 'valor']]
    num = q[q.tipo != 'texto'].copy()
    num['valor'] = pd.to_numeric(num.valor, errors='coerce')
    # Escalas: 0 ("não usei") até a escala. Escolhas: 0 até nº de opções − 1.
    valido = num.valor.between(0, num.escala - (num.tipo != 'likert')) & (num.valor % 1 == 0)
    if (~valido).sum():
        print(f'Aviso: {(~valido).sum()} resposta(s) fora da escala ignoradas.')
    num = num[valido]

    multi = num[num.tipo == 'multi'].drop_duplicates(['participante', 'momento', 'item', 'valor'])[
        ['participante', 'momento', 'item', 'valor']]
    unico = num[num.tipo != 'multi']
    repetidas = unico.duplicated(['participante', 'momento', 'item']).sum()
    if repetidas:
        print(f'Aviso: {repetidas} resposta(s) repetida(s) do mesmo item no mesmo envio: vale a primeira.')
    largo = {m: unico[unico.momento == m]
             .pivot_table(index='participante', columns='item', values='valor', aggfunc='first')
             .rename_axis(columns=None) for m in ['pre', 'pos']}
    # Quem só deixou múltipla escolha ou abertas continua contando (o ATN decide se fica).
    for m in largo:
        outros = pd.Index(pd.concat([multi, textos]).query('momento == @m').participante.unique())
        largo[m] = largo[m].reindex(largo[m].index.union(outros))
    return largo, multi, textos, envios, duplicatas


def pre_contaminado(envio_pre, primeira):
    """Quem enviou o pré depois da 1ª resposta no app (aula ou trivia): a linha de base estaria contaminada."""
    junto = pd.concat([envio_pre.rename('pre'), primeira.rename('primeira')], axis=1, join='inner').dropna()
    return junto.index[junto.pre > junto.primeira]


def filtrar_atencao(t):
    """Fica só quem marcou 1 no ATN; sem ATN conta como erro. Devolve (tabela, nº excluídos)."""
    ok = t['ATN'] == 1 if 'ATN' in t else pd.Series(False, index=t.index)
    return t[ok], int((~ok).sum())


def nao_usei_nan(t):
    return t.mask(t == 0)


def inverter(t, momento):
    t = t.copy()
    for c in t.columns:
        if (momento, c) in ITENS.index and ITENS.loc[(momento, c), 'invertido']:
            t[c] = ITENS.loc[(momento, c), 'escala'] + 1 - t[c]
    return t


def limpar(bruto, momento):
    """Likert: "não usei" (0) vira NaN e os _R são invertidos. No pré, UES só de quem fez treinamento."""
    likert = [c for c in bruto if (momento, c) in ITENS.index and ITENS.loc[(momento, c), 'tipo'] == 'likert']
    t = bruto.copy()
    t[likert] = inverter(nao_usei_nan(t[likert]), momento)
    if momento == 'pre':
        sem_treinamento = t['C1'] != SIM if 'C1' in t else pd.Series(True, index=t.index)
        t.loc[sem_treinamento, t.columns.intersection(UES_ITENS)] = np.nan
    return t


def respostas_uniformes(bruto, momento):
    """Quem deu a mesma nota em todos os itens do bloco (valores brutos, antes de inverter os _R). Só marca:
    escores, testes e n não mudam. Hexad só no pré; no pré, UES só de quem fez treinamento (C1 = Sim)."""
    blocos = {'Hexad': sum(HEXAD.values(), [])} if momento == 'pre' else {}
    blocos['UES'] = UES_ITENS
    linhas = []
    for bloco, itens in blocos.items():
        t = nao_usei_nan(colunas(bruto, itens))  # 0 ("não usei") não conta como respondido
        if bloco == 'UES' and momento == 'pre':
            t = t[coluna(bruto, 'C1') == SIM]
        uniforme = t.notna().all(axis=1) & (t.nunique(axis=1) == 1)
        linhas += [{'participante': p, 'momento': momento, 'bloco': bloco} for p in t.index[uniforme]]
    return pd.DataFrame(linhas, columns=['participante', 'momento', 'bloco'])


def colunas(t, cols):
    return t.reindex(columns=cols).astype(float)


def coluna(t, c):
    return colunas(t, [c]).iloc[:, 0]


def escores(limpo, momento):
    e = pd.DataFrame(index=limpo.index)
    for sub, itens in UES.items():
        e[sub] = colunas(limpo, itens).mean(axis=1)
    e['UES'] = colunas(limpo, UES_ITENS).mean(axis=1)
    e['K'] = acertos(limpo).sum(axis=1, min_count=len(K))  # só quem respondeu as 7 situações
    if momento == 'pre':
        for tipo, itens in HEXAD.items():
            e[tipo] = colunas(limpo, itens).sum(axis=1, min_count=2)
    return e


def classificar_k(limpo):
    """Situações KS: 1 = acerto (opção do gabarito), 0 = "Não sei", -1 = erro (uma das erradas);
    sem resposta = NaN."""
    v = colunas(limpo, K)
    c = np.select([v.eq(pd.Series(GABARITO)), v.eq(NAO_SEI)], [1, 0], -1)
    return pd.DataFrame(c, index=v.index, columns=K).where(v.notna())


def acertos(limpo):
    """1 = acerto, 0 = erro ou "Não sei", NaN = sem resposta, por situação."""
    c = classificar_k(limpo)
    return c.eq(1).astype(float).where(c.notna())


def nivel_conhecimento(n_acertos):
    """Faixa de NIVEIS_K pelos acertos (0 a 7)."""
    return pd.Series(pd.cut(n_acertos, bins=[-1, 2, 4, 7], labels=NIVEIS_K), index=n_acertos.index).astype(object)


def perfil_conhecimento(limpo):
    """Por participante: acertos, erros e "Não sei" (só com as 7 respondidas), nível e padrão do erro (quem erra
    escolhendo uma opção "responsável" × quem admite não saber). Descritivo."""
    c = classificar_k(limpo).dropna()
    t = pd.DataFrame({'acertos': c.eq(1).sum(axis=1), 'erros': c.eq(-1).sum(axis=1),
                      'nao_sei': c.eq(0).sum(axis=1)}, index=c.index)
    t['nivel'] = nivel_conhecimento(t.acertos)
    t['padrao'] = np.select([t.erros + t.nao_sei == 0, t.erros > t.nao_sei, t.nao_sei > t.erros],
                            ['sem erros', 'erra com confiança', 'admite não saber'], 'misto')
    return t


# ---------------------------------------------------------------- estatística

def alfa_cronbach(itens):
    x = np.asarray(itens, float)
    x = x[~np.isnan(x).any(axis=1)]
    n, k = x.shape
    if k < 2 or n < 2:
        return np.nan
    total = x.sum(axis=1).var(ddof=1)
    return np.nan if total == 0 else k / (k - 1) * (1 - x.var(axis=0, ddof=1).sum() / total)


def holm(p):
    p = np.asarray(p, float)
    ajustado = np.full_like(p, np.nan)
    ok = ~np.isnan(p)
    m = ok.sum()
    if m:
        v = p[ok]
        ordem = np.argsort(v)
        adj = np.empty(m)
        adj[ordem] = np.minimum(1, np.maximum.accumulate((m - np.arange(m)) * v[ordem]))
        ajustado[ok] = adj
    return ajustado


def rank_biserial(d):
    d = np.asarray(d, float)
    d = d[(d != 0) & ~np.isnan(d)]
    postos = stats.rankdata(np.abs(d))
    return (postos[d > 0].sum() - postos[d < 0].sum()) / postos.sum() if len(d) else np.nan


def ic_bootstrap(funcao, dados, n_boot=2000, seed=0):
    """IC 95% percentil: reamostra as linhas de `dados` (sem NaN) e aplica `funcao`. n < 5: sem IC."""
    x = np.asarray(dados, float)
    x = x[:, None] if x.ndim == 1 else x
    x = x[~np.isnan(x).any(axis=1)]
    if len(x) < 5:
        return np.nan, np.nan
    rng = np.random.default_rng(seed)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')  # reamostra constante: a estatística sai NaN e é ignorada
        boots = np.array([funcao(x[rng.integers(0, len(x), len(x))]) for _ in range(n_boot)], float)
    if np.isnan(boots).all():
        return np.nan, np.nan
    inf, sup = np.nanpercentile(boots, [2.5, 97.5])
    return inf, sup


def wilcoxon_pareado(antes, depois, ic=False):
    par = pd.concat([antes, depois], axis=1, keys=['pre', 'pos'], join='inner').dropna()
    d = par.pos - par.pre
    teste = stats.wilcoxon(d) if (d != 0).sum() >= 2 else None
    inf, sup = ic_bootstrap(lambda x: rank_biserial(x[:, 0]), d) if ic else (np.nan, np.nan)
    return {'n_pares': len(par), 'mediana_pre': par.pre.median(), 'mediana_pos': par.pos.median(),
            'mediana_delta': d.median(), 'W': teste.statistic if teste else np.nan,
            'p': teste.pvalue if teste else np.nan, 'r_rank_biserial': rank_biserial(d),
            'r_ic95_inf': inf, 'r_ic95_sup': sup}


def spearman(x, y):
    par = pd.concat([x, y], axis=1, join='inner').dropna()
    if len(par) < 5 or par.iloc[:, 0].nunique() < 2 or par.iloc[:, 1].nunique() < 2:
        return len(par), np.nan, np.nan
    rho, p = stats.spearmanr(par.iloc[:, 0], par.iloc[:, 1])
    return len(par), rho, p


def porte(r):
    if pd.isna(r):
        return 'não calculado'
    return 'desprezível' if abs(r) < .1 else 'pequeno' if abs(r) < .3 else 'médio' if abs(r) < .5 else 'grande'


# ---------------------------------------------------------------- análises

COLUNAS_AD = ['medida', 'n_pares', 'mediana_pre', 'mediana_pos', 'mediana_delta', 'W', 'p', 'r_rank_biserial',
              'r_ic95_inf', 'r_ic95_sup', 'p_holm']


def antes_depois(e_pre, e_pos):
    """Os 2 testes principais, UES geral e conhecimento total: Wilcoxon pareado, rank-biserial com IC 95% por
    bootstrap e Holm só entre os dois."""
    linhas = [{'medida': m, **wilcoxon_pareado(e_pre[m], e_pos[m], ic=True)} for m in ['UES', 'K']]
    t = pd.DataFrame([lin for lin in linhas if lin['n_pares']], columns=COLUNAS_AD[:-1])
    t['p_holm'] = holm(t.p)
    if len(t) and 'UES' not in set(t.medida):
        print('Ninguém com C1 = Sim no pré e UES nos dois momentos: UES pareada pulada.')
    return t


def medianas_ues(e_pre, e_pos):
    """Subescalas da UES: só as medianas no pré e no pós, entre os pareados de cada uma (sem teste)."""
    linhas = []
    for sub in UES:
        par = pd.concat([e_pre[sub], e_pos[sub]], axis=1, keys=['pre', 'pos'], join='inner').dropna()
        linhas.append({'medida': sub, 'n_pares': len(par), 'mediana_pre': par.pre.median(),
                       'mediana_pos': par.pos.median()})
    return pd.DataFrame(linhas)


def mcnemar(b, c):
    """McNemar exato (binomial nos pares discordantes): b passou a acertar, c deixou de acertar."""
    return stats.binomtest(int(b), int(b + c), 0.5).pvalue if b + c else np.nan


def mudanca_k(lim_pre, lim_pos):
    """Por situação, entre os pareados: % de acerto, erro e "Não sei", o erro mais escolhido no pré e o McNemar
    exato (exploratório, sem correção)."""
    ids = lim_pre.index.intersection(lim_pos.index)
    pre, pos = classificar_k(lim_pre.loc[ids]), classificar_k(lim_pos.loc[ids])
    linhas = []
    for item in K:
        ok = pre[item].notna() & pos[item].notna()
        a, b = pre.loc[ok, item], pos.loc[ok, item]
        erros_pre = colunas(lim_pre.loc[ids], [item]).iloc[:, 0][ok & (pre[item] == -1)]
        passou, deixou = int(((a < 1) & (b == 1)).sum()), int(((a == 1) & (b < 1)).sum())
        linhas.append({'item': item, 'area': AREAS_K[item], 'aulas': '+'.join(AULAS_K[item]), 'n': int(ok.sum()),
                       'pct_acerto_pre': 100 * (a == 1).mean() if ok.any() else np.nan,
                       'pct_acerto_pos': 100 * (b == 1).mean() if ok.any() else np.nan,
                       'pct_nao_sei_pre': 100 * (a == 0).mean() if ok.any() else np.nan,
                       'pct_nao_sei_pos': 100 * (b == 0).mean() if ok.any() else np.nan,
                       'pct_erro_pre': 100 * (a == -1).mean() if ok.any() else np.nan,
                       'pct_erro_pos': 100 * (b == -1).mean() if ok.any() else np.nan,
                       'erro_mais_comum_pre': OPCOES[item][int(erros_pre.mode().min())] if len(erros_pre) else '',
                       'n_passou_a_acertar': passou, 'n_deixou_de_acertar': deixou,
                       'p_mcnemar': mcnemar(passou, deixou)})
    return pd.DataFrame(linhas)


def ganho_por_cobertura(lim_pre, lim_pos, aulas):
    """Dentro de cada pessoa: ganho médio de acerto (−1, 0 ou 1 por situação) nas situações das aulas
    concluídas × nas das aulas não concluídas."""
    ids = lim_pre.index.intersection(lim_pos.index)
    ganho = acertos(lim_pos.loc[ids]) - acertos(lim_pre.loc[ids])
    linhas = []
    for p, g in ganho.iterrows():
        cobertos = itens_cobertos(aulas.get(p, set()))
        sim = [k for k in K if k in cobertos]
        nao = [k for k in K if k not in cobertos]
        linhas.append({'participante': p, 'itens_cobertos': len(sim),
                       'ganho_concluidas': g[sim].mean() if sim else np.nan,
                       'ganho_nao_concluidas': g[nao].mean() if nao else np.nan})
    t = pd.DataFrame(linhas, columns=['participante', 'itens_cobertos', 'ganho_concluidas', 'ganho_nao_concluidas'])
    teste = pd.DataFrame([{'medida': 'ganho K: aulas concluídas − não concluídas',
                           **wilcoxon_pareado(t.set_index('participante').ganho_nao_concluidas,
                                              t.set_index('participante').ganho_concluidas, ic=True)}])
    teste = teste.rename(columns={'mediana_pre': 'mediana_nao_concluidas', 'mediana_pos': 'mediana_concluidas'})
    return t, teste


def confiabilidade(lim_pre, lim_pos):
    """α de Cronbach da UES (geral e subescalas) e do conhecimento (KR-20: α nos acertos 0/1), no pré e no
    pós."""
    linhas = []
    for momento, t in [('pre', lim_pre), ('pos', lim_pos)]:
        if t is None or t.empty:
            continue
        for nome, itens in {'UES geral': UES_ITENS, **UES, 'K (KR-20)': K}.items():
            x = (acertos(t) if itens is K else colunas(t, itens)).dropna()
            linhas.append({'momento': momento, 'escala': nome, 'k_itens': len(itens), 'n': len(x),
                           'alfa': alfa_cronbach(x)})
    return pd.DataFrame(linhas, columns=['momento', 'escala', 'k_itens', 'n', 'alfa'])


def abandono(validos_pre, envio_pre, respondeu_pos, e_pre, uso_janela):
    """Viés de abandono, entre os elegíveis (pós liberado antes de FIM_COLETA): quem respondeu o pós × quem não
    respondeu, nos escores do pré e no uso da mesma janela para os dois grupos (até pré + 14 dias)."""
    pre = envio_pre.reindex(validos_pre)
    elegiveis = pre.index[pre + LIBERA_POS < FIM_COLETA]
    respondeu = elegiveis.isin(respondeu_pos)
    sim, nao = elegiveis[respondeu], elegiveis[~respondeu]
    variaveis = {c: e_pre.reindex(columns=[c])[c] for c in ['K', 'UES'] + list(HEXAD)}  # UES: só C1 = Sim
    variaveis.update({c: uso_janela.reindex(columns=[c])[c] for c in ['aulas_concluidas', 'dias_ativos']})
    linhas = []
    for nome, v in variaveis.items():
        a, b = v.reindex(sim).dropna(), v.reindex(nao).dropna()
        u, p, r = mann_whitney(a, b)
        linhas.append({'variavel': nome, 'n_respondeu': len(a), 'mediana_respondeu': a.median(),
                       'n_nao_respondeu': len(b), 'mediana_nao_respondeu': b.median(), 'U': u, 'p': p, 'r': r})
    return {'elegiveis': len(elegiveis), 'responderam': int(respondeu.sum()), 'tabela': pd.DataFrame(linhas)}


def spearman_parcial(x, y, z):
    """Spearman entre x e y controlando z: Pearson dos resíduos dos postos de x e de y regredidos nos postos de z.
    Devolve (n, rho, p), com p bilateral por t e gl = n − 3; n < 6 ou variável constante: (n, NaN, NaN)."""
    par = pd.concat([x, y, z], axis=1, join='inner').dropna()
    n = len(par)
    if n < 6 or (par.nunique() < 2).any():
        return n, np.nan, np.nan
    postos = par.rank().to_numpy()
    zc = postos[:, 2] - postos[:, 2].mean()

    def residuo(a):
        ac = a - a.mean()
        return ac - (ac @ zc) / (zc @ zc) * zc

    rx, ry = residuo(postos[:, 0]), residuo(postos[:, 1])
    if np.allclose(rx, 0) or np.allclose(ry, 0):
        return n, np.nan, np.nan
    rho = float(rx @ ry / np.sqrt((rx @ rx) * (ry @ ry)))
    t = rho * np.sqrt((n - 3) / max(1 - rho ** 2, 1e-300))
    return n, rho, float(2 * stats.t.sf(abs(t), n - 3))


def correlacoes_conhecimento(delta_k, f, dias):
    """Exploratório: variação do conhecimento × uso até o pós, controlando os dias entre o pré e o pós."""
    linhas = []
    for x in ['aulas_concluidas', 'dias_ativos']:
        par = pd.concat([f[x], delta_k.rename('delta_K'), dias.rename('dias_entre')], axis=1, join='inner').dropna()
        n, rho_parcial, p = spearman_parcial(par[x], par.delta_K, par.dias_entre)
        linhas.append({'x': x, 'y': 'delta_K', 'controle': 'dias_entre', 'n': n,
                       'rho_simples': spearman(par[x], par.delta_K)[1], 'rho_parcial': rho_parcial, 'p': p})
    return pd.DataFrame(linhas, columns=['x', 'y', 'controle', 'n', 'rho_simples', 'rho_parcial', 'p'])


def mann_whitney(a, b):
    """U bilateral (a × b) e rank-biserial 2U/(n1·n2) − 1 (positivo: a maior). Grupo com < 2 ou tudo igual: NaN."""
    a, b = pd.Series(a, dtype=float).dropna(), pd.Series(b, dtype=float).dropna()
    if len(a) < 2 or len(b) < 2 or pd.concat([a, b]).nunique() < 2:
        return np.nan, np.nan, np.nan
    u, p = stats.mannwhitneyu(a, b, alternative='two-sided')
    return float(u), float(p), 2 * u / (len(a) * len(b)) - 1


def tipo_dominante(e_pre):
    """Tipo Hexad de maior soma; empate entre os maiores = 'Empate'; sem algum escore = NaN."""
    h = e_pre.reindex(columns=list(HEXAD))
    maximo = h.max(axis=1)
    tipo = h.fillna(-np.inf).idxmax(axis=1).where(h.eq(maximo, axis=0).sum(axis=1) == 1, 'Empate')
    return tipo.where(h.notna().all(axis=1)).rename('tipo_dominante')


def hexad_mot(e_pre, mot, pos_validos):
    """Descritivo: tipo Hexad dominante × recurso mais motivador, e a média de cada tipo por opção de MOT, entre os
    pós válidos (todas as opções, mesmo zeradas)."""
    tipo = tipo_dominante(e_pre).reindex(pos_validos).fillna('sem Hexad')
    escolha = mot.reindex(pos_validos).fillna('sem resposta')
    tabela = pd.crosstab(tipo, escolha).reindex(index=list(HEXAD) + ['Empate', 'sem Hexad'],
                                                columns=OPCOES['MOT'] + ['sem resposta'], fill_value=0)
    medias = e_pre.reindex(pos_validos)[list(HEXAD)].groupby(escolha).mean().reindex(OPCOES['MOT'])
    medias['n'] = escolha.value_counts().reindex(OPCOES['MOT'], fill_value=0)
    return tabela.rename_axis(index='tipo_dominante', columns='MOT'), medias.rename_axis('MOT')


# Tondello et al. (2016, p. 231). Filantropo e Espírito livre ficam sem par: o app não tem os elementos associados a
# eles (compartilhar conhecimento e presentear; exploração, jogo não linear e personalização).
PARES_HEXAD_USO = [
    ('Jogador', 'pontos', 'Players: "points, rewards or prizes, leaderboards, badges or achievements"'),
    ('Jogador', 'badges', 'idem'),
    ('Jogador', 'visitas_ranking', 'idem'),
    ('Socializador', 'visitas_ranking', 'Socialisers: "social comparison, social competition"'),
    ('Conquistador', 'aulas_concluidas', 'Achievers: "learning new skills, quests, levels or progression"'),
]


# Pontos e badges vêm quase só das aulas (a trivia só libera após as 15): com |ρ| com aulas_concluidas a partir
# daqui, o par mede o mesmo que Conquistador × aulas_concluidas. Marcado, não removido (pares definidos antes).
LIMITE_REDUNDANTE = 0.9


def hexad_centrado(e_pre):
    """Soma de cada tipo Hexad menos a média das 5 somas da mesma pessoa (tira efeito teto e aquiescência).
    Só para quem tem os 5 escores; os demais ficam NaN."""
    h = e_pre.reindex(columns=list(HEXAD))
    return h.sub(h.mean(axis=1), axis=0).where(h.notna().all(axis=1))


def hexad_uso(e_pre, f):
    """Exploratório: soma de cada tipo Hexad do pré × uso até o pós, só nos 5 pares de PARES_HEXAD_USO.
    rho_rel/p_rel: o mesmo com o escore centrado na pessoa (hexad_centrado).
    rho_aulas: Spearman do uso do par com aulas_concluidas, nas mesmas pessoas do par (NaN no par das aulas)."""
    rel = hexad_centrado(e_pre)
    linhas = []
    for tipo, uso, base in PARES_HEXAD_USO:
        n, rho, p = spearman(e_pre[tipo], f[uso]) if tipo in e_pre and uso in f else (0, np.nan, np.nan)
        n_rel, rho_rel, p_rel = spearman(rel[tipo], f[uso]) if tipo in e_pre and uso in f else (0, np.nan, np.nan)
        rho_aulas = (spearman(f[uso].reindex(e_pre[tipo].dropna().index), f['aulas_concluidas'])[1]
                     if uso != 'aulas_concluidas' and tipo in e_pre and uso in f and 'aulas_concluidas' in f
                     else np.nan)
        linhas.append({'tipo': tipo, 'uso': uso, 'base': base, 'n': n, 'rho': rho, 'p': p, 'n_rel': n_rel,
                       'rho_rel': rho_rel, 'p_rel': p_rel, 'rho_aulas': rho_aulas,
                       'redundante': abs(rho_aulas) >= LIMITE_REDUNDANTE})
    return pd.DataFrame(linhas, columns=['tipo', 'uso', 'base', 'n', 'rho', 'p', 'n_rel', 'rho_rel', 'p_rel',
                                         'rho_aulas', 'redundante'])


def niveis_k(perfil_pre, perfil_pos, pares):
    """Descritivo: quantos em cada nível no pré e no pós e a transição de nível entre os pareados."""
    contagem = pd.DataFrame({'pre': perfil_pre.nivel.value_counts(), 'pos': perfil_pos.nivel.value_counts()}) \
        .reindex(NIVEIS_K).fillna(0).astype(int).rename_axis('nivel')
    juntos = perfil_pre.nivel.to_frame('pre').join(perfil_pos.nivel.rename('pos'), how='inner').reindex(pares).dropna()
    transicao = pd.crosstab(juntos.pre, juntos.pos).reindex(index=NIVEIS_K, columns=NIVEIS_K, fill_value=0)
    return contagem, transicao.rename_axis(index='nivel_pre', columns='nivel_pos')


def conhecimento_por_grupo(perfil_pre, bruto_pre, tipo):
    """Descritivo: acertos no pré (mediana, % no nível alto) por treinamento anterior, idade, escolaridade, jogos
    e tipo Hexad dominante."""
    grupos = {f'{c} {nome}': (coluna(bruto_pre, c).map(dict(enumerate(OPCOES[c]))), OPCOES[c])
              for c, nome in [('C1', 'treinamento anterior'), ('A1', 'idade'), ('A3', 'escolaridade'),
                              ('A5', 'jogos digitais')]}
    grupos['tipo Hexad dominante'] = (tipo, list(HEXAD) + ['Empate'])
    linhas = []
    for nome, (g, ordem) in grupos.items():
        juntos = perfil_pre.join(g.rename('grupo'), how='inner')
        for valor in ordem:  # na ordem das opções do questionário
            t = juntos[juntos.grupo == valor]
            if t.empty:
                continue
            linhas.append({'variavel': nome, 'grupo': valor, 'n': len(t), 'mediana_acertos': t.acertos.median(),
                           'pct_nivel_alto': 100 * (t.nivel == NIVEIS_K[-1]).mean(),
                           'pct_nao_sei': 100 * t.nao_sei.sum() / (7 * len(t))})
    return pd.DataFrame(linhas, columns=['variavel', 'grupo', 'n', 'mediana_acertos', 'pct_nivel_alto', 'pct_nao_sei'])


def correlacoes_gam(perc):
    """Os 2 Spearman do resumo: o que a pessoa diz do recurso × o uso registrado dele."""
    linhas = []
    for x, y in [('GAM2', 'visitas_ranking'), ('GAM1', 'pontos')]:
        n, rho, p = spearman(perc[x], perc[y]) if {x, y} <= set(perc) else (0, np.nan, np.nan)
        linhas.append({'x': x, 'y': y, 'n': n, 'rho': rho, 'p': p})
    return pd.DataFrame(linhas)


def citacoes(abertas, faixa, n=4):
    """Até `n` trechos de ABR1/ABR2, um de cada faixa de uso por vez, alternando ABR1 e ABR2."""
    t = abertas.assign(faixa=abertas.participante.map(faixa)).dropna(subset=['faixa'])
    t = t[t.valor.astype(str).str.strip() != ''].sort_values(['participante', 'item'])
    escolhidas, usados = [], set()
    while len(escolhidas) < n:
        antes = len(escolhidas)
        for fx in FAIXAS:
            candidatos = t[(t.faixa == fx) & ~t.participante.isin(usados)]
            item = ['ABR1', 'ABR2'][len(escolhidas) % 2]
            if (candidatos.item == item).any():
                candidatos = candidatos[candidatos.item == item]
            if len(candidatos) and len(escolhidas) < n:
                escolhidas.append(candidatos.iloc[0])
                usados.add(candidatos.iloc[0].participante)
        if len(escolhidas) == antes:
            break
    return pd.DataFrame(escolhidas, columns=['participante', 'item', 'valor', 'faixa'])


def frequencias(t, itens, momento, excluir=None):
    linhas = []
    for item in itens:
        if item not in t:
            continue
        v = t[item].dropna()
        if excluir and item in excluir:
            v = v[v != excluir[item]]
        for pos, rotulo in enumerate(ITENS.loc[(momento, item), 'opcoes']):
            linhas.append({'item': item, 'opcao': rotulo, 'n': int((v == pos).sum()),
                           'pct': 100 * (v == pos).mean() if len(v) else np.nan})
    return pd.DataFrame(linhas)


def plataformas(multi, ids):
    """A6: % de pessoas que marcou cada plataforma e quantidade de plataformas por pessoa ("Nenhuma" = 0)."""
    a6 = multi[(multi.item == 'A6') & multi.participante.isin(ids)]
    respondeu = a6.participante.nunique()
    n = [a6.participante[a6.valor == v].nunique() for v in range(len(OPCOES['A6']))]
    contagem = pd.DataFrame({'item': 'A6', 'opcao': OPCOES['A6'], 'n': n,
                             'pct': [100 * x / respondeu if respondeu else np.nan for x in n]})
    qtd = a6[a6.valor != NENHUMA].groupby('participante').size()
    return contagem, qtd.reindex(pd.Index(a6.participante.unique()), fill_value=0).rename('A6_qtd')


def descritivas_gam(bruto_pos):
    linhas = []
    for item in GAM:
        if item not in bruto_pos:
            continue
        v = bruto_pos[item].dropna()
        validos = v[v > 0]
        linhas.append({'item': item, 'n': len(v), 'pct_nao_usei': 100 * (v == 0).mean() if len(v) else np.nan,
                       'pct_concordancia': 100 * (validos >= 4).mean() if len(validos) else np.nan,
                       'mediana': validos.median()})
    return pd.DataFrame(linhas)


# ---------------------------------------------------------------- gráficos (paleta de referência do dataviz)

AZUL, LARANJA, TINTA, TINTA_2, GRADE = '#2a78d6', '#eb6834', '#0b0b0b', '#52514e', '#e1e0d9'


def _eixos(ax):
    ax.spines[['top', 'right']].set_visible(False)
    ax.spines[['left', 'bottom']].set_color('#c3c2b7')
    ax.tick_params(colors=TINTA_2)
    ax.grid(axis='y', color=GRADE, linewidth=0.6)
    ax.set_axisbelow(True)


def grafico_ues(e_pre, e_pos, arquivo):
    medidas = list(UES) + ['UES']
    fig, eixos = plt.subplots(1, len(medidas), figsize=(12, 3.6), sharey=True)
    for ax, m in zip(eixos, medidas):
        par = pd.concat([e_pre[m], e_pos[m]], axis=1, keys=['pre', 'pos'], join='inner').dropna()
        for _, lin in par.iterrows():
            ax.plot([0, 1], lin, color=GRADE, linewidth=1)
        if len(par):
            ax.plot([0, 1], par.median(), color=TINTA, linewidth=2, marker='o', markersize=8, label='mediana')
        ax.set_xticks([0, 1], ['Pré', 'Pós'])
        ax.set_xlim(-0.3, 1.3)
        ax.set_title(f'{"UES geral" if m == "UES" else m} (n={len(par)})', color=TINTA, fontsize=10)
        _eixos(ax)
    eixos[0].set_ylim(0.8, 5.2)
    eixos[0].set_ylabel('Média dos itens (1 a 5)')
    if eixos[-1].get_legend_handles_labels()[0]:
        eixos[-1].legend(frameon=False, loc='lower right')
    fig.suptitle('UES pareada: treinamento anterior (pré) × app (pós)', color=TINTA)
    fig.tight_layout()
    fig.savefig(arquivo, dpi=150)
    plt.close(fig)


def grafico_fluxo(fluxo, arquivo):
    etapas = fluxo[~fluxo.etapa.str.startswith((' ', 'envios')) & fluxo.n.notna()]
    fig, ax = plt.subplots(figsize=(7, 3))
    barras = ax.barh(etapas.etapa, etapas.n.astype(float), color=AZUL, height=0.5)
    ax.bar_label(barras, fmt='%.0f', padding=3, color=TINTA_2, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel('Participantes')
    _eixos(ax)
    ax.grid(axis='y', visible=False)
    ax.grid(axis='x', color=GRADE, linewidth=0.6)
    ax.set_title('Fluxo da amostra', color=TINTA)
    fig.tight_layout()
    fig.savefig(arquivo, dpi=150)
    plt.close(fig)


def grafico_gam(gam, arquivo):
    fig, ax = plt.subplots(figsize=(7, 4))
    y = np.arange(len(gam))
    for desl, col, cor, rot in [(-0.2, 'pct_concordancia', AZUL, '% concordância'),
                                (0.2, 'pct_nao_usei', LARANJA, '% "não usei"')]:
        barras = ax.barh(y + desl, gam[col].fillna(0), height=0.36, color=cor, label=rot)
        ax.bar_label(barras, fmt='%.0f%%', padding=3, color=TINTA_2, fontsize=8)
    ax.set_yticks(y, gam.item)
    ax.invert_yaxis()
    ax.set_xlim(0, 110)
    _eixos(ax)
    ax.grid(axis='y', visible=False)
    ax.grid(axis='x', color=GRADE, linewidth=0.6)
    ax.legend(frameon=False, loc='lower right')
    ax.set_title('Recursos do app: concordância e "não usei"', color=TINTA)
    fig.tight_layout()
    fig.savefig(arquivo, dpi=150)
    plt.close(fig)


def grafico_k(mud, arquivo):
    fig, ax = plt.subplots(figsize=(8, 4))
    y = np.arange(len(mud))
    for desl, col, cor, rot in [(-0.2, 'pct_acerto_pre', AZUL, 'Pré'), (0.2, 'pct_acerto_pos', LARANJA, 'Pós')]:
        barras = ax.barh(y + desl, mud[col].fillna(0), height=0.36, color=cor, label=rot)
        ax.bar_label(barras, fmt='%.0f%%', padding=3, color=TINTA_2, fontsize=8)
    ax.set_yticks(y, [f'{i} {ar} (aula {a})' for i, ar, a in zip(mud.item, mud.area, mud.aulas)])
    ax.invert_yaxis()
    ax.set_xlim(0, 110)
    ax.set_xlabel('% de acerto')
    _eixos(ax)
    ax.grid(axis='y', visible=False)
    ax.grid(axis='x', color=GRADE, linewidth=0.6)
    ax.legend(frameon=False, loc='lower right')
    ax.set_title('Conhecimento: acerto por situação, pré × pós', color=TINTA)
    fig.tight_layout()
    fig.savefig(arquivo, dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------- resumo

def formatar_p(p):
    return '' if pd.isna(p) else '< 0.001' if p < 0.001 else f'{p:.3f}'


def p_frase(p):
    texto = formatar_p(p)
    return texto if texto.startswith('<') else f'= {texto}'


def tabela_md(t, cols=None):
    if t is None or len(t) == 0:
        return '_(sem dados)_\n'
    t = (t.reindex(columns=cols) if cols else t).copy()
    for c in t.select_dtypes('number'):
        t[c] = t[c].map(formatar_p if c == 'p' or c.startswith('p_') else
                        lambda v: '' if pd.isna(v) else f'{v:.3f}'.rstrip('0').rstrip('.'))
    linhas = ['| ' + ' | '.join(map(str, t.columns)) + ' |', '|' + '---|' * t.shape[1]]
    linhas += ['| ' + ' | '.join('' if pd.isna(v) else str(v) for v in lin) + ' |' for lin in t.itertuples(False)]
    return '\n'.join(linhas) + '\n'


def escrever_apendice(arquivo, r):
    md = ['# Apêndice da análise\n', '## Exclusões por regra\n', tabela_md(r['exclusoes']),
          '\n## Confiabilidade (α de Cronbach)\n', tabela_md(r['confiabilidade']),
          '\n## Hexad: média da soma por tipo (2 a 14), só descritivo\n',
          tabela_md(r['hexad'].rename('media').rename_axis('tipo').reset_index()),
          '\n## Anamnese e treinamento anterior\n', tabela_md(r['anamnese'])]
    if 'aviso' in r:
        md.append(f"\n{r['aviso']}: só as descritivas do pré.\n")
        Path(arquivo).write_text('\n'.join(md), encoding='utf-8')
        return
    md += ['\n## Testes principais (Wilcoxon pareado, Holm entre os dois)\n', tabela_md(r['antes_depois']),
           '\n## Subescalas da UES (medianas)\n', tabela_md(r['ues_subescalas']),
           '\n## CMP (com "não lembro")\n', tabela_md(r['cmp_completo']),
           '\n## Conhecimento por situação (McNemar exato: exploratório, sem correção)\n',
           tabela_md(r['mudanca_k']),
           '\n## Nível e perfil de conhecimento (descritivo)\n',
           'Nível pelos acertos nas 7 situações: baixo 0–2, médio 3–4, alto 5–7 (faixas fixas). Padrão do '
           'erro: "erra com confiança" = mais respostas erradas "responsáveis" que "Não sei"; "admite não '
           'saber" = o contrário.\n', tabela_md(r['niveis_k'].reset_index()),
           '\nTransição de nível entre os pareados (linhas = pré, colunas = pós):\n',
           tabela_md(r['transicao_k'].reset_index()),
           '\nPadrão do erro no pré:\n',
           tabela_md(r['perfil_k']['pre'].padrao.value_counts().rename('n').rename_axis('padrao').reset_index()),
           '\nAcertos no pré por perfil do participante:\n', tabela_md(r['k_por_grupo']),
           '\n## Ganho nos itens das aulas concluídas × não concluídas '
           '(complementar, exploratório, fora da correção de Holm)\n',
           tabela_md(r['cobertura_teste']),
           '\n## Recursos do app (GAM; % sobre a resposta original, sem inverter)\n', tabela_md(r['gam']),
           '\n## Recurso mais motivador (MOT)\n', tabela_md(r['mot'].rename('n').rename_axis('MOT').reset_index()),
           '\n## Uso até o pós por faixa\n', tabela_md(r['faixas'].reset_index()),
           '\n## Spearman (exploratório, sem correção)\n', tabela_md(r['correlacoes_gam'])]
    md += ['\n## Variação do conhecimento × uso até o pós, controlando os dias entre os questionários '
           '(Spearman parcial; exploratório, sem correção)\n', tabela_md(r['correlacoes_conhecimento']),
           f"\n## Viés de abandono (exploratório, sem correção; {r['abandono']['responderam']} de "
           f"{r['abandono']['elegiveis']} elegíveis responderam o pós)\n",
           'Mann-Whitney bilateral; r = rank-biserial (positivo: quem respondeu tem valor maior). Uso dos dois '
           'grupos na mesma janela: da 1ª atividade até a liberação do pós (pré + 14 dias). UES só de quem fez '
           'treinamento (C1 = Sim).\n', tabela_md(r['abandono']['tabela']),
           '\n## Tipo Hexad dominante × recurso mais motivador (exploratório e descritivo, sem teste)\n',
           tabela_md(r['hexad_mot'].reset_index()),
           '\nMédia de cada tipo Hexad (soma de 2 a 14) por opção de MOT:\n',
           tabela_md(r['hexad_mot_medias'].reset_index()),
           '\n## Perfil Hexad × uso registrado (Spearman)\n',
           'Ainda não descrito no texto do TCC; os autores decidem se entra. Exploratório, sem correção; pares '
           'definidos antes pela literatura (Tondello et al., 2016, p. 231).\n', tabela_md(r['hexad_uso']),
           f'\nrho_aulas: Spearman entre o uso do par e as aulas concluídas; redundante quando |rho_aulas| >= '
           f'{LIMITE_REDUNDANTE}. Par marcado como redundante não é evidência independente de Conquistador × '
           'aulas concluídas: pontos e badges vêm quase só das aulas (a trivia só libera depois das 15).\n',
           '\nn, rho e p usam a soma bruta de cada tipo; n_rel, rho_rel e p_rel, o escore centrado na pessoa (soma do '
           'tipo menos a média das 5 somas dela, só para quem tem os 5). O centrado tira o nível geral de '
           'concordância da pessoa (efeito teto e aquiescência); os dois são exploratórios.\n',
           '\nFilantropo e Espírito livre ficam sem par: os elementos que a fonte associa a eles (compartilhar '
           'conhecimento e presentear; tarefas exploratórias, jogo não linear e personalização) não existem no '
           'app.\n']
    Path(arquivo).write_text('\n'.join(md) + '\n', encoding='utf-8')


def frase_efeito(lin, quem, o_que):
    """Frase simples de um teste pareado: direção, medianas, efeito em palavras e IC."""
    if pd.isna(lin.p):
        return f'{o_que}: sem teste (n = {lin.n_pares}).'
    claro = pd.notna(lin.p_holm) and lin.p_holm < 0.05
    sentido = ('subiu' if lin.r_rank_biserial > 0 else 'caiu') if claro else 'não mudou de forma clara'
    ic = f', IC 95% de {lin.r_ic95_inf:+.2f} a {lin.r_ic95_sup:+.2f}' if pd.notna(lin.r_ic95_inf) else ''
    return (f'Entre {quem} (n = {lin.n_pares}), {o_que} {sentido}: mediana de {lin.mediana_pre:.2f} para '
            f'{lin.mediana_pos:.2f}. Efeito {porte(lin.r_rank_biserial)} (r = {lin.r_rank_biserial:+.2f}{ic}; '
            f'p Holm {p_frase(lin.p_holm)}).')


def montar_fluxo(cadastros, largo, bruto, duplicatas, contaminados=(), pares=None, sem_ues=None, ad=None):
    """Fluxo da amostra; cada linha recuada (−) sai da etapa de cima. Envios repetidos só informam."""
    pos_validos = bruto['pos'].index
    linhas = [('cadastros (consentiram)', cadastros), ('responderam o pré', len(largo['pre'])),
              ('  − errou o ATN no pré', len(largo['pre']) - len(bruto['pre'])), ('pré válido', len(bruto['pre'])),
              ('responderam o pós', len(largo['pos'])),
              ('  − errou o ATN no pós', len(largo['pos']) - len(pos_validos)), ('pós válido', len(pos_validos))]
    if pares is not None:
        tardios = len(pos_validos.intersection(contaminados))
        ues = ad.set_index('medida').n_pares.get('UES') if ad is not None and len(ad) else None
        linhas += [('  − pré depois da 1ª atividade no app', tardios),
                   ('  − sem pré válido', len(pos_validos) - tardios - len(pares)),
                   ('pares pré × pós', len(pares)), ('  − sem UES pareada (C1 ≠ Sim)', sem_ues),
                   ('pares com UES', ues)]
    linhas.append(('envios repetidos descartados (vale o primeiro)', duplicatas))
    return pd.DataFrame(linhas, columns=['etapa', 'n'])


CAUSA = 'Sem grupo de controle: é associação, não causa.'
PROTECAO = r"^'(?=[=+@\t\r-])"  # apóstrofo da exportação antes de texto que o Excel leria como fórmula
BLOCOS = ['## 1. Amostra e qualidade dos dados', '## 2. Engajamento e percepção', '## 3. Conhecimento',
          '## 4. Gamificação e uso']


def escrever_resumo_tcc(arquivo, r):
    """Resumo para o TCC em 4 blocos (amostra, engajamento e percepção, conhecimento, gamificação e uso)."""
    md = ['# Avaliação do Guardião Impacta: resumo para o TCC\n',
          'Gerado pelo analise.py a partir dos dados da pasta; tabelas completas em apendice.md. '
          + CAUSA + '\n',
          BLOCOS[0] + '\n', tabela_md(r['fluxo']), '![Fluxo da amostra](fluxo.png)\n']
    alfa = r['confiabilidade'].query('escala == "UES geral"')
    if len(alfa):
        md.append('Confiabilidade da UES geral (α de Cronbach): '
                  + '; '.join(f'{lin.momento} {lin.alfa:.2f} (n = {lin.n})' for lin in alfa.itertuples()) + '.')
    if r['hexad'].notna().any():
        md.append('Hexad, só para descrever a amostra (média da soma por tipo, de 2 a 14): '
                  + ', '.join(f'{t} {v:.1f}' for t, v in r['hexad'].items()) + '.')
    ab = r.get('abandono')
    if ab:
        maiores = ab['tabela'].dropna(subset=['r']).sort_values('r', key=abs, ascending=False).head(2)
        md.append(f"Abandono: {ab['responderam']} de {ab['elegiveis']} elegíveis responderam o pós."
                  + (' Maiores diferenças entre quem respondeu e quem não respondeu (uso na mesma janela, até 14 '
                     'dias após o pré): ' + '; '.join(f'{lin.variavel} r = {lin.r:+.2f} ({porte(lin.r)}; medianas '
                                                 f'{lin.mediana_respondeu:.1f} × {lin.mediana_nao_respondeu:.1f})'
                                                 for lin in maiores.itertuples())
                     + ' (exploratório, sem correção).' if len(maiores) else ''))
    marc = r['marcados'].bloco.value_counts()
    if len(marc):
        md.append('Resposta uniforme (mesma nota em todos os itens do bloco): '
                  + ', '.join(f'{b} {n}' for b, n in marc.items())
                  + '. Só marcado, não excluído (lista em marcados.csv).')
    if 'aviso' in r:
        md.append(f"\n{r['aviso']}: só as descritivas do pré.\n")
        Path(arquivo).write_text('\n'.join(md) + '\n', encoding='utf-8')
        return

    ad = r['antes_depois'].set_index('medida', drop=False)
    md.append('\n' + BLOCOS[1] + '\n')
    ues = pd.concat([ad.loc[['UES']] if 'UES' in ad.index else None, r['ues_subescalas']])
    md.append(tabela_md(ues.replace({'medida': {'UES': 'UES geral'}}),
                        ['medida', 'n_pares', 'mediana_pre', 'mediana_pos', 'r_rank_biserial', 'r_ic95_inf',
                         'r_ic95_sup', 'p_holm']))
    md.append('![UES pareada](ues_pre_pos.png)\n')
    md.append(frase_efeito(ad.loc['UES'], 'quem já tinha feito treinamento', 'o engajamento (UES geral)')
              if 'UES' in ad.index else 'Ninguém com C1 = Sim e UES nos dois momentos: sem comparação.')
    cmp = r['cmp']
    if len(cmp) and cmp.n.sum():
        md.append('Comparado ao treinamento anterior (CMP, sem "não lembro"), o app foi: '
                  + ', '.join(f'{lin.opcao} {lin.pct:.0f}%' for lin in cmp.itertuples()) + '.')
    md.append('O pré avalia o treinamento anterior e o pós, o app: são experiências diferentes, então é '
              'associação, não causa. Subescalas só descritivas.\n')

    md.append('\n' + BLOCOS[2] + '\n')
    md.append(tabela_md(r['mudanca_k'], ['item', 'area', 'n', 'pct_acerto_pre', 'pct_acerto_pos', 'pct_erro_pre',
                                         'pct_erro_pos', 'pct_nao_sei_pre', 'pct_nao_sei_pos']))
    md.append('![Conhecimento por item](conhecimento_por_item.png)\n')
    if 'K' in ad.index:
        md.append(frase_efeito(ad.loc['K'], 'os pareados', 'o conhecimento (acertos nas 7 situações, de 0 a 7)'))
    niv, pk = r['niveis_k'], r['perfil_k']['pre']
    if niv.to_numpy().sum():
        padrao = pk.padrao.value_counts()
        md.append('Nível de conhecimento (descritivo; acertos baixo 0–2, médio 3–4, alto 5–7): no pré, '
                  + ', '.join(f'{nivel} {n}' for nivel, n in niv.pre.items()) + '; no pós, '
                  + ', '.join(f'{nivel} {n}' for nivel, n in niv.pos.items()) + '. No pré, quem errou mais '
                  f"escolheu uma opção \"responsável\" errada ({padrao.get('erra com confiança', 0)}) ou "
                  f"admitiu não saber ({padrao.get('admite não saber', 0)}); perfis por grupo no apêndice.")
    cob = r['cobertura_teste']
    if len(cob) and cob.n_pares.iloc[0]:
        c = cob.iloc[0]
        md.append(f'Complementar (exploratório, fora da correção de Holm): dentro da mesma pessoa '
                  f'(n = {c.n_pares}), o ganho nos itens das aulas que ela concluiu teve '
                  f'mediana {c.mediana_concluidas:+.2f}, contra {c.mediana_nao_concluidas:+.2f} nos demais'
                  + (f': efeito {porte(c.r_rank_biserial)} (r = {c.r_rank_biserial:+.2f}'
                     + (f', IC 95% de {c.r_ic95_inf:+.2f} a {c.r_ic95_sup:+.2f}' if pd.notna(c.r_ic95_inf) else '')
                     + ').' if pd.notna(c.r_rank_biserial) else '.'))
    cc = r['correlacoes_conhecimento'].dropna(subset=['rho_parcial'])
    if len(cc):
        md.append('Variação do conhecimento × uso até o pós, controlando os dias entre os questionários '
                  '(Spearman parcial): '
                  + '; '.join(f'{lin.x} ρ = {lin.rho_parcial:+.2f} ({porte(lin.rho_parcial)}, n = {lin.n})'
                              for lin in cc.itertuples()) + ' (exploratório, sem correção).')
    md.append('Responder o mesmo teste duas vezes também pode melhorar a nota; a comparação dentro da pessoa ajuda '
              'a separar isso; é associação, não causa.\n')

    md.append('\n' + BLOCOS[3] + '\n')
    md.append(tabela_md(r['gam'], ['item', 'n', 'pct_concordancia', 'pct_nao_usei']))
    md.append('![Recursos do app](gam.png)\n')
    mot = r['mot'][r['mot'] > 0]
    if len(mot):
        md.append('Recurso que mais motivou (MOT): ' + ', '.join(f'{k} {v}' for k, v in mot.items()) + '.')
    fx = r['faixas']
    md.append(f"Uso até o pós ({int(fx.n.sum())} participantes): mediana de {r['uso'].dias_ativos:.0f} dias ativos "
              f"e {r['uso'].aulas_concluidas:.0f} aulas concluídas; por faixa de aulas, "
              + ', '.join(f'{nome}: {int(n)}' for nome, n in fx.n.items()) + '.')
    frases = [f'{lin.x} × {lin.y}: ρ = {lin.rho:+.2f} ({porte(lin.rho)}, n = {lin.n})'
              for lin in r['correlacoes_gam'].itertuples() if pd.notna(lin.rho)]
    md.append(('O que a pessoa diz acompanha o uso? ' + '; '.join(frases) + '. ' if frases else '')
              + 'Exploratório; associação, não causa.')
    md.append('Tipo Hexad dominante × recurso mais motivador e perfil Hexad × uso registrado: tabelas no apêndice '
              '(exploratório e descritivo, sem teste para o MOT e sem correção para o uso; o perfil × uso ainda '
              'não está descrito no texto do TCC).'
              + (f' No perfil × uso, {red} par(es) redundante(s) com as aulas concluídas (|ρ| >= {LIMITE_REDUNDANTE}'
                 '): não é evidência independente de Conquistador × aulas.'
                 if (red := int(r['hexad_uso'].redundante.sum())) else ''))
    if len(r['citacoes']):
        md.append('\nO que disseram (escolhidas por faixa de uso):\n')
        # Sem o apóstrofo que a exportação põe para o Excel não ler o texto como fórmula.
        md += [f'- "{re.sub(PROTECAO, "", str(lin.valor))}" ({lin.item}, faixa {lin.faixa} aulas)'
               for lin in r['citacoes'].itertuples()]
    Path(arquivo).write_text('\n'.join(md) + '\n', encoding='utf-8')


# ---------------------------------------------------------------- principal

def sem_formula(texto):
    # O CSV das abertas é aberto no Excel: mesma regra da exportação (backend/src/modulos/admin/pesquisa.js), em que
    # = + @ tab CR, ou - que não é número, ganham apóstrofo. Já protegido (começa com '): fica como está.
    t = str(texto)
    perigoso = t[:1] in ('=', '+', '@', '\t', '\r') or (t.startswith('-') and not re.fullmatch(r'-\d+(\.\d+)?', t))
    return f"'{t}" if perigoso else texto


def main(dados):
    dados = Path(dados)
    saida = dados / 'saida'
    saida.mkdir(exist_ok=True)
    largo, multi, textos, envios, duplicatas = ler_questionario(dados)
    if largo['pre'].empty:
        raise ValueError('O questionário não tem respostas do pré (momento = pre).')
    r = {}

    bruto = {}
    exclusoes = [{'regra': 'envio repetido (vale o primeiro)', 'momento': 'pre e pos', 'n': duplicatas, 'de': np.nan}]
    for m in ['pre', 'pos']:
        bruto[m], excluidos = filtrar_atencao(largo[m])
        exclusoes.append({'regra': 'errou o ATN', 'momento': m, 'n': excluidos, 'de': len(largo[m])})
    lim = {m: limpar(bruto[m], m) for m in bruto}
    esc = {m: escores(lim[m], m) for m in lim}
    # Resposta uniforme: só marcada (lista em marcados.csv), sem excluir ninguém.
    r['marcados'] = pd.concat([respostas_uniformes(bruto[m], m) for m in bruto], ignore_index=True)
    r['marcados'].to_csv(saida / 'marcados.csv', index=False)
    for bloco, momento in [('Hexad', 'pre'), ('UES', 'pre e pos')]:
        exclusoes.append({'regra': f'resposta uniforme na {bloco} (só marcado, não excluído)', 'momento': momento,
                          'n': int((r['marcados'].bloco == bloco).sum()), 'de': np.nan})

    # Descritivas do pré.
    anamnese = frequencias(bruto['pre'], ['A1', 'A2', 'A3', 'A4', 'A5', 'C1', 'C2', 'C3', 'C4'], 'pre')
    a6, a6_qtd = plataformas(multi, bruto['pre'].index)
    r['anamnese'] = pd.concat([anamnese, a6])
    r['anamnese'].to_csv(saida / 'descritiva_anamnese.csv', index=False)
    a6_qtd.value_counts().sort_index().rename_axis('plataformas').rename('n').to_csv(saida / 'descritiva_a6_qtd.csv')
    esc['pre'].describe().T.to_csv(saida / 'escores_pre_descritiva.csv')
    r['hexad'] = esc['pre'][list(HEXAD)].mean()
    r['hexad'].rename('media').to_csv(saida / 'hexad_medias.csv')
    r['confiabilidade'] = confiabilidade(lim['pre'], lim['pos'] if not bruto['pos'].empty else None)
    r['confiabilidade'].to_csv(saida / 'confiabilidade.csv', index=False)

    def escrever(cadastros=np.nan, **fluxo):
        r['exclusoes'] = pd.DataFrame(exclusoes)
        r['exclusoes'].to_csv(saida / 'exclusoes.csv', index=False)
        r['fluxo'] = montar_fluxo(cadastros, largo, bruto, duplicatas, ad=r.get('antes_depois'), **fluxo)
        r['fluxo'].to_csv(saida / 'fluxo.csv', index=False)
        grafico_fluxo(r['fluxo'], saida / 'fluxo.png')
        escrever_resumo_tcc(saida / 'resumo-tcc.md', r)
        escrever_apendice(saida / 'apendice.md', r)
        return r

    def so_pre(aviso, cadastros=np.nan, **fluxo):
        r['aviso'] = aviso
        print(f'{aviso}: só as descritivas do pré.')
        return escrever(cadastros, **fluxo)

    if largo['pos'].empty:
        return so_pre('Sem nenhuma resposta do pós')
    if bruto['pos'].empty:
        return so_pre(f'Todas as {len(largo["pos"])} respostas do pós foram excluídas pelo ATN')

    # Pré enviado depois da 1ª atividade no app: fora do pareamento.
    f, aulas, primeira = features(dados, envios)
    contaminados = pre_contaminado(envios['pre'].reindex(bruto['pre'].index), primeira)
    exclusoes.append({'regra': 'pré depois da 1ª atividade (fora do pareamento)', 'momento': 'pre',
                      'n': len(contaminados), 'de': len(bruto['pre'])})
    lim_pre, e_pre = lim['pre'].drop(contaminados), esc['pre'].drop(contaminados)
    pares = e_pre.index.intersection(esc['pos'].index)
    # Abandono: uso dos dois grupos na mesma janela, da 1ª atividade até a liberação do pós (pré + 14 dias).
    janela, _, _ = features(dados, pd.DataFrame({'pre': envios['pre'], 'pos': envios['pre'] + LIBERA_POS}))
    r['abandono'] = abandono(bruto['pre'].index, envios['pre'], largo['pos'].index, esc['pre'], janela)
    r['abandono']['tabela'].to_csv(saida / 'abandono.csv', index=False)
    if pares.empty:
        return so_pre('Nenhum participante com pré e pós válidos (o pseudônimo é o mesmo nas exportações?)',
                      len(f), contaminados=contaminados, pares=pares)
    sem_ues = int((coluna(bruto['pre'], 'C1').reindex(pares) != SIM).sum())
    exclusoes.append({'regra': 'sem UES pareada (C1 diferente de Sim)', 'momento': 'pre', 'n': sem_ues,
                      'de': len(pares)})
    print('Exclusões:', '; '.join(f'{e["regra"]} ({e["momento"]}): {e["n"]}' for e in exclusoes))

    # Pós: descritivas.
    f.describe().T.to_csv(saida / 'descritiva_comportamento.csv')
    f.to_csv(saida / 'metricas_por_participante.csv')
    sem_app = esc['pos'].index.difference(f.index)
    if len(sem_app):
        print(f'Aviso: {len(sem_app)} participante(s) do questionário sem dados no app.')
    r['cmp_completo'] = frequencias(bruto['pos'], ['CMP'], 'pos')
    cmp = frequencias(bruto['pos'], ['CMP'], 'pos', excluir={'CMP': CMP_NAO_LEMBRO})
    r['cmp'] = cmp[cmp.opcao != OPCOES['CMP'][CMP_NAO_LEMBRO]] if len(cmp) else cmp
    r['cmp'].to_csv(saida / 'descritiva_cmp.csv', index=False)
    r['gam'] = descritivas_gam(bruto['pos'])
    r['gam'].to_csv(saida / 'descritiva_gam.csv', index=False)
    r['mot'] = coluna(bruto['pos'], 'MOT').map(dict(enumerate(OPCOES['MOT']))).value_counts() \
        .reindex(OPCOES['MOT'], fill_value=0)
    r['mot'].rename('n').to_csv(saida / 'descritiva_mot.csv')
    abertas = textos[(textos.momento == 'pos') & textos.participante.isin(bruto['pos'].index)]
    abertas.assign(valor=abertas.valor.map(sem_formula)).rename(columns={'valor': 'texto'}) \
        .drop(columns='momento').to_csv(saida / 'abertas.csv', index=False, encoding='utf-8-sig')

    # Engajamento e conhecimento: os 2 testes principais.
    r['antes_depois'] = antes_depois(e_pre, esc['pos'])
    r['antes_depois'].to_csv(saida / 'antes_depois.csv', index=False)
    print(r['antes_depois'][['medida', 'n_pares', 'mediana_delta', 'r_rank_biserial', 'p_holm']]
          .round(3).to_string(index=False))
    r['ues_subescalas'] = medianas_ues(e_pre, esc['pos'])
    r['ues_subescalas'].to_csv(saida / 'ues_subescalas.csv', index=False)
    r['mudanca_k'] = mudanca_k(lim_pre, lim['pos'])
    r['mudanca_k'].to_csv(saida / 'conhecimento_por_item.csv', index=False)
    # Nível e perfil de conhecimento (descritivo): o pré de todos os válidos e o pós dos válidos.
    r['perfil_k'] = {m: perfil_conhecimento(lim[m]) for m in ['pre', 'pos']}
    r['perfil_k']['pre'].join(r['perfil_k']['pos'], lsuffix='_pre', rsuffix='_pos', how='outer') \
        .to_csv(saida / 'conhecimento_perfil.csv')
    r['niveis_k'], r['transicao_k'] = niveis_k(r['perfil_k']['pre'], r['perfil_k']['pos'], pares)
    r['niveis_k'].to_csv(saida / 'conhecimento_niveis.csv')
    r['transicao_k'].to_csv(saida / 'conhecimento_transicao.csv')
    r['k_por_grupo'] = conhecimento_por_grupo(r['perfil_k']['pre'], bruto['pre'], tipo_dominante(esc['pre']))
    r['k_por_grupo'].to_csv(saida / 'conhecimento_por_grupo.csv', index=False)
    cobertura, r['cobertura_teste'] = ganho_por_cobertura(lim_pre, lim['pos'], aulas)
    cobertura.to_csv(saida / 'ganho_por_cobertura.csv', index=False)
    r['cobertura_teste'].to_csv(saida / 'ganho_por_cobertura_teste.csv', index=False)
    medidas = ['UES', 'K'] + list(UES)
    esc['pos'][medidas].sub(e_pre[medidas]).dropna(how='all').to_csv(saida / 'delta_por_participante.csv')

    # Gamificação e uso (até o pós).
    faixa = faixa_uso(f.aulas_concluidas)
    r['uso'] = f[['dias_ativos', 'aulas_concluidas']].median()
    r['faixas'] = f[['dias_ativos', 'aulas_concluidas']].groupby(faixa).median().reindex(FAIXAS) \
        .assign(n=faixa.value_counts().reindex(FAIXAS, fill_value=0)).rename_axis('faixa_uso')
    r['faixas'].to_csv(saida / 'faixas.csv')
    r['correlacoes_gam'] = correlacoes_gam(colunas(lim['pos'], GAM).join(f[['visitas_ranking', 'pontos']]))
    r['correlacoes_gam'].to_csv(saida / 'correlacoes_gam.csv', index=False)
    r['citacoes'] = citacoes(abertas, faixa)

    # Exploratórios, sem correção (fora do Holm): uso × variação do conhecimento e perfil Hexad × uso.
    dias = ((envios['pos'] - envios['pre']).dt.total_seconds() / 86400).reindex(pares).rename('dias_entre')
    delta_k = (esc['pos'].K - e_pre.K).reindex(pares)
    r['correlacoes_conhecimento'] = correlacoes_conhecimento(delta_k, f, dias)
    r['correlacoes_conhecimento'].to_csv(saida / 'correlacoes_conhecimento.csv', index=False)
    r['hexad_uso'] = hexad_uso(esc['pre'], f)
    r['hexad_uso'].to_csv(saida / 'hexad_uso.csv', index=False)
    # Descritivo: tipo Hexad dominante × recurso mais motivador.
    mot = coluna(bruto['pos'], 'MOT').map(dict(enumerate(OPCOES['MOT'])))
    r['hexad_mot'], r['hexad_mot_medias'] = hexad_mot(esc['pre'], mot, bruto['pos'].index)
    r['hexad_mot'].to_csv(saida / 'hexad_mot.csv')
    r['hexad_mot_medias'].to_csv(saida / 'hexad_mot_medias.csv')

    # Gráficos.
    grafico_ues(e_pre, esc['pos'], saida / 'ues_pre_pos.png')
    grafico_k(r['mudanca_k'], saida / 'conhecimento_por_item.png')
    grafico_gam(r['gam'], saida / 'gam.png')
    return escrever(len(f), contaminados=contaminados, pares=pares, sem_ues=sem_ues)


# ---------------------------------------------------------------- demo

def gerar_demo(dados, n=64, seed=0):
    """Escreve CSVs sintéticos com efeitos conhecidos em `dados`. Devolve o gabarito usado nos asserts."""
    rng = np.random.default_rng(seed)
    ids = [rng.bytes(16).hex() for _ in range(n)]
    engajado = rng.random(n) < 0.5
    erra_pre, erra_pos, nao_usei_gam2 = {0, 1, 2}, {3, 4}, set(range(10, 16))
    contaminados = {20, 21, 22, 23}
    tardios = {n - 2, n - 1}  # pré em 27/10: o pós só libera depois de 08/11
    nao_responde = set([i for i in range(24, n - 2) if not engajado[i]][:14])  # abandono entre os que usam pouco
    inicio = pd.Timestamp('2026-10-09 08:00')
    pre = [pd.Timestamp('2026-10-27 10:00') if i in tardios else
           inicio + pd.Timedelta(days=int(rng.integers(0, 16)), hours=int(rng.integers(0, 10))) for i in range(n)]
    pos = [min(p + pd.Timedelta(days=int(rng.integers(14, 29))), FIM_COLETA - pd.Timedelta(hours=4)) for p in pre]

    n_aulas = np.where(engajado, rng.integers(8, 16, n), rng.integers(0, 5, n))
    trivia = n_aulas == 15  # a trivia só abre depois das 15 aulas
    concluidas = [sorted(f'{a:02d}' for a in rng.choice(np.arange(1, 16), k, replace=False)) for k in n_aulas]
    titulo = {v: t for t, v in TITULO_AULA.items()}
    # Uso antes de qualquer corte: 1 sessão por dia desde o pré (até 12 dias, antes do pós e do fechamento).
    dias = np.minimum(rng.poisson(np.where(engajado, 10, 2)) + 1, 12)
    tempo = rng.poisson(np.where(engajado, 5000, 900))
    pontos = rng.poisson(np.where(engajado, 900, 200))
    badges = rng.poisson(np.where(engajado, 7, 2))
    ranking = rng.poisson(np.where(engajado, 9, 1))
    conquistas = rng.poisson(np.where(engajado, 6, 1))
    eng = pd.DataFrame({
        'participante': ids, 'dias_ativos': dias, 'sessoes': dias, 'tempo_total_s': tempo,
        'aulas_concluidas': n_aulas, 'respostas_aulas': rng.poisson(np.where(engajado, 50, 12)),
        'rodadas_trivia': np.where(trivia, rng.poisson(8, n), 0), 'respostas_trivia': np.where(trivia, 2, 0),
        'pontos': pontos, 'badges': badges, 'visitas_ranking': ranking, 'visitas_conquistas': conquistas,
        'primeira_atividade': pre, 'ultima_atividade': [p + pd.Timedelta(days=int(d)) for p, d in zip(pre, dias)],
    })
    eng['acertos_aulas'] = eng.respostas_aulas  # inclui a provisória (sempre certa): a análise não usa
    eng['acertos_trivia'] = eng.respostas_trivia

    # Por aula concluída: uma questão certa, uma errada e a provisória (sempre certa). Engajados respondem de
    # novo as duas primeiras da 1ª aula: a certa vira repetição sem pontos, e o acerto segue 50%. Quem tem trivia
    # (15 aulas) acerta duas vezes a mesma questão sorteada: não pode contar como repetição. A atividade
    # começa 1 hora depois do pré; nos contaminados, 1 dia antes dele.
    resp = []
    for i, (p, aulas) in enumerate(zip(ids, concluidas)):
        t = pre[i] + (pd.Timedelta(days=-1) if i in contaminados else pd.Timedelta(hours=1))
        for a in aulas:
            for k, (chave, certa) in enumerate([('a', True), ('b', False), (PERGUNTA_PROVISORIA, True)]):
                resp.append((p, 'aula', titulo[a], int(a) * 10 + k, certa, t, chave))
                t += pd.Timedelta(minutes=10)
        if engajado[i] and aulas:
            for k, certa in [(0, True), (1, False)]:
                resp.append((p, 'aula', titulo[aulas[0]], int(aulas[0]) * 10 + k, certa, t, ['a', 'b'][k]))
                t += pd.Timedelta(minutes=10)
        if trivia[i]:
            for _ in range(2):
                resp.append((p, 'trivia', 'facil', 999, True, t, None))
                t += pd.Timedelta(minutes=10)
    resp = pd.DataFrame(resp, columns=['participante', 'tipo', 'contexto', 'questao_id', 'correta', 'respondido_em',
                                       'chave'])

    # Dados com data (pontos, conquistas, sessões, telas). Depois do corte, para conferir que ficam de fora:
    # engajados que responderam o pós ganham uso 1 dia depois dele; um que não respondeu ganha uma sessão dentro
    # da janela (conta) e outra depois do fechamento (não conta).
    ses, pts, bdg, ev = [], [], [], []
    for i, p in enumerate(ids):
        base = pre[i] + pd.Timedelta(hours=2)
        ses += [(p, base + pd.Timedelta(days=j), base + pd.Timedelta(days=j, seconds=int(tempo[i] // dias[i])),
                 int(tempo[i] // dias[i])) for j in range(dias[i])]
        if pontos[i]:
            pts.append((p, 'aula_questao', int(pontos[i]), base + pd.Timedelta(hours=1)))
        bdg += [(p, f'b{j}', base + pd.Timedelta(hours=1, minutes=j)) for j in range(badges[i])]
        ev += [(p, 'tela_visualizada', '/ranking', None, None, None, base + pd.Timedelta(hours=2, minutes=j))
               for j in range(ranking[i])]
        ev += [(p, 'tela_visualizada', '/conquistas', None, None, None, base + pd.Timedelta(hours=3, minutes=j))
               for j in range(conquistas[i])]
        # Leitura, resposta real de aula (8 s), dois "Terminou?" (1 s, questão 12) e trivia (20 s) só com as 15.
        ev += [(p, 'aula_conteudo_lido', '/aulas/a1', 'a1', 60_000, json.dumps({'rolagem_max': 80}), base),
               (p, 'quiz_respondido', '/aulas/a1', '10', 8_000, '{}', base),
               (p, 'quiz_respondido', '/aulas/a2', '12', 1_000, '{}', base),
               (p, 'quiz_respondido', '/aulas/a3', '12', 1_000, '{}', base)]
        if trivia[i]:
            ev.append((p, 'quiz_respondido', '/trivia', '999', 20_000, '{}', base))
    # Metadata nula, vazia ou "null" na leitura: fica ausente, sem derrubar a análise.
    ev += [(ids[0], 'aula_conteudo_lido', '/aulas/a2', 'a2', 60_000, m, pre[0] + pd.Timedelta(hours=2))
           for m in [None, '', 'null']]
    depois_pos = [i for i in range(n) if engajado[i] and i not in nao_responde and i not in tardios]
    for i in depois_pos:
        t = pos[i] + pd.Timedelta(days=1)
        ses.append((ids[i], t, t + pd.Timedelta(seconds=600), 600))
        pts.append((ids[i], 'aula_conclusao', 999, t))
        bdg.append((ids[i], 'depois', t))
        ev += [(ids[i], 'tela_visualizada', tela, None, None, None, t) for tela in ['/ranking', '/conquistas']]
    nao_resp = next(i for i in sorted(nao_responde) if pre[i] + pd.Timedelta(days=21) < FIM_COLETA)
    fecha = min(pre[nao_resp] + JANELA_POS, FIM_COLETA)
    dentro = pre[nao_resp] + pd.Timedelta(days=20)
    ses += [(ids[nao_resp], dentro, dentro + pd.Timedelta(seconds=600), 600),
            (ids[nao_resp], fecha, fecha + pd.Timedelta(seconds=600), 600)]
    dias_esperado = dias.copy()
    dias_esperado[nao_resp] += 1

    # Questionário.
    q = []

    def likert(media, sd, escala=5):
        return int(np.clip(np.round(media + rng.normal(0, sd)), 1, escala))

    fez = np.zeros(n, bool)
    for i, p in enumerate(ids):
        responde = i not in nao_responde and i not in tardios

        def r(m, item, v):
            q.append((p, m, item, v, (pre if m == 'pre' else pos)[i].isoformat()))

        for item in ['A1', 'A2', 'A3', 'A4', 'A5']:
            r('pre', item, int(rng.integers(0, len(OPCOES[item]))))
        for v in [NENHUMA] if rng.random() < 0.2 else rng.choice(np.arange(6), rng.integers(1, 4), False):
            r('pre', 'A6', int(v))
        fez[i] = rng.random() < 0.7
        r('pre', 'C1', SIM if fez[i] else int(rng.integers(1, 3)))
        if fez[i]:
            r('pre', 'C2', int(rng.integers(0, 5)))
            r('pre', 'C3', int(rng.integers(0, 6)))
            r('pre', 'C4', int(rng.integers(0, 3)))
        # UES: só quem fez treinamento no pré; no pós sobe nos engajados e cai um pouco nos outros. O traço da
        # pessoa (comum aos 12 itens) dá a consistência interna que o alfa mede.
        for m, media in [('pre', 3.0), ('pos', 4.3 if engajado[i] else 2.9)]:
            if (m == 'pre' and not fez[i]) or (m == 'pos' and not responde):
                continue
            traco = rng.normal(0, 0.5)
            for item in UES_ITENS:
                v = likert(media + traco, 0.5)
                r(m, item, 6 - v if item.endswith('_R') else v)
        # Conhecimento: acerta 35% no pré; no pós, 85% nas situações das aulas concluídas (35% nas outras). Quem
        # erra escolhe "Não sei" em 40% das vezes e, nas demais, uma das 2 erradas.
        cobertos = itens_cobertos(concluidas[i])
        for item in K:
            erradas = [o for o in range(NAO_SEI) if o != GABARITO[item]]
            acerto_pre = rng.random() < 0.35
            for m, chance in [('pre', None), ('pos', 0.85 if item in cobertos else 0.35)][:2 if responde else 1]:
                certo = acerto_pre if m == 'pre' else acerto_pre or rng.random() < chance
                r(m, item, GABARITO[item] if certo else NAO_SEI if rng.random() < 0.4 else int(rng.choice(erradas)))
        for itens in HEXAD.values():
            for item in itens:
                r('pre', item, int(rng.integers(2, 8)))
        r('pre', 'ATN', 4 if i in erra_pre else 1)
        if not responde:
            continue
        r('pos', 'ATN', 3 if i in erra_pos else 1)
        for item in GAM:
            r('pos', item, 0 if item == 'GAM2' and i in nao_usei_gam2 else likert(3.5, 1))
        r('pos', 'MOT', int(rng.integers(0, 6)))
        if fez[i]:
            r('pos', 'CMP', int(rng.integers(0, 6)))
        if rng.random() < 0.4:
            r('pos', 'ABR1', "'=já veio protegido pela exportação")
            r('pos', 'ABR2', '=mudaria a cor do botão')

    q = pd.DataFrame(q, columns=COLUNAS['questionario'])
    # Um segundo envio do pré (com ATN errado) do participante 5, um dia depois: vale o primeiro.
    q = pd.concat([q, pd.DataFrame([(ids[5], 'pre', 'ATN', 5, (pre[5] + pd.Timedelta(days=1)).isoformat())],
                                   columns=COLUNAS['questionario'])])

    dados = Path(dados)
    # Um arquivo velho com data e o novo como a tela baixa (sem data): vale o modificado por último.
    eng.head(1).to_csv(dados / 'pesquisa-engajamento-2026-09-01.csv', index=False)
    os.utime(dados / 'pesquisa-engajamento-2026-09-01.csv', (0, 0))
    eng.to_csv(dados / 'pesquisa-engajamento.csv', index=False)
    resp.to_csv(dados / 'pesquisa-respostas.csv', index=False)
    pd.DataFrame(ev, columns=COLUNAS['eventos']).to_csv(dados / 'pesquisa-eventos-2026-10-01.csv', index=False)
    pd.DataFrame(pts, columns=COLUNAS['pontos']).to_csv(dados / 'pesquisa-pontos.csv', index=False)
    pd.DataFrame(bdg, columns=COLUNAS['badges']).to_csv(dados / 'pesquisa-badges.csv', index=False)
    pd.DataFrame(ses, columns=COLUNAS['sessoes']).to_csv(dados / 'pesquisa-sessoes.csv', index=False)
    q.to_csv(dados / 'pesquisa-questionario-2026-10-01.csv', index=False, encoding='utf-8-sig')
    todos = set(range(n))
    validos_pre = todos - erra_pre
    validos_pos = todos - nao_responde - tardios - erra_pos
    pareados = (validos_pre - contaminados) & validos_pos
    elegiveis = validos_pre - tardios
    return {'n': n, 'ids': ids, 'erra_pre': len(erra_pre), 'erra_pos': len(erra_pos), 'duplicatas': 1,
            'contaminados': len(contaminados), 'n_k_pareada': len(pareados),
            'n_ues_pareada': sum(fez[i] for i in pareados), 'elegiveis': len(elegiveis),
            'responderam': len(elegiveis - nao_responde),
            'pct_nao_usei_gam2': 100 * len(nao_usei_gam2 & validos_pos) / len(validos_pos),
            'sem_ues': len(pareados) - sum(fez[i] for i in pareados),
            'uso': pd.DataFrame({'dias_ativos': dias_esperado, 'badges': badges, 'pontos': pontos,
                                 'visitas_ranking': ranking, 'visitas_conquistas': conquistas,
                                 'aulas_concluidas': n_aulas, 'repeticoes_sem_pontos': (engajado & (n_aulas > 0)),
                                 'trivia': trivia}, index=ids)}


def demo(destino=None):
    """Roda a análise em dados sintéticos e confere se ela encontra cada efeito e aplica cada exclusão."""
    with tempfile.TemporaryDirectory() as tmp:
        dados = Path(destino or tmp)
        dados.mkdir(parents=True, exist_ok=True)
        g = gerar_demo(dados)
        f, _, _ = features(dados)
        assert len(f) == g['n'], 'leu o CSV velho em vez do mais recente'
        assert np.allclose(f.acerto_aulas.dropna(), 0.5), 'acerto_aulas contou a pergunta provisória'
        assert (f.resposta_mediana_aula_s == 8).all() and (f.resposta_mediana_trivia_s.dropna() == 20).all()
        assert f.rolagem_mediana.iloc[0] == 80, 'metadata nula não ficou ausente'
        assert (f.aulas_concluidas[f.resposta_mediana_trivia_s.notna()] == 15).all(), 'trivia antes das 15 aulas'
        r = main(dados)

        largo, _, _, envios, _ = ler_questionario(dados)
        f, _, _ = features(dados, envios)
        uso = g['uso'].reindex(f.index)
        for c in ['dias_ativos', 'badges', 'pontos', 'visitas_ranking', 'visitas_conquistas', 'aulas_concluidas',
                  'repeticoes_sem_pontos']:
            assert (f[c] == uso[c].astype(float)).all(), f'uso até o pós errado em {c}'
        assert 'rodadas_trivia' not in USO
        ex = r['exclusoes'].set_index(['regra', 'momento']).n
        assert ex[('errou o ATN', 'pre')] == g['erra_pre'] and ex[('errou o ATN', 'pos')] == g['erra_pos'], 'ATN'
        assert ex[('envio repetido (vale o primeiro)', 'pre e pos')] == g['duplicatas'], 'duplicata'
        assert ex[('pré depois da 1ª atividade (fora do pareamento)', 'pre')] == g['contaminados'], 'pré contaminado'
        assert ex[('sem UES pareada (C1 diferente de Sim)', 'pre')] == g['sem_ues'], 'sem UES pareada'
        ad = r['antes_depois'].set_index('medida')
        assert list(ad.index) == ['UES', 'K'], 'só os 2 testes principais'
        ues, k = ad.loc['UES'], ad.loc['K']
        assert k.n_pares == g['n_k_pareada'], 'pareamento errado (ATN, pré contaminado ou abandono)'
        assert ues.n_pares == g['n_ues_pareada'], 'UES pareada não ficou só com C1 = Sim'
        assert ues.p_holm < 0.05 and ues.r_rank_biserial > 0, 'subida da UES não detectada'
        assert k.p_holm < 0.05 and k.r_rank_biserial > 0, 'subida do conhecimento não detectada'
        assert np.allclose(ad.p_holm, holm(ad.p)), 'Holm só entre os 2 testes principais'
        for lin in (ues, k):
            assert lin.r_ic95_inf <= lin.r_rank_biserial <= lin.r_ic95_sup, 'IC do rank-biserial'
        assert set(r['ues_subescalas'].medida) == set(UES) and 'p' not in r['ues_subescalas'], 'subescalas sem teste'
        mk = r['mudanca_k']
        assert np.allclose(mk.pct_acerto_pre + mk.pct_nao_sei_pre + mk.pct_erro_pre, 100), '% de erro'
        assert r['niveis_k'].pre.sum() == len(largo['pre']) - g['erra_pre'], 'nível de todo pré válido'
        assert r['transicao_k'].to_numpy().sum() == g['n_k_pareada'], 'transição só dos pareados'
        assert (r['perfil_k']['pre'][['acertos', 'erros', 'nao_sei']].sum(axis=1) == 7).all()
        cob = r['cobertura_teste'].iloc[0]
        assert cob.mediana_concluidas > cob.mediana_nao_concluidas and cob.r_rank_biserial > 0, \
            'ganho maior nos itens das aulas concluídas não detectado'
        cor = r['correlacoes_gam'].set_index('x').n
        assert list(r['correlacoes_gam'].y) == ['visitas_ranking', 'pontos'], 'só os 2 Spearman'
        assert cor['GAM2'] == cor['GAM1'] - round(g['pct_nao_usei_gam2'] * cor['GAM1'] / 100), \
            '"não usei" não virou NaN'
        gam2 = r['gam'].set_index('item').loc['GAM2']
        assert np.isclose(gam2.pct_nao_usei, g['pct_nao_usei_gam2']), '"não usei" contado errado'
        ab = r['abandono']
        assert (ab['elegiveis'], ab['responderam']) == (g['elegiveis'], g['responderam']), 'elegíveis do pós'
        aulas_ab = ab['tabela'].set_index('variavel').loc['aulas_concluidas']
        assert aulas_ab.r > 0 and aulas_ab.mediana_nao_respondeu < aulas_ab.mediana_respondeu, 'quem sai usa menos'
        cc = r['correlacoes_conhecimento'].set_index('x')
        assert list(cc.index) == ['aulas_concluidas', 'dias_ativos'] and cc.rho_parcial['aulas_concluidas'] > 0, \
            'uso × variação do conhecimento'
        assert r['hexad_mot'].to_numpy().sum() == len(largo['pos']) - g['erra_pos'], 'Hexad × MOT: pós válidos'
        assert list(zip(r['hexad_uso'].tipo, r['hexad_uso'].uso)) == [(t, u) for t, u, _ in PARES_HEXAD_USO]
        faixas = faixa_uso(pd.Series(g['uso'].aulas_concluidas)).value_counts().reindex(FAIXAS, fill_value=0)
        assert (r['faixas'].n == faixas).all(), 'contagem por faixa'
        cit = r['citacoes']
        assert 1 <= len(cit) <= 4 and cit.participante.is_unique and cit.faixa.head(3).is_unique, 'citações'
        abertas = pd.read_csv(dados / 'saida' / 'abertas.csv', encoding='utf-8-sig').texto
        assert not abertas.str.startswith("''").any() and abertas.str.startswith("'=").any(), 'apóstrofo'
        tcc = (dados / 'saida' / 'resumo-tcc.md').read_text(encoding='utf-8')
        for secao in BLOCOS:
            assert secao in tcc, secao
        assert tcc.count('![') == 4, '1 gráfico por bloco'
        assert (dados / 'saida' / 'apendice.md').exists()
        print('demo ok' + (f' (saída em {dados / "saida"})' if destino else ''))
        return r


if __name__ == '__main__':
    sys.stdout.reconfigure(errors='replace')  # saída redirecionada no Windows (cp1252) não derruba a análise
    try:
        if sys.argv[1:2] == ['--demo']:
            demo(sys.argv[2] if len(sys.argv) > 2 else None)
        else:
            main(Path(sys.argv[1] if len(sys.argv) > 1 else 'dados'))
    except (FileNotFoundError, ValueError) as erro:
        sys.exit(f'Erro: {erro}')
