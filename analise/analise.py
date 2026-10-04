"""Análise das métricas do Guardião Impacta para o TCC.

Entrada (pasta de dados):
  - CSVs de Admin → Estatísticas → Dados da pesquisa (pesquisa-engajamento-*.csv, -respostas-, -eventos-).
  - Opcional: likert-pre.csv e likert-pos.csv com a coluna `codigo` (código do participante) e um item
    por coluna. Item = CONSTRUTO + número (ENG1, ENG2, CONSC1...). Itens invertidos terminam em _R.
Saída: CSVs em <dados>/saida/.

Uso: python analise.py <pasta_dados>   |   python analise.py --demo
"""

import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import silhouette_score
from sklearn.model_selection import StratifiedKFold, permutation_test_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ESCALA_MAX = 5  # Likert de 1 a 5; mude para 7 se usar escala de 7 pontos
ALVO = 'ENG'  # construto cuja melhora (pós > pré) o classificador tenta prever

# Comportamento usado nos perfis (contagens, sem buracos para quem não usou uma área do app).
COMPORTAMENTO = ['dias_ativos', 'sessoes', 'tempo_min', 'aulas_concluidas', 'rodadas_trivia', 'badges',
                 'visitas_ranking', 'visitas_conquistas', 'repeticoes_sem_pontos']


def ler(dados, visao):
    arquivos = sorted(dados.glob(f'pesquisa-{visao}-*.csv'))
    if not arquivos:
        raise FileNotFoundError(f'Falta pesquisa-{visao}-<data>.csv em {dados}')
    return pd.read_csv(arquivos[-1], encoding='utf-8-sig')


def features(dados):
    e = ler(dados, 'engajamento').set_index('participante')
    f = pd.DataFrame(index=e.index)
    for c in ['dias_ativos', 'sessoes', 'aulas_concluidas', 'rodadas_trivia', 'pontos', 'badges',
              'visitas_ranking', 'visitas_conquistas']:
        f[c] = e[c]
    f['tempo_min'] = e.tempo_total_s / 60
    f['acerto_aulas'] = e.acertos_aulas / e.respostas_aulas.replace(0, np.nan)
    f['acerto_trivia'] = e.acertos_trivia / e.respostas_trivia.replace(0, np.nan)
    f['periodo_dias'] = (pd.to_datetime(e.ultima_atividade) - pd.to_datetime(e.primeira_atividade)).dt.days + 1

    # Respondeu de novo uma questão que já tinha acertado: não rende pontos, então é uso voluntário.
    r = ler(dados, 'respostas').sort_values('respondido_em')
    acertos_antes = r.groupby(['participante', 'questao_id']).correta.cumsum() - r.correta
    f['repeticoes_sem_pontos'] = (acertos_antes > 0).groupby(r.participante).sum()

    ev = ler(dados, 'eventos')
    leitura = ev[ev.tipo_evento == 'aula_conteudo_lido'].copy()
    leitura['rolagem'] = leitura.metadata.map(lambda m: json.loads(m).get('rolagem_max'))
    f['leitura_mediana_s'] = leitura.groupby('participante').duracao_ms.median() / 1000
    f['rolagem_mediana'] = leitura.groupby('participante').rolagem.median()
    quiz = ev[ev.tipo_evento == 'quiz_respondido']
    f['resposta_mediana_s'] = quiz.groupby('participante').duracao_ms.median() / 1000

    f[COMPORTAMENTO] = f[COMPORTAMENTO].fillna(0)
    return f


def alfa_cronbach(itens):
    itens = itens.dropna()
    k = itens.shape[1]
    if k < 2 or len(itens) < 2:
        return np.nan
    return k / (k - 1) * (1 - itens.var(ddof=1).sum() / itens.sum(axis=1).var(ddof=1))


def escores(arquivo):
    lk = pd.read_csv(arquivo, encoding='utf-8-sig', dtype={'codigo': str})
    lk['codigo'] = lk.codigo.str.strip().str.lower()
    itens = lk.set_index('codigo').select_dtypes('number')
    invertidos = [c for c in itens if c.endswith('_R')]
    itens[invertidos] = ESCALA_MAX + 1 - itens[invertidos]
    construto = itens.columns.str.extract(r'^([A-Za-z]+)', expand=False)
    alfas = {c: alfa_cronbach(itens.loc[:, construto == c]) for c in construto.unique()}
    return itens.T.groupby(construto).mean().T, alfas


def holm(p):
    p = np.nan_to_num(np.asarray(p, float), nan=1.0)
    ordem = np.argsort(p)
    ajustado = np.empty_like(p)
    ajustado[ordem] = np.minimum(1, np.maximum.accumulate((len(p) - np.arange(len(p))) * p[ordem]))
    return ajustado


def rank_biserial(d):
    d = d[d != 0]
    postos = stats.rankdata(np.abs(d))
    return (postos[d > 0].sum() - postos[d < 0].sum()) / postos.sum() if len(d) else np.nan


def pre_pos(pre, pos, alfas_pre, alfas_pos):
    linhas = []
    for c in pre.columns.intersection(pos.columns):
        par = pd.concat([pre[c], pos[c]], axis=1, keys=['pre', 'pos'], join='inner').dropna()
        d = par.pos - par.pre
        teste = stats.wilcoxon(d) if (d != 0).sum() >= 2 else None
        linhas.append({'construto': c, 'n_pares': len(par), 'mediana_pre': par.pre.median(),
                       'mediana_pos': par.pos.median(), 'mediana_delta': d.median(),
                       'W': teste.statistic if teste else np.nan, 'p': teste.pvalue if teste else np.nan,
                       'r_rank_biserial': rank_biserial(d.to_numpy()),
                       'alfa_pre': alfas_pre.get(c), 'alfa_pos': alfas_pos.get(c)})
    t = pd.DataFrame(linhas)
    t['p_holm'] = holm(t.p)
    return t


def correlacoes(f, delta):
    linhas = []
    for c in delta:
        for x in f:
            par = pd.concat([f[x], delta[c]], axis=1, join='inner').dropna()
            if len(par) >= 5 and par.iloc[:, 0].nunique() > 1:
                rho, p = stats.spearmanr(par.iloc[:, 0], par.iloc[:, 1])
                linhas.append({'delta': c, 'metrica': x, 'n': len(par), 'rho': rho, 'p': p})
    t = pd.DataFrame(linhas)
    if len(t):
        t['p_holm'] = holm(t.p)
    return t


def perfis(f):
    X = StandardScaler().fit_transform(np.log1p(f[COMPORTAMENTO]))
    ks = range(2, min(6, len(f) - 1) + 1)
    modelos = {k: KMeans(k, n_init=20, random_state=0).fit(X) for k in ks}
    silhuetas = {k: silhouette_score(X, m.labels_) for k, m in modelos.items()}
    melhor = max(silhuetas, key=silhuetas.get)
    grupo = pd.Series(modelos[melhor].labels_, index=f.index, name='perfil')
    resumo = f.groupby(grupo).median().assign(n=grupo.value_counts())
    return grupo, resumo, silhuetas


def classificador(f, delta):
    # ponytail: regressão logística regularizada; com n pequeno, árvore/rede/DL só decorariam os dados.
    y = (delta[ALVO] > 0).astype(int).rename('melhorou')
    dados = f[COMPORTAMENTO].join(y, how='inner')
    minoria = dados.melhorou.value_counts().min() if dados.melhorou.nunique() == 2 else 0
    if minoria < 3:
        return None
    modelo = make_pipeline(StandardScaler(), LogisticRegression(class_weight='balanced', C=0.5))
    cv = StratifiedKFold(min(5, minoria), shuffle=True, random_state=0)
    acc, _, p = permutation_test_score(modelo, dados[COMPORTAMENTO], dados.melhorou, cv=cv,
                                       scoring='balanced_accuracy', n_permutations=1000, random_state=0)
    coefs = modelo.fit(dados[COMPORTAMENTO], dados.melhorou)[-1].coef_[0]
    return {'n': len(dados), 'acuracia_balanceada': acc, 'p_permutacao': p,
            'coeficientes': dict(zip(COMPORTAMENTO, coefs.round(3)))}


def main(dados):
    saida = dados / 'saida'
    saida.mkdir(exist_ok=True)
    f = features(dados)
    f.describe().T.to_csv(saida / 'descritiva.csv')
    f.to_csv(saida / 'metricas_por_participante.csv')

    grupo, resumo, silhuetas = perfis(f)
    resumo.to_csv(saida / 'perfis.csv')
    print(f'Perfis: k={grupo.nunique()} (silhueta {silhuetas[grupo.nunique()]:.2f})')

    if not (dados / 'likert-pre.csv').exists() or not (dados / 'likert-pos.csv').exists():
        print('Sem likert-pre.csv e likert-pos.csv: análise só do comportamento.')
        grupo.to_csv(saida / 'perfil_por_participante.csv')
        return None
    pre, alfas_pre = escores(dados / 'likert-pre.csv')
    pos, alfas_pos = escores(dados / 'likert-pos.csv')
    resultado = pre_pos(pre, pos, alfas_pre, alfas_pos)
    resultado.to_csv(saida / 'pre_pos.csv', index=False)
    print(resultado.round(3).to_string(index=False))

    # Liga o código do questionário ao pseudônimo do app (o código é o início do pseudônimo).
    n = pre.index.str.len().max()
    f.index = f.index.str[:n]
    grupo.index = grupo.index.str[:n]
    delta = (pos - pre).dropna(how='all')
    sem_app = delta.index.difference(f.index)
    if len(sem_app):
        print(f'Aviso: {len(sem_app)} código(s) do questionário sem dados no app.')
    grupo.to_frame().join(delta, how='left').to_csv(saida / 'perfil_por_participante.csv')

    correlacoes(f, delta).to_csv(saida / 'correlacoes.csv', index=False)
    por_perfil = [g.dropna() for _, g in delta.join(grupo, how='inner').groupby('perfil')[ALVO]] \
        if ALVO in delta else []
    if sum(len(g) >= 2 for g in por_perfil) >= 2:
        print(f'Kruskal-Wallis delta {ALVO} entre perfis: p={stats.kruskal(*por_perfil).pvalue:.3f}')
    clf = classificador(f, delta) if ALVO in delta else None
    if clf:
        print(f"Classificador (melhorou {ALVO}?): n={clf['n']}, acurácia balanceada "
              f"{clf['acuracia_balanceada']:.2f} (acaso = 0.50), p permutação {clf['p_permutacao']:.3f}")
        pd.Series(clf['coeficientes']).to_csv(saida / 'classificador_coeficientes.csv')
    return resultado, clf


def demo():
    """Dados sintéticos com efeito conhecido: confere se a análise roda e encontra o efeito."""
    rng = np.random.default_rng(0)
    n = 40
    ids = [rng.bytes(16).hex() for _ in range(n)]
    engajado = rng.random(n) < 0.5
    base = pd.Timestamp('2026-09-01')
    eng = pd.DataFrame({
        'participante': ids,
        'dias_ativos': rng.poisson(np.where(engajado, 10, 2)) + 1,
        'sessoes': rng.poisson(np.where(engajado, 20, 4)) + 1,
        'tempo_total_s': rng.poisson(np.where(engajado, 5000, 900)),
        'aulas_concluidas': rng.poisson(np.where(engajado, 12, 3)),
        'respostas_aulas': rng.poisson(np.where(engajado, 50, 12)),
        'rodadas_trivia': rng.poisson(np.where(engajado, 8, 1)),
        'respostas_trivia': rng.poisson(np.where(engajado, 60, 8)),
        'pontos': rng.poisson(np.where(engajado, 900, 200)),
        'badges': rng.poisson(np.where(engajado, 7, 2)),
        'visitas_ranking': rng.poisson(np.where(engajado, 9, 1)),
        'visitas_conquistas': rng.poisson(np.where(engajado, 6, 1)),
        'primeira_atividade': base,
        'ultima_atividade': base + pd.to_timedelta(rng.integers(0, 30, n), 'D'),
    })
    eng['acertos_aulas'] = (eng.respostas_aulas * 0.7).astype(int)
    eng['acertos_trivia'] = (eng.respostas_trivia * 0.6).astype(int)
    resp = pd.DataFrame({'participante': np.repeat(ids, 6), 'questao_id': np.tile([1, 1, 1, 2, 2, 3], n),
                         'correta': rng.random(6 * n) < 0.7,
                         'respondido_em': base + pd.to_timedelta(np.tile(range(6), n), 'h')})
    ev = pd.DataFrame({'participante': np.repeat(ids, 2),
                       'tipo_evento': np.tile(['aula_conteudo_lido', 'quiz_respondido'], n),
                       'duracao_ms': rng.integers(5_000, 200_000, 2 * n),
                       'metadata': np.tile([json.dumps({'rolagem_max': 80}), json.dumps({'correta': True})], n)})
    codigos = [i[:8] for i in ids]

    def likert(delta):
        return pd.DataFrame({'codigo': codigos, **{
            f'{c}{k}': np.clip(np.round(3 + delta + rng.normal(0, 0.6, n)), 1, 5).astype(int)
            for c in ['ENG', 'CONSC'] for k in (1, 2, 3)}})

    with tempfile.TemporaryDirectory() as tmp:
        dados = Path(tmp)
        eng.to_csv(dados / 'pesquisa-engajamento-2026-10-01.csv', index=False)
        resp.to_csv(dados / 'pesquisa-respostas-2026-10-01.csv', index=False)
        ev.to_csv(dados / 'pesquisa-eventos-2026-10-01.csv', index=False)
        likert(0).to_csv(dados / 'likert-pre.csv', index=False)
        likert(np.where(engajado, 1.2, 0.2)).to_csv(dados / 'likert-pos.csv', index=False)
        resultado, clf = main(dados)
        assert (resultado.set_index('construto').p_holm < 0.05).all(), 'efeito pré/pós não detectado'
        assert clf and clf['p_permutacao'] < 0.05, 'classificador não achou o padrão injetado'
        print('demo ok')


if __name__ == '__main__':
    demo() if sys.argv[1:] == ['--demo'] else main(Path(sys.argv[1] if len(sys.argv) > 1 else 'dados'))
