"""Testes do analise.py. Rodar na pasta analise/: python -m unittest -v"""

import ast
import contextlib
import importlib.machinery
import importlib.util
import io
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from html import unescape
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd
from scipy import stats

import analise as a

AQUI = Path(__file__).resolve().parent
QUESTIONARIO = 'pesquisa-questionario-2026-10-01.csv'
APP = ['pesquisa-engajamento.csv', 'pesquisa-engajamento-2026-09-01.csv', 'pesquisa-respostas.csv',
       'pesquisa-eventos-2026-10-01.csv', 'pesquisa-pontos.csv', 'pesquisa-badges.csv', 'pesquisa-sessoes.csv']


def calado(funcao, *args):
    with contextlib.redirect_stdout(io.StringIO()):
        return funcao(*args)


CSVS_DA_DEMO = [
    'abandono.csv', 'abertas.csv', 'antes_depois.csv', 'confiabilidade.csv', 'conhecimento_por_item.csv',
    'correlacoes_conhecimento.csv', 'correlacoes_gam.csv', 'delta_por_participante.csv', 'descritiva_a6_qtd.csv',
    'descritiva_anamnese.csv', 'descritiva_cmp.csv', 'descritiva_comportamento.csv', 'descritiva_gam.csv',
    'descritiva_mot.csv', 'escores_pre_descritiva.csv', 'exclusoes.csv', 'faixas.csv', 'fluxo.csv',
    'conhecimento_niveis.csv', 'conhecimento_perfil.csv', 'conhecimento_por_grupo.csv', 'conhecimento_transicao.csv',
    'ganho_por_cobertura.csv', 'ganho_por_cobertura_teste.csv', 'hexad_medias.csv', 'hexad_mot.csv',
    'hexad_mot_medias.csv', 'hexad_uso.csv', 'marcados.csv', 'metricas_por_participante.csv', 'ues_subescalas.csv']
SECOES_DO_APENDICE = [
    'Exclusões por regra', 'Confiabilidade', 'Hexad: média', 'Anamnese', 'Testes principais', 'Subescalas da UES',
    'CMP', 'Conhecimento por situação', 'Nível e perfil de conhecimento', 'Ganho nos itens', 'Recursos do app',
    'Recurso mais motivador',
    'Uso até o pós por faixa', 'Spearman', 'Variação do conhecimento × uso', 'Viés de abandono',
    'Tipo Hexad dominante × recurso mais motivador', 'Perfil Hexad × uso registrado (Spearman)']


def carregar_copia(caminho, nome):
    # Importa uma cópia do módulo com outro nome (para comparar com o .bak).
    loader = importlib.machinery.SourceFileLoader(nome, str(caminho))  # aceita a extensão .bak
    modulo = importlib.util.module_from_spec(importlib.util.spec_from_loader(nome, loader))
    loader.exec_module(modulo)
    return modulo


class Unitarios(unittest.TestCase):
    def test_tabela_de_itens(self):
        self.assertEqual(len(a.ITENS.loc['pre']), 40)
        self.assertEqual(len(a.ITENS.loc['pos']), 32)
        self.assertEqual(a.ITENS.loc[('pre', 'A1'), 'bloco'], 'anamnese')
        self.assertEqual(a.ITENS.loc[('pre', 'AE1'), 'bloco'], 'AE')  # antes o regex juntava A1 e AE1
        self.assertEqual(a.ITENS.loc[('pre', 'ATN'), 'escala'], 7)
        self.assertEqual(a.ITENS.loc[('pos', 'ATN'), 'escala'], 5)
        self.assertEqual(a.ITENS.loc[('pre', 'C1'), 'escala'], 3)
        self.assertTrue(a.ITENS.loc[('pos', 'GAM6_R'), 'invertido'])
        self.assertFalse(a.ITENS.loc[('pre', 'KS6'), 'invertido'])
        self.assertEqual(tuple(a.ITENS.loc[('pos', 'KS6'), ['tipo', 'escala']]), ('escolha', 4))
        self.assertEqual(a.ITENS.loc[('pos', 'ABR1'), 'tipo'], 'texto')
        self.assertEqual(a.ITENS.loc[('pre', 'A6'), 'tipo'], 'multi')

    def test_inversao_pela_escala_do_item(self):
        t = pd.DataFrame({'PU2_R': [1, 5, 3], 'FA1': [1, 5, 3], 'PU1_R': [2, 4, np.nan], 'KS1': [0, 1, 2]})
        inv = a.inverter(t, 'pre')
        self.assertEqual(inv.PU2_R.tolist(), [5, 1, 3])
        self.assertEqual(inv.FA1.tolist(), [1, 5, 3])
        self.assertEqual(inv.PU1_R.tolist()[:2], [4, 2])
        self.assertTrue(np.isnan(inv.PU1_R.iloc[2]))
        self.assertEqual(inv.KS1.tolist(), [0, 1, 2], 'situação não é invertida')
        self.assertEqual(t.PU2_R.tolist(), [1, 5, 3], 'não pode alterar a tabela de entrada')

    def test_inversao_escala_7(self):
        extra = pd.DataFrame({'bloco': ['x'], 'escala': [7], 'invertido': [True], 'tipo': ['likert'], 'opcoes': [None]},
                             index=pd.MultiIndex.from_tuples([('pre', 'HXT_R')], names=['momento', 'codigo']))
        with mock.patch.object(a, 'ITENS', pd.concat([a.ITENS, extra])):
            inv = a.inverter(pd.DataFrame({'HXT_R': [1, 7, 4], 'DESCONHECIDO_R': [1, 2, 3]}), 'pre')
        self.assertEqual(inv.HXT_R.tolist(), [7, 1, 4])
        self.assertEqual(inv.DESCONHECIDO_R.tolist(), [1, 2, 3], 'código fora de ITENS não é invertido')

    def test_filtro_atn(self):
        t = pd.DataFrame({'ATN': [1, 4, np.nan, 1.0]}, index=list('abcd'))
        ok, excluidos = a.filtrar_atencao(t)
        self.assertEqual(ok.index.tolist(), ['a', 'd'])
        self.assertEqual(excluidos, 2, 'errar ou deixar sem ATN exclui')

    def test_filtro_atn_sem_coluna_exclui_todos(self):
        ok, excluidos = a.filtrar_atencao(pd.DataFrame({'K6': [3, 4]}))
        self.assertTrue(ok.empty)
        self.assertEqual(excluidos, 2)

    def test_nao_usei_vira_nan(self):
        bruto = pd.DataFrame({'GAM2': [0, 4, 0], 'GAM1': [3, 0, 5], 'GAM6_R': [0, 2, 5], 'ATN': [1, 1, 1]})
        lim = a.limpar(bruto, 'pos')
        self.assertEqual(lim.GAM2.isna().tolist(), [True, False, True])
        self.assertEqual(lim.GAM6_R.tolist()[1:], [4, 1], '_R invertido depois do 0 virar NaN')
        self.assertTrue(np.isnan(lim.GAM6_R.iloc[0]), '0 invertido não pode virar 6')
        gam = a.descritivas_gam(bruto).set_index('item')
        self.assertAlmostEqual(gam.loc['GAM2', 'pct_nao_usei'], 200 / 3)
        self.assertEqual(gam.loc['GAM2', 'pct_concordancia'], 100)

    def test_ues_do_pre_so_com_c1_sim(self):
        bruto = pd.DataFrame({'C1': [0, 1, 2, np.nan], 'FA1': [4, 4, 4, 4], 'KS6': [1, 1, 1, 1]})
        lim = a.limpar(bruto, 'pre')
        self.assertEqual(lim.FA1.notna().tolist(), [True, False, False, False])
        self.assertTrue(lim.KS6.notna().all())

    def test_respostas_uniformes(self):
        hexad = sum(a.HEXAD.values(), [])
        quem = ['variado', 'tudo7', 'tudo1', 'tudo0', 'falta', 'um_diferente', 'ues1', 'c1_nao']
        bruto = pd.DataFrame(index=quem, columns=hexad + a.UES_ITENS + ['C1'], dtype=float)
        bruto[hexad] = np.tile(np.arange(1, 11) % 7 + 1, (len(quem), 1))
        bruto[a.UES_ITENS] = np.tile(np.arange(12) % 5 + 1, (len(quem), 1))
        bruto['C1'] = a.SIM
        bruto.loc['tudo7', hexad] = 7
        bruto.loc['tudo1', hexad] = 1
        bruto.loc['tudo0', hexad + a.UES_ITENS] = 0  # "não usei" não é resposta
        bruto.loc['falta', hexad] = 7
        bruto.loc['falta', hexad[0]] = np.nan
        bruto.loc['um_diferente', hexad] = 7
        bruto.loc['um_diferente', hexad[-1]] = 6
        bruto.loc[['ues1', 'c1_nao'], a.UES_ITENS] = 1  # bruto: os _R também 1 (invertidos virariam 5)
        bruto.loc['c1_nao', 'C1'] = 1
        copia = bruto.copy()
        m = a.respostas_uniformes(bruto, 'pre')
        self.assertEqual(list(m.columns), ['participante', 'momento', 'bloco'])
        self.assertEqual(sorted(m[m.bloco == 'Hexad'].participante), ['tudo1', 'tudo7'],
                         'tudo 0, falta e um diferente: não')
        self.assertEqual(m[m.bloco == 'UES'].participante.tolist(), ['ues1'], 'C1 ≠ Sim e tudo 0: UES não marcada')
        self.assertTrue((m.momento == 'pre').all())
        self.assertTrue(a.respostas_uniformes(bruto.drop(columns='C1'), 'pre').query('bloco == "UES"').empty,
                        'sem C1: ninguém recebe a UES')
        pos = a.respostas_uniformes(bruto, 'pos')
        self.assertEqual(sorted(pos.participante), ['c1_nao', 'ues1'], 'no pós, UES de todos; Hexad só no pré')
        self.assertEqual(set(pos.bloco), {'UES'})
        pd.testing.assert_frame_equal(bruto, copia)  # não altera a entrada
        vazio = a.respostas_uniformes(pd.DataFrame(), 'pre')
        self.assertTrue(vazio.empty)
        self.assertEqual(list(vazio.columns), ['participante', 'momento', 'bloco'])

    def test_escores(self):
        # KS1-KS4 certas, KS5 "Não sei", KS6 e KS7 erradas: 4 acertos.
        ks = {'KS1': [2], 'KS2': [1], 'KS3': [2], 'KS4': [0], 'KS5': [3], 'KS6': [0], 'KS7': [1]}
        lim = pd.DataFrame({'FA1': [5], 'FA2': [3], 'FA3': [4], **ks, 'HXR2': [7], 'HXR4': [6], 'HXA2': [7]})
        e = a.escores(lim, 'pre').iloc[0]
        self.assertEqual(e.FA, 4)
        self.assertEqual(e.UES, 4)
        self.assertEqual(e.K, 4)
        self.assertEqual(e.Jogador, 13)
        self.assertTrue(np.isnan(e.Conquistador), 'Hexad precisa dos 2 itens')
        self.assertNotIn('Jogador', a.escores(lim, 'pos'), 'Hexad só no pré')
        self.assertTrue(np.isnan(a.escores(lim.drop(columns='KS7'), 'pre').K.iloc[0]), 'nota só com as 7 respondidas')

    def test_classificar_k(self):
        k = a.classificar_k(pd.DataFrame({'KS1': [2, 3, 0, 1, np.nan], 'KS4': [0, 3, 1, 2, 0]}))
        self.assertEqual(k.KS1.tolist()[:4], [1, 0, -1, -1])
        self.assertTrue(np.isnan(k.KS1.iloc[4]))
        self.assertEqual(k.KS4.tolist(), [1, 0, -1, -1, 1], 'gabarito por situação')
        ac = a.acertos(pd.DataFrame({'KS1': [2, 3, 0, np.nan]}))
        self.assertEqual(ac.KS1.tolist()[:3], [1, 0, 0], '"Não sei" e erro valem 0')
        self.assertTrue(np.isnan(ac.KS1.iloc[3]))

    def test_gabarito_igual_ao_do_app(self):
        definicao = AQUI.parent / 'backend' / 'src' / 'modulos' / 'questionarios' / 'definicao.js'
        if not definicao.exists():
            self.skipTest('definicao.js não encontrado')
        lidos = dict(re.findall(r"codigo: '(KS\d)',.*?Correta: (\d)", definicao.read_text(encoding='utf-8')))
        self.assertEqual({k: int(v) for k, v in lidos.items()}, a.GABARITO)
        self.assertEqual(a.NAO_SEI, 3)
        for item in a.K:
            self.assertTrue(a.OPCOES[item][a.GABARITO[item]].startswith('*'), item)
            self.assertEqual(a.OPCOES[item][a.NAO_SEI], 'Não sei')

    def test_nivel_e_perfil_de_conhecimento(self):
        self.assertEqual(a.nivel_conhecimento(pd.Series([0, 2, 3, 4, 5, 7])).tolist(),
                         ['baixo (0–2)'] * 2 + ['médio (3–4)'] * 2 + ['alto (5–7)'] * 2)
        certo = {k: a.GABARITO[k] for k in a.K}
        errado = {k: (a.GABARITO[k] + 1) % 3 for k in a.K}  # nunca o "Não sei"
        linhas = pd.DataFrame([certo, {**certo, 'KS1': 3, 'KS2': 3, 'KS3': errado['KS3']},
                               {**errado, 'KS1': 3}, {**certo, 'KS7': np.nan}], index=list('abcd'))
        p = a.perfil_conhecimento(linhas)
        self.assertEqual(list(p.index), ['a', 'b', 'c'], 'sem as 7 respondidas, fora do perfil')
        self.assertEqual(p.loc['a', ['acertos', 'erros', 'nao_sei', 'nivel', 'padrao']].tolist(),
                         [7, 0, 0, 'alto (5–7)', 'sem erros'])
        self.assertEqual(p.loc['b', 'padrao'], 'admite não saber')
        self.assertEqual(p.loc['c', ['acertos', 'nivel', 'padrao']].tolist(),
                         [0, 'baixo (0–2)', 'erra com confiança'])

    def test_mcnemar_e_transicao(self):
        self.assertAlmostEqual(a.mcnemar(8, 0), 2 * 0.5 ** 8)
        self.assertTrue(np.isnan(a.mcnemar(0, 0)))
        pre = pd.DataFrame({'nivel': ['baixo (0–2)', 'médio (3–4)', 'alto (5–7)']}, index=list('abc'))
        pos = pd.DataFrame({'nivel': ['alto (5–7)', 'médio (3–4)', 'alto (5–7)']}, index=list('abd'))
        contagem, transicao = a.niveis_k(pre, pos, pd.Index(['a', 'b', 'c']))
        self.assertEqual(contagem.pre.tolist(), [1, 1, 1])
        self.assertEqual(contagem.pos.tolist(), [0, 1, 2])
        self.assertEqual(transicao.to_numpy().sum(), 2, 'só pareados com os dois níveis')
        self.assertEqual(transicao.loc['baixo (0–2)', 'alto (5–7)'], 1)

    def test_conhecimento_por_grupo(self):
        perfil = pd.DataFrame({'acertos': [6, 2, 4], 'erros': [1, 3, 2], 'nao_sei': [0, 2, 1],
                               'nivel': ['alto (5–7)', 'baixo (0–2)', 'médio (3–4)']}, index=list('abc'))
        bruto = pd.DataFrame({'C1': [1, 0, 0], 'A1': [0, 0, 4]}, index=list('abc'))
        t = a.conhecimento_por_grupo(perfil, bruto, pd.Series(['Jogador', 'Empate', np.nan], index=list('abc')))
        c1 = t[t.variavel == 'C1 treinamento anterior']
        self.assertEqual(c1.grupo.tolist(), ['Sim', 'Não'], 'na ordem das opções')
        self.assertEqual(c1.mediana_acertos.tolist(), [3, 6])
        self.assertEqual(t[t.variavel == 'tipo Hexad dominante'].grupo.tolist(), ['Jogador', 'Empate'])
        self.assertAlmostEqual(c1.pct_nao_sei.iloc[0], 100 * 3 / 14)

    def test_holm(self):
        np.testing.assert_allclose(a.holm([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06])
        np.testing.assert_allclose(a.holm([0.5, 0.6]), [1, 1])
        np.testing.assert_allclose(a.holm([0.01, np.nan, 0.02]), [0.02, np.nan, 0.02])
        self.assertEqual(len(a.holm([])), 0)

    def test_rank_biserial(self):
        self.assertEqual(a.rank_biserial([1, 2, 3]), 1)
        self.assertEqual(a.rank_biserial([-1, -2]), -1)
        self.assertAlmostEqual(a.rank_biserial([1, -2, 3, 0]), 1 / 3)
        self.assertTrue(np.isnan(a.rank_biserial([0, 0])))

    def test_alfa_cronbach(self):
        itens = pd.DataFrame({'a': [1, 2, 3, 4, 5], 'b': [1, 2, 3, 4, 5]})
        self.assertAlmostEqual(a.alfa_cronbach(itens), 1)
        self.assertTrue(np.isnan(a.alfa_cronbach(pd.DataFrame({'a': [3, 3], 'b': [3, 3]}))), 'todos iguais')

    def test_wilcoxon_pareado(self):
        antes = pd.Series([1, 2, 3, 4, 5, 6], index=list('abcdef'))
        t = a.wilcoxon_pareado(antes, (antes + 1).drop('f'))
        self.assertEqual(t['n_pares'], 5)
        self.assertEqual(t['r_rank_biserial'], 1)
        self.assertLess(t['p'], 0.1)
        self.assertTrue(np.isnan(a.wilcoxon_pareado(antes, antes)['p']), 'sem diferença: sem teste')

    def test_mapa_aulas_itens(self):
        self.assertEqual(a.itens_cobertos({'07'}), {'KS1'})
        self.assertEqual(a.itens_cobertos({'05'}), {'KS2'})
        self.assertEqual(a.itens_cobertos({'06'}), {'KS2', 'KS4'})
        self.assertEqual(a.itens_cobertos({'09'}), {'KS3', 'KS5'})
        self.assertEqual(a.itens_cobertos({'01', '13'}), {'KS6', 'KS7'})
        self.assertEqual(a.itens_cobertos({'03', '15'}), set())
        self.assertEqual(a.itens_cobertos(set()), set())
        self.assertEqual(a.itens_cobertos(set(a.TITULO_AULA.values())), set(a.K))
        self.assertEqual(set(a.AULAS_K), set(a.K))
        self.assertTrue(set(sum(a.AULAS_K.values(), [])) <= set(a.TITULO_AULA.values()))

    def test_titulos_batem_com_conteudo(self):
        pastas = sorted((AQUI.parent / 'conteudo' / 'aulas').glob('*/aula.html'))
        if not pastas:
            self.skipTest('conteudo/aulas não encontrado')
        lidos = {unescape(re.search(r'<title>(.*?)</title>', p.read_text(encoding='utf-8'), re.S).group(1).strip()):
                 p.parent.name[:2] for p in pastas}
        self.assertEqual(lidos, a.TITULO_AULA)
        self.assertEqual(lidos, a.TITULOS_RESERVA, 'atualize a lista de reserva')

    def test_aulas_por_participante(self):
        r = pd.DataFrame({'participante': ['p', 'p', 'p', 'q', 'q'], 'tipo': ['aula', 'aula', 'trivia', 'aula', 'aula'],
                          'contexto': ['A Senha é Sua Primeira Defesa', ' Engenharia Social ', 'facil',
                                       'Aula que não existe', 'A Senha é Sua Primeira Defesa']})
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            aulas = a.aulas_por_participante(r)
        self.assertEqual(aulas['p'], {'07', '06'})
        self.assertEqual(aulas['q'], {'07'})
        self.assertIn('Aula que não existe', saida.getvalue())

    def test_pre_contaminado(self):
        pre = pd.Series(pd.to_datetime(['2026-10-10 10:00', '2026-10-10 10:00', '2026-10-10 10:00', None]),
                        index=['antes', 'depois', 'sem_app', 'sem_data'])
        primeira = pd.Series(pd.to_datetime(['2026-10-10 11:00', '2026-10-10 09:00', '2026-10-01 00:00']),
                             index=['antes', 'depois', 'sem_data'])
        self.assertEqual(a.pre_contaminado(pre, primeira).tolist(), ['depois'])
        self.assertEqual(len(a.pre_contaminado(pre, primeira.iloc[:0])), 0)

    def test_hora_local(self):
        h = a.hora_local(pd.Series(['2026-10-10T13:00:00Z', '2026-10-10 10:00', 'lixo', None]))
        self.assertEqual(h.iloc[0], pd.Timestamp('2026-10-10 10:00'), 'com fuso: convertido para Brasília')
        self.assertEqual(h.iloc[1], pd.Timestamp('2026-10-10 10:00'), 'sem fuso: já é Brasília')
        self.assertTrue(h.iloc[2:].isna().all())

    def test_sem_formula(self):
        self.assertEqual(a.sem_formula('=1+1'), "'=1+1")
        self.assertEqual(a.sem_formula('gostei'), 'gostei')
        self.assertEqual(a.sem_formula("'=já protegido"), "'=já protegido", 'não duplica o apóstrofo')
        self.assertEqual(a.sem_formula('-5'), '-5')
        self.assertEqual(a.sem_formula('-ruim'), "'-ruim")
        self.assertEqual(a.sem_formula('\tx'), "'\tx")

    def test_rolagem_com_metadata_nula(self):
        self.assertEqual(a.rolagem('{"rolagem_max": 70}'), 70)
        for m in [None, np.nan, '', 'null', '{quebrado', '[]']:
            self.assertTrue(np.isnan(a.rolagem(m)), repr(m))

    def test_corte_pelo_pos_e_pelo_fechamento(self):
        envios = pd.DataFrame({'pre': pd.to_datetime(['2026-10-10 10:00', '2026-10-10 10:00', '2026-10-20 09:00',
                                                      None]),
                               'pos': pd.to_datetime(['2026-10-30 08:00', None, None, None])},
                              index=['respondeu', 'nao_respondeu', 'pre_tarde', 'sem_pre'])
        corte = a.corte_uso(envios, ['respondeu', 'nao_respondeu', 'pre_tarde', 'sem_pre', 'fora'])
        self.assertEqual(corte['respondeu'], pd.Timestamp('2026-10-30 08:00'), 'pós: o envio')
        self.assertEqual(corte['nao_respondeu'], pd.Timestamp('2026-11-07 10:00'), 'sem pós: pré + 28 dias')
        self.assertEqual(corte['pre_tarde'], pd.Timestamp('2026-11-08 00:00'), 'teto: fecha 00:00 de 08/11')
        self.assertEqual(corte['sem_pre'], a.FIM_COLETA)
        self.assertEqual(corte['fora'], a.FIM_COLETA)
        t = pd.DataFrame({'participante': ['respondeu'] * 3,
                          'quando_txt': ['2026-10-30 07:59', '2026-10-30 08:00', '2026-10-31 10:00']})
        self.assertEqual(len(a.cortar(t, 'quando_txt', corte)), 1, 'conta só o que veio antes do corte')
        self.assertEqual(len(a.cortar(t, 'quando_txt', None)), 3, 'sem corte, tudo')

    def test_fim_coleta_e_elegibilidade(self):
        self.assertEqual(a.FIM_COLETA, pd.Timestamp('2026-11-08 00:00'))
        self.assertTrue(pd.Timestamp('2026-10-24 23:59') + a.LIBERA_POS < a.FIM_COLETA)
        self.assertFalse(pd.Timestamp('2026-10-25 00:00') + a.LIBERA_POS < a.FIM_COLETA, 'abriria no fechamento')

    def test_limites_das_faixas(self):
        f = a.faixa_uso(pd.Series([0, 4, 5, 10, 11, 15], dtype=float))
        self.assertEqual(f.tolist(), ['0–4', '0–4', '5–10', '5–10', '11–15', '11–15'])

    def test_montar_fluxo(self):
        largo = {'pre': pd.DataFrame(index=list('abcdefg')), 'pos': pd.DataFrame(index=list('abcdx'))}
        bruto = {'pre': largo['pre'].drop(['g']), 'pos': largo['pos'].drop(['d'])}  # g e d erram o ATN
        ad = pd.DataFrame({'medida': ['UES', 'K'], 'n_pares': [1, 2]})
        fluxo = a.montar_fluxo(9, largo, bruto, 1, contaminados=pd.Index(['c']), pares=pd.Index(['a', 'b']),
                               sem_ues=1, ad=ad).set_index('etapa').n
        self.assertEqual(fluxo['pré válido'], fluxo['responderam o pré'] - fluxo['  − errou o ATN no pré'])
        self.assertEqual(fluxo['pós válido'], fluxo['responderam o pós'] - fluxo['  − errou o ATN no pós'])
        tardio, sem_pre = fluxo['  − pré depois da 1ª atividade no app'], fluxo['  − sem pré válido']
        self.assertEqual(fluxo['pares pré × pós'], fluxo['pós válido'] - tardio - sem_pre, 'o fluxo fecha')
        self.assertEqual((tardio, sem_pre), (1, 1))
        self.assertEqual(fluxo['pares com UES'],
                         fluxo['pares pré × pós'] - fluxo['  − sem UES pareada (C1 ≠ Sim)'])
        self.assertEqual(fluxo['envios repetidos descartados (vale o primeiro)'], 1)
        so_pre = a.montar_fluxo(np.nan, largo, bruto, 0).set_index('etapa').n
        self.assertNotIn('pares pré × pós', so_pre, 'sem pós válido pareado, o fluxo para no pós')

    def test_frase_efeito_so_afirma_mudanca_clara(self):
        lin = pd.Series({'p': .2, 'p_holm': .3, 'n_pares': 20, 'mediana_pre': 3.0, 'mediana_pos': 3.5,
                         'r_rank_biserial': .33, 'r_ic95_inf': -.3, 'r_ic95_sup': .8})
        self.assertIn('não mudou de forma clara', a.frase_efeito(lin, 'os pareados', 'a UES'))
        self.assertIn('subiu', a.frase_efeito(lin.copy().replace({.3: .01}), 'os pareados', 'a UES'))
        caiu = lin.copy()
        caiu[['p_holm', 'r_rank_biserial']] = [.01, -.5]
        self.assertIn('caiu', a.frase_efeito(caiu, 'os pareados', 'a UES'))
        self.assertIn('sem teste', a.frase_efeito(lin.copy().replace({.2: np.nan}), 'os pareados', 'a UES'))

    def test_citacoes_uma_por_faixa(self):
        abertas = pd.DataFrame({'participante': ['a', 'b', 'c', 'd', 'e'],
                                'item': ['ABR1', 'ABR2', 'ABR1', 'ABR2', 'ABR1'],
                                'valor': ['gostei', 'mudaria x', '', 'mais trivia', 'ranking']})
        faixa = pd.Series(['0–4', '0–4', '5–10', '11–15', '11–15'], index=list('abcde'))
        cit = a.citacoes(abertas, faixa)
        self.assertEqual(cit.participante.tolist()[:2], ['a', 'd'], 'uma por faixa; texto vazio não conta')
        self.assertTrue(cit.participante.is_unique)
        self.assertLessEqual(len(cit), 4)
        self.assertTrue(a.citacoes(abertas.head(0), faixa).empty)

    def test_confiabilidade_so_alfa(self):
        t = pd.DataFrame({c: [1, 2, 3, 4, 5] for c in a.UES_ITENS})
        c = a.confiabilidade(t, None)
        self.assertEqual(list(c.columns), ['momento', 'escala', 'k_itens', 'n', 'alfa'])
        self.assertAlmostEqual(c.set_index('escala').alfa['UES geral'], 1)

    # ---- spearman_parcial (A1)
    def test_spearman_parcial_com_controle_independente(self):
        rng = np.random.default_rng(0)
        x = pd.Series(rng.normal(size=200))
        y, z = x + rng.normal(size=200), pd.Series(rng.normal(size=200))
        n, rho, p = a.spearman_parcial(x, y, z)
        self.assertEqual(n, 200)
        self.assertAlmostEqual(rho, a.spearman(x, y)[1], delta=0.1)
        self.assertLess(p, 0.001)

    def test_spearman_parcial_remove_o_confundidor(self):
        rng = np.random.default_rng(1)
        z = pd.Series(rng.normal(size=200))
        x, y = z + rng.normal(0, 0.3, 200), z + rng.normal(0, 0.3, 200)
        self.assertGreater(a.spearman(x, y)[1], 0.8)
        self.assertLess(abs(a.spearman_parcial(x, y, z)[1]), 0.2)

    def test_spearman_parcial_igual_a_formula(self):
        rng = np.random.default_rng(2)
        z = pd.Series(rng.normal(size=50))
        x, y = pd.Series(rng.normal(size=50)) + z, pd.Series(rng.integers(0, 5, 50)) + z  # com empates
        rxy, rxz, ryz = (a.spearman(*par)[1] for par in [(x, y), (x, z), (y, z)])
        formula = (rxy - rxz * ryz) / np.sqrt((1 - rxz ** 2) * (1 - ryz ** 2))
        n, rho, p = a.spearman_parcial(x, y, z)
        self.assertAlmostEqual(rho, formula, delta=1e-10)
        t = rho * np.sqrt((n - 3) / (1 - rho ** 2))
        self.assertAlmostEqual(p, 2 * stats.t.sf(abs(t), n - 3), delta=1e-12)

    def test_spearman_parcial_n_minimo_e_constante(self):
        x, y, z = (pd.Series(v, dtype=float) for v in ([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 6, 5], [1, 3, 2, 5, 4, 6]))
        self.assertTrue(np.isnan(a.spearman_parcial(x[:5], y[:5], z[:5])[1]), 'n = 5')
        self.assertFalse(np.isnan(a.spearman_parcial(x, y, z)[1]), 'n = 6')
        self.assertEqual(a.spearman_parcial(x[:5], y[:5], z[:5])[0], 5)
        self.assertTrue(np.isnan(a.spearman_parcial(x, y, pd.Series([3.0] * 6))[1]), 'z constante')
        self.assertTrue(np.isnan(a.spearman_parcial(pd.Series([1.0] * 6), y, z)[1]), 'x constante')

    def test_spearman_parcial_alinha_pelo_indice(self):
        rng = np.random.default_rng(3)
        idx = [f'p{i}' for i in range(30)]
        x, y, z = (pd.Series(rng.normal(size=30), index=idx) for _ in range(3))
        base = a.spearman_parcial(x, y, z)
        embaralhado = a.spearman_parcial(x.sample(frac=1, random_state=0), y[::-1], z.sample(frac=1, random_state=1))
        np.testing.assert_allclose(base, embaralhado)
        com_nan = a.spearman_parcial(pd.concat([x, pd.Series([np.nan], index=['extra'])]), y.where(y.index != 'p0'), z)
        np.testing.assert_allclose(com_nan, a.spearman_parcial(x.drop('p0'), y.drop('p0'), z.drop('p0')))

    # ---- abandono (A2)
    def test_mann_whitney_sinal_e_grupos_pequenos(self):
        u, p, r = a.mann_whitney([5, 6, 7, 8], [1, 2, 3])
        self.assertEqual((u, r), (12, 1))
        self.assertLess(a.mann_whitney([1, 2, 3], [5, 6, 7, 8])[2], 0)
        for b in ([], [9]):
            self.assertTrue(all(np.isnan(v) for v in a.mann_whitney([1, 2, 3], b)), b)
        self.assertTrue(np.isnan(a.mann_whitney([2, 2], [2, 2])[2]), 'tudo igual')

    def test_abandono_compara_quem_respondeu(self):
        ids = [f'p{i}' for i in range(8)]
        pre = pd.Series(pd.Timestamp('2026-10-10'), index=ids)
        e_pre = pd.DataFrame({'K': [4, 4, 5, 4, 2, 2, 3, 2], 'UES': np.nan, **{t: 8 for t in a.HEXAD}}, index=ids)
        uso = pd.DataFrame({'aulas_concluidas': [9, 8, 9, 7, 1, 2, 0, 1], 'dias_ativos': [5, 6, 5, 4, 1, 1, 2, 1]},
                           index=ids)
        ab = a.abandono(pd.Index(ids), pre, ids[:4], e_pre, uso)
        t = ab['tabela'].set_index('variavel')
        self.assertEqual((ab['elegiveis'], ab['responderam']), (8, 4))
        self.assertGreater(t.r['aulas_concluidas'], 0)
        self.assertGreater(t.r['K'], 0)
        self.assertTrue(np.isnan(t.r['UES']), 'UES vazia: NaN, sem exceção')
        sozinho = a.abandono(pd.Index(ids), pre, ids[:7], e_pre, uso)['tabela']
        self.assertTrue(sozinho.r.isna().all(), '1 pessoa que não respondeu: NaN')
        todos = a.abandono(pd.Index(ids), pre, ids, e_pre, uso)['tabela']
        self.assertTrue(todos.r.isna().all() and (todos.n_nao_respondeu == 0).all(), 'grupo vazio')
        tarde = pre.copy()
        tarde['p7'] = pd.Timestamp('2026-10-30')  # pós só liberaria em 13/11: não é elegível
        self.assertEqual(a.abandono(pd.Index(ids), tarde, ids[:4], e_pre, uso)['elegiveis'], 7)

    # ---- Hexad × MOT (A3)
    def test_tipo_dominante(self):
        e = pd.DataFrame({'Filantropo': [14, 5, np.nan], 'Socializador': [2, 5, 3], 'Conquistador': [2, 3, 3],
                          'Jogador': [2, 3, 3], 'Espirito_livre': [2, 3, 3]}, index=['a', 'b', 'c'])
        t = a.tipo_dominante(e)
        self.assertEqual(t[['a', 'b']].tolist(), ['Filantropo', 'Empate'])
        self.assertTrue(pd.isna(t['c']), 'escore faltando')
        self.assertTrue(a.tipo_dominante(e.head(0)).empty)

    def test_hexad_mot(self):
        e = pd.DataFrame({t: [10, 2, 7] for t in a.HEXAD}, index=['a', 'b', 'c']).assign(Jogador=[14, 2, 7])
        mot = pd.Series(['Pontos', 'Ranking'], index=['a', 'b'])
        tabela, medias = a.hexad_mot(e, mot, pd.Index(['a', 'b', 'd']))
        self.assertEqual(tabela.to_numpy().sum(), 3, 'soma = pós válidos')
        self.assertEqual(tabela.loc['Jogador', 'Pontos'], 1)
        self.assertEqual(tabela.loc['Empate', 'Ranking'], 1)
        self.assertEqual(tabela.loc['sem Hexad', 'sem resposta'], 1)
        self.assertEqual(tabela['Nenhum deles'].sum(), 0, 'opção zerada continua na tabela')
        self.assertEqual(list(medias.index), a.OPCOES['MOT'])
        self.assertEqual(medias.loc['Pontos', 'Jogador'], 14)

    # ---- Hexad × uso (A4)
    def test_hexad_uso(self):
        rng = np.random.default_rng(4)
        idx = [f'p{i}' for i in range(20)]
        visitas = pd.Series(rng.integers(0, 30, 20), index=idx)
        e = pd.DataFrame({t: rng.integers(2, 15, 20) for t in a.HEXAD}, index=idx)
        e['Jogador'] = (visitas / 30 * 12 + 2 + rng.normal(0, 1, 20)).clip(2, 14)
        f = pd.DataFrame({u: rng.integers(0, 20, 20) for u in ['pontos', 'badges', 'aulas_concluidas']}, index=idx)
        f['visitas_ranking'] = visitas
        t = a.hexad_uso(e, f)
        # Lista literal (Tondello et al., 2016): mudar um par tem de quebrar este teste.
        self.assertEqual(list(zip(t.tipo, t.uso)), [('Jogador', 'pontos'), ('Jogador', 'badges'),
                                                    ('Jogador', 'visitas_ranking'), ('Socializador', 'visitas_ranking'),
                                                    ('Conquistador', 'aulas_concluidas')])
        self.assertEqual(len(t), 5)
        self.assertFalse(t.tipo.isin(['Filantropo', 'Espirito_livre']).any())
        self.assertGreater(t.set_index(['tipo', 'uso']).rho[('Jogador', 'visitas_ranking')], 0.5)
        self.assertTrue(a.hexad_uso(e.head(4), f).rho.isna().all(), 'n < 5')
        self.assertTrue(a.hexad_uso(e.assign(Jogador=7), f).query('tipo == "Jogador"').rho.isna().all(), 'constante')

    def test_hexad_uso_redundante(self):
        rng = np.random.default_rng(5)
        idx = [f'p{i}' for i in range(20)]
        e = pd.DataFrame({t: rng.integers(2, 15, 20) for t in a.HEXAD}, index=idx)
        aulas = pd.Series(rng.permutation(20), index=idx)
        f = pd.DataFrame({'pontos': aulas * 10 + 3, 'badges': rng.permutation(20), 'aulas_concluidas': aulas,
                          'visitas_ranking': rng.integers(0, 30, 20)}, index=idx)
        t = a.hexad_uso(e, f).set_index(['tipo', 'uso'])
        self.assertAlmostEqual(t.rho_aulas[('Jogador', 'pontos')], 1)
        self.assertTrue(t.redundante[('Jogador', 'pontos')])
        self.assertLess(abs(t.rho_aulas[('Jogador', 'badges')]), a.LIMITE_REDUNDANTE)
        self.assertFalse(t.redundante[('Jogador', 'badges')])
        self.assertTrue(np.isnan(t.rho_aulas[('Conquistador', 'aulas_concluidas')]), 'o próprio par das aulas')
        self.assertFalse(t.redundante[('Conquistador', 'aulas_concluidas')])
        # Associação negativa forte também é redundante (|ρ|).
        self.assertTrue(a.hexad_uso(e, f.assign(pontos=-aulas)).set_index('uso').redundante['pontos'])
        # Uso constante: Spearman NaN sem erro, e não marca.
        c = a.hexad_uso(e, f.assign(pontos=0)).set_index('uso')
        self.assertTrue(np.isnan(c.rho_aulas['pontos']))
        self.assertFalse(c.redundante['pontos'])
        # Mesmas pessoas do par: com < 5 com Hexad, rho_aulas é NaN mesmo com o uso de todos.
        self.assertTrue(a.hexad_uso(e.head(4), f).rho_aulas.isna().all(), 'n < 5')
        # Sem aulas_concluidas no uso: NaN, sem KeyError.
        self.assertTrue(a.hexad_uso(e, f.drop(columns='aulas_concluidas')).rho_aulas.isna().all())

    def test_hexad_centrado(self):
        # p4 assimétrico (média 9,2, mediana 14): separa média de mediana.
        e = pd.DataFrame({'Filantropo': [14, 14, 10, 8, 14], 'Socializador': [12, 14, 6, 8, 14],
                          'Espirito_livre': [10, 14, 8, 8, 14], 'Conquistador': [8, 14, 4, np.nan, 2],
                          'Jogador': [6, 14, 2, 8, 2], 'Satisfacao': [1, 2, 3, 4, 5]},
                         index=['p0', 'p1', 'p2', 'p3', 'p4'])
        c = a.hexad_centrado(e)
        self.assertEqual(list(c.columns), list(a.HEXAD), 'só os 5 tipos')
        self.assertEqual(c.loc['p0', 'Filantropo'], 4)
        self.assertEqual(c.loc['p0', 'Jogador'], -4)
        np.testing.assert_allclose(c.loc['p4', ['Filantropo', 'Conquistador']], [4.8, -7.2])
        self.assertTrue((c.loc['p1'] == 0).all(), 'tudo 14: nível geral sai, sobra zero')
        np.testing.assert_allclose(c.dropna().sum(axis=1), 0, atol=1e-12, err_msg='soma zero por pessoa')
        self.assertTrue(c.loc['p3'].isna().all(), 'falta um escore: NaN em todos os tipos')
        self.assertTrue(a.hexad_centrado(e.drop(columns='Jogador')).isna().all().all(), 'sem uma coluna: NaN')
        self.assertTrue(a.hexad_centrado(e.iloc[:0]).empty)

    def test_hexad_uso_relativo(self):
        rng = np.random.default_rng(6)
        idx = [f'p{i}' for i in range(30)]
        visitas = pd.Series(rng.permutation(30), index=idx)
        nivel = pd.Series(rng.integers(0, 8, 30), index=idx)
        # Bruto: Jogador = nível geral da pessoa (igual nos 5 tipos) + sinal; centrado tira o nível.
        e = pd.DataFrame({t: nivel + 2 for t in a.HEXAD}, index=idx).astype(float)
        e['Jogador'] = nivel + 2 + visitas / 10
        f = pd.DataFrame({'pontos': rng.permutation(30), 'badges': rng.permutation(30),
                          'aulas_concluidas': nivel.values, 'visitas_ranking': visitas}, index=idx)
        t = a.hexad_uso(e, f).set_index(['tipo', 'uso'])
        self.assertAlmostEqual(t.rho_rel[('Jogador', 'visitas_ranking')], 1)
        self.assertLess(t.p_rel[('Jogador', 'visitas_ranking')], 0.05)
        self.assertLess(t.rho[('Jogador', 'visitas_ranking')], 0.99, 'bruto mistura o nível geral')
        self.assertGreater(t.rho[('Conquistador', 'aulas_concluidas')], 0.9, 'bruto: só o nível geral')
        self.assertLess(abs(t.rho_rel[('Conquistador', 'aulas_concluidas')]), 0.9, 'centrado: nível sai')
        # Hexad incompleto: fica fora do centrado, mas continua no bruto.
        inc = a.hexad_uso(e.assign(Filantropo=np.nan), f)
        self.assertTrue(inc.rho_rel.isna().all())
        self.assertFalse(inc.rho.isna().all())
        # Um só sem Filantropo: sai do centrado (n_rel = n - 1), não do bruto.
        um = a.hexad_uso(e.assign(Filantropo=e.Filantropo.where(e.index != 'p0')), f)
        self.assertTrue((um.n == 30).all() and (um.n_rel == 29).all())
        # Uso constante e n < 5: NaN sem erro.
        self.assertTrue(np.isnan(a.hexad_uso(e, f.assign(pontos=0)).set_index('uso').rho_rel['pontos']))
        self.assertTrue(a.hexad_uso(e.head(4), f).rho_rel.isna().all(), 'n < 5')
        self.assertTrue(a.hexad_uso(e.drop(columns='Jogador'), f).query('tipo == "Jogador"').rho_rel.isna().all())

    def test_ic_bootstrap(self):
        def rb(x):
            return a.rank_biserial(x[:, 0])

        self.assertEqual(a.ic_bootstrap(rb, np.arange(1, 11)), (1, 1))
        inf, sup = a.ic_bootstrap(rb, np.random.default_rng(0).normal(size=200))
        self.assertTrue(inf < 0 < sup)
        self.assertTrue(np.isnan(a.ic_bootstrap(rb, [1, 2, 3, 4])[0]), 'n < 5')
        self.assertTrue(np.isnan(a.ic_bootstrap(rb, np.zeros(10))[0]), 'sem diferença')
        t = a.wilcoxon_pareado(pd.Series(np.zeros(10)), pd.Series(np.arange(1.0, 11)), ic=True)
        self.assertEqual((t['r_ic95_inf'], t['r_ic95_sup']), (1, 1))
        sem_ic = a.wilcoxon_pareado(pd.Series(np.zeros(10)), pd.Series(np.arange(1.0, 11)))
        self.assertTrue(np.isnan(sem_ic['r_ic95_inf']), 'IC só quando pedido')


class Dados(unittest.TestCase):
    """Base: gera a demo numa pasta temporária; cada teste altera o que precisa."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dados = Path(self.tmp.name)
        self.g = a.gerar_demo(self.dados)
        self.q = pd.read_csv(self.dados / QUESTIONARIO, encoding='utf-8-sig', dtype=str)

    def tearDown(self):
        self.tmp.cleanup()

    def gravar(self, q):
        q.to_csv(self.dados / QUESTIONARIO, index=False)

    def rodar(self):
        return calado(a.main, self.dados)


class Integracao(Dados):
    def test_pipeline_completo_da_demo(self):
        r = calado(a.demo, self.dados / 'demo')  # a demo tem os asserts de cada efeito injetado
        saida = self.dados / 'demo' / 'saida'
        self.assertEqual(sorted(p.name for p in saida.glob('*.csv')), sorted(CSVS_DA_DEMO))
        for nome in ['resumo-tcc.md', 'apendice.md', 'fluxo.png', 'ues_pre_pos.png', 'conhecimento_por_item.png',
                     'gam.png']:
            self.assertTrue((saida / nome).exists(), nome)
        self.assertEqual(list(r['antes_depois'].medida), ['UES', 'K'], 'só os 2 testes principais')
        abertas = pd.read_csv(saida / 'abertas.csv', encoding='utf-8-sig')
        self.assertTrue(abertas.texto.str.startswith("'=").any(), 'texto com = protegido contra fórmula')
        cmp = pd.read_csv(saida / 'descritiva_cmp.csv')
        self.assertNotIn('Não lembro o suficiente para comparar', cmp.opcao.tolist())
        self.assertAlmostEqual(cmp.pct.sum(), 100)
        resumo = (saida / 'resumo-tcc.md').read_text(encoding='utf-8')
        posicoes = [resumo.index(b) for b in a.BLOCOS]
        self.assertEqual(posicoes, sorted(posicoes), 'os 4 blocos, em ordem')
        for i, b in enumerate(a.BLOCOS):
            trecho = resumo[posicoes[i]:posicoes[i + 1] if i + 1 < len(posicoes) else None]
            self.assertEqual(trecho.count('!['), 1, f'1 gráfico em {b}')
            self.assertGreaterEqual(trecho.count('|---'), 1, f'tabela em {b}')
        self.assertEqual(resumo.count('associação, não causa'), 4, 'cabeçalho e blocos 2, 3 e 4')
        self.assertNotIn("\"'=", resumo, 'citação sem o apóstrofo da exportação')
        for trecho in ['Spearman parcial', 'exploratório, sem correção', 'Abandono:', 'Hexad dominante']:
            self.assertIn(trecho, resumo)
        apendice = (saida / 'apendice.md').read_text(encoding='utf-8')
        secoes = re.findall(r'^## (.*)$', apendice, re.M)
        self.assertEqual(len(secoes), len(SECOES_DO_APENDICE), secoes)
        for secao, esperado in zip(secoes, SECOES_DO_APENDICE):
            self.assertTrue(secao.startswith(esperado), (secao, esperado))
        for novo in secoes[-4:]:
            self.assertTrue('exploratório' in novo or novo.startswith('Perfil Hexad'), novo)
        self.assertIn('Ainda não descrito no texto do TCC; os autores decidem se entra.', apendice)
        self.assertIn('Filantropo e Espírito livre ficam sem par', apendice)
        self.assertIn('Par marcado como redundante não é evidência independente de Conquistador', apendice)
        self.assertIn('O centrado tira o nível geral de concordância da pessoa', apendice)
        hu = pd.read_csv(saida / 'hexad_uso.csv')
        self.assertEqual(list(hu.columns), ['tipo', 'uso', 'base', 'n', 'rho', 'p', 'n_rel', 'rho_rel', 'p_rel',
                                            'rho_aulas', 'redundante'])
        self.assertTrue(hu.rho_rel.notna().all() and hu.p_rel.between(0, 1).all(), 'demo tem Hexad completo')
        red = int(hu.redundante.sum())
        self.assertEqual(f'{red} par(es) redundante(s)' in resumo, red > 0, 'resumo conta os redundantes')
        self.assertIn('complementar, exploratório, fora da correção de Holm', apendice)
        marcados = pd.read_csv(saida / 'marcados.csv')
        self.assertEqual(list(marcados.columns), ['participante', 'momento', 'bloco'])
        regras = pd.read_csv(saida / 'exclusoes.csv').set_index('regra').n
        for bloco in ['Hexad', 'UES']:
            self.assertEqual(regras[f'resposta uniforme no {bloco} (só marcado, não excluído)'],
                             (marcados.bloco == bloco).sum())
            self.assertIn(f'resposta uniforme no {bloco} (só marcado, não excluído)', apendice)

    def test_duplicata_vale_o_primeiro_envio(self):
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            largo, _, _, envios, duplicatas = a.ler_questionario(self.dados)
        p = self.g['ids'][5]
        self.assertEqual(largo['pre'].loc[p, 'ATN'], 1, 'o segundo envio (ATN 5) foi descartado')
        self.assertEqual(duplicatas, 1)
        self.assertIn('vale o primeiro', saida.getvalue())
        self.assertEqual(envios.loc[p, 'pre'], pd.Timestamp(self.q[self.q.participante == p].respondido_em.min()))

    def test_duplicata_de_item_no_mesmo_envio(self):
        p = self.g['ids'][30]
        linha = self.q[(self.q.participante == p) & (self.q.item == 'KS6') & (self.q.momento == 'pre')].iloc[0]
        repetida = linha.copy()
        repetida['valor'] = str((int(linha.valor) + 1) % 4)
        self.gravar(pd.concat([self.q, repetida.to_frame().T]))
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            largo, *_ = a.ler_questionario(self.dados)
        self.assertEqual(largo['pre'].loc[p, 'KS6'], int(linha.valor))
        self.assertIn('vale a primeira', saida.getvalue())

    def test_ignora_outras_exportacoes_de_questionario(self):
        for nome in ['pesquisa-questionarios-2026-10-02.csv', 'pesquisa-questionario-respostas-2026-10-02.csv']:
            pd.DataFrame({'participante': ['x'], 'questionario': ['pre']}).to_csv(self.dados / nome, index=False)
        largo, *_ = calado(a.ler_questionario, self.dados)
        self.assertGreater(len(largo['pre']), 50)

    def test_valores_fora_da_escala_sao_ignorados(self):
        p = self.g['ids'][20]
        quando = self.q[(self.q.participante == p) & (self.q.momento == 'pos')].respondido_em.iloc[0]
        extra = pd.DataFrame([(p, 'pos', 'GAM1', '9', quando), (p, 'pos', 'MOT', '6', quando),
                              (p, 'pos', 'XYZ', '3', quando)], columns=self.q.columns)
        q = self.q[~((self.q.participante == p) & (self.q.momento == 'pos') & self.q.item.isin(['GAM1', 'MOT']))]
        self.gravar(pd.concat([q, extra]))
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            largo, *_ = a.ler_questionario(self.dados)
        self.assertTrue(np.isnan(largo['pos'].loc[p, 'GAM1']))
        self.assertTrue(np.isnan(largo['pos'].loc[p, 'MOT']))
        self.assertNotIn('XYZ', largo['pos'])
        self.assertIn('fora da escala', saida.getvalue())
        self.assertIn('fora de ITENS', saida.getvalue())


class Erros(Dados):
    def test_falta_questionario(self):
        (self.dados / QUESTIONARIO).unlink()
        with self.assertRaisesRegex(FileNotFoundError, 'pesquisa-questionario'):
            a.main(self.dados)

    def test_falta_coluna_no_questionario(self):
        self.gravar(self.q.drop(columns='valor'))
        with self.assertRaisesRegex(ValueError, 'faltam as colunas valor'):
            a.main(self.dados)

    def test_falta_csv_do_app_com_pos(self):
        (self.dados / 'pesquisa-respostas.csv').unlink()
        with self.assertRaisesRegex(FileNotFoundError, 'pesquisa-respostas'):
            calado(a.main, self.dados)

    def test_falta_coluna_no_engajamento(self):
        for nome in ['pesquisa-engajamento.csv', 'pesquisa-engajamento-2026-09-01.csv']:
            e = pd.read_csv(self.dados / nome)
            e.drop(columns='badges').to_csv(self.dados / nome, index=False)
        with self.assertRaisesRegex(ValueError, 'badges'):
            calado(a.main, self.dados)

    def test_sem_pre(self):
        self.gravar(self.q[self.q.momento == 'pos'])
        with self.assertRaisesRegex(ValueError, 'pré'):
            calado(a.main, self.dados)

    def test_linha_de_comando_mostra_erro_sem_traceback(self):
        with tempfile.TemporaryDirectory() as vazio:
            p = subprocess.run([sys.executable, str(AQUI / 'analise.py'), vazio], capture_output=True, text=True,
                               encoding='utf-8', env={'PYTHONIOENCODING': 'utf-8', **__import__('os').environ})
        self.assertEqual(p.returncode, 1)
        self.assertIn('Erro: Falta o arquivo pesquisa-questionario', p.stderr)
        self.assertNotIn('Traceback', p.stderr)


class Bordas(Dados):
    def test_ninguem_com_c1_sim(self):
        q = self.q[~self.q.item.isin(['C2', 'C3', 'C4', 'CMP'] + a.UES_ITENS) | (self.q.momento == 'pos')]
        q = q[q.item != 'CMP']
        q.loc[q.item == 'C1', 'valor'] = '1'
        self.gravar(q)
        r = self.rodar()
        self.assertEqual(r['antes_depois'].medida.tolist(), ['K'], 'UES pareada pulada, conhecimento segue')
        np.testing.assert_equal(r['antes_depois'].p_holm.iloc[0], r['antes_depois'].p.iloc[0],
                                'um teste só: Holm igual ao p')
        resumo = (self.dados / 'saida' / 'resumo-tcc.md').read_text(encoding='utf-8')
        self.assertIn('Ninguém com C1 = Sim', resumo)
        self.assertTrue(all(b in resumo for b in a.BLOCOS))

    def test_todos_com_a_mesma_resposta(self):
        q = self.q.copy()
        likert = q.join(a.ITENS.tipo, on=['momento', 'item']).tipo == 'likert'
        q.loc[likert | q.item.isin(a.K), 'valor'] = '3'  # nas situações, 3 = "Não sei"
        q.loc[q.item == 'ATN', 'valor'] = '1'
        self.gravar(q)
        r = self.rodar()
        self.assertTrue(r['antes_depois'].p.isna().all())
        self.assertTrue(r['confiabilidade'].alfa.isna().all())
        self.assertTrue(r['correlacoes_gam'].rho.isna().all())
        self.assertTrue((r['mudanca_k'].pct_acerto_pre == 0).all())
        m = r['marcados']
        self.assertEqual(set(m[m.bloco == 'Hexad'].participante), set(r['perfil_k']['pre'].index),
                         'todo pré válido marcado no Hexad')

    def test_resposta_uniforme_so_marca(self):
        p = self.g['ids'][10]  # respondeu o pós e acertou os dois ATN
        q = self.q.copy()
        eu = q.participante == p
        q.loc[eu & (q.momento == 'pre') & q.item.isin(sum(a.HEXAD.values(), [])), 'valor'] = '7'
        q.loc[eu & (q.momento == 'pos') & q.item.isin(a.UES_ITENS), 'valor'] = '1'  # bruto: invertido não marcaria
        self.gravar(q)
        r = self.rodar()
        m = r['marcados'].set_index(['participante', 'momento']).bloco
        self.assertIn('Hexad', m.loc[[(p, 'pre')]].tolist())
        self.assertIn('UES', m.loc[[(p, 'pos')]].tolist())
        ad = r['antes_depois'].set_index('medida').n_pares
        self.assertEqual((ad['UES'], ad['K']), (self.g['n_ues_pareada'], self.g['n_k_pareada']), 'n não muda')
        resumo = (self.dados / 'saida' / 'resumo-tcc.md').read_text(encoding='utf-8')
        self.assertLess(resumo.index('Resposta uniforme'), resumo.index(a.BLOCOS[1]), 'frase na seção 1')

    def test_resumo_conta_pares_redundantes(self):
        # Na demo |rho_aulas| fica entre 0,6 e 0,75: com o limite em 0,5, os 4 pares fora das aulas viram redundantes.
        with mock.patch.object(a, 'LIMITE_REDUNDANTE', 0.5):
            r = self.rodar()
        self.assertEqual(int(r['hexad_uso'].redundante.sum()), 4)
        resumo = (self.dados / 'saida' / 'resumo-tcc.md').read_text(encoding='utf-8')
        self.assertIn('4 par(es) redundante(s)', resumo)

    def test_menos_de_5_participantes(self):
        ids = self.g['ids'][5:9]  # passam no ATN
        self.gravar(self.q[self.q.participante.isin(ids)])
        for nome in ['pesquisa-engajamento.csv', 'pesquisa-respostas.csv', 'pesquisa-eventos-2026-10-01.csv']:
            t = pd.read_csv(self.dados / nome)
            t[t.participante.isin(ids)].to_csv(self.dados / nome, index=False)
        r = self.rodar()
        self.assertTrue(r['correlacoes_gam'].rho.isna().all(), 'Spearman exige n >= 5')
        self.assertTrue(r['hexad_uso'].rho.isna().all(), 'Spearman exige n >= 5')
        self.assertTrue(r['hexad_uso'].rho_rel.isna().all(), 'centrado também exige n >= 5')
        self.assertTrue(r['correlacoes_conhecimento'].rho_parcial.isna().all(), 'parcial exige n >= 6')
        self.assertLessEqual(r['antes_depois'].n_pares.max(), 4)

    def test_uso_ate_o_pos_e_ate_o_fechamento(self):
        _, _, _, envios, _ = calado(a.ler_questionario, self.dados)
        cortado, _, _ = calado(a.features, self.dados, envios)
        inteiro, _, _ = calado(a.features, self.dados)
        uso = self.g['uso'].reindex(cortado.index)
        for c in ['dias_ativos', 'badges', 'pontos', 'visitas_ranking', 'visitas_conquistas']:
            self.assertTrue((cortado[c] == uso[c].astype(float)).all(), c)
        self.assertTrue((inteiro.badges >= cortado.badges).all())
        self.assertGreater((inteiro.badges > cortado.badges).sum(), 0, 'há uso depois do pós no período inteiro')

    def test_repeticoes_so_de_aula(self):
        antes, _, _ = calado(a.features, self.dados)
        resp = pd.read_csv(self.dados / 'pesquisa-respostas.csv')
        p = antes.index[0]
        trivia = pd.DataFrame([(p, 'trivia', 'facil', 777, True, f'2026-10-2{d} 10:00', None) for d in range(3)],
                              columns=resp.columns)
        pd.concat([resp, trivia]).to_csv(self.dados / 'pesquisa-respostas.csv', index=False)
        depois, _, _ = calado(a.features, self.dados)
        self.assertEqual(depois.repeticoes_sem_pontos[p], antes.repeticoes_sem_pontos[p], 'trivia não conta')

    def test_metadata_nula_na_leitura(self):
        ev = pd.read_csv(self.dados / 'pesquisa-eventos-2026-10-01.csv')
        self.assertTrue(ev[ev.tipo_evento == 'aula_conteudo_lido'].metadata.isna().any(), 'a demo tem nula')
        f, _, _ = calado(a.features, self.dados)
        self.assertEqual(f.rolagem_mediana[self.g['ids'][0]], 80)

    def test_ninguem_usou_o_app(self):
        pd.read_csv(self.dados / 'pesquisa-respostas.csv').head(0).to_csv(self.dados / 'pesquisa-respostas.csv',
                                                                          index=False)
        r = self.rodar()
        self.assertEqual(r['faixas'].n['0–4'], r['faixas'].n.sum(), 'sem respostas, todos com 0 aulas')
        self.assertEqual(r['exclusoes'].set_index('regra').n['pré depois da 1ª atividade (fora do pareamento)'], 0)

    def test_abandono_janela_de_14_dias(self):
        _, _, _, envios, _ = calado(a.ler_questionario, self.dados)
        sem_pos = envios.index[envios.pos.isna() & (envios.pre + a.LIBERA_POS < a.FIM_COLETA)]
        janela = pd.DataFrame({'pre': envios.pre, 'pos': envios.pre + a.LIBERA_POS})
        na_janela = calado(a.features, self.dados, janela)[0].dias_ativos
        ate_fechar = calado(a.features, self.dados, envios)[0].dias_ativos
        livres = [q for q in sem_pos if na_janela[q] == ate_fechar[q]
                  and envios.pre[q] + pd.Timedelta(days=20, hours=1) < a.FIM_COLETA]
        p = livres[0]  # sem uso depois do dia 14, e o dia 20 ainda cabe antes do fechamento
        antes = na_janela[p]
        ses = pd.read_csv(self.dados / 'pesquisa-sessoes.csv')
        dia20 = envios.pre[p] + pd.Timedelta(days=20, hours=1)
        pd.concat([ses, pd.DataFrame([(p, dia20, dia20 + pd.Timedelta(minutes=5), 300)], columns=ses.columns)]) \
            .to_csv(self.dados / 'pesquisa-sessoes.csv', index=False)
        self.assertEqual(calado(a.features, self.dados, janela)[0].dias_ativos[p], antes, 'dia 20 fora da janela')
        self.assertGreater(calado(a.features, self.dados, envios)[0].dias_ativos[p], antes,
                           'no uso até o pós (fechamento), o dia 20 conta')
        # O main usa a janela no abandono (não o uso até o pós).
        largo, *_ = calado(a.ler_questionario, self.dados)
        validos = a.filtrar_atencao(largo['pre'])[0].index
        elegiveis = validos[(envios.pre.reindex(validos) + a.LIBERA_POS < a.FIM_COLETA).to_numpy()]
        respondeu = elegiveis.isin(largo['pos'].index)

        def u_dias(uso):
            return a.mann_whitney(uso.reindex(elegiveis[respondeu]), uso.reindex(elegiveis[~respondeu]))[0]

        tabela = self.rodar()['abandono']['tabela'].set_index('variavel')
        u_janela = u_dias(calado(a.features, self.dados, janela)[0].dias_ativos)
        self.assertEqual(tabela.U['dias_ativos'], u_janela)
        self.assertNotEqual(u_janela, u_dias(calado(a.features, self.dados, envios)[0].dias_ativos),
                            'o dia 20 mudaria o U se o uso fosse o do pós')

    def test_linha_sem_data_fica_no_envio(self):
        q = self.q.copy()
        p = self.g['ids'][10]  # respondeu o pós e acertou os dois ATN
        linha = q.index[(q.participante == p) & (q.momento == 'pos') & (q.item == 'KS6')][0]
        q.loc[linha, 'respondido_em'] = ''
        self.gravar(q)
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            largo, _, _, envios, duplicatas = a.ler_questionario(self.dados)
        self.assertEqual(duplicatas, 1, 'só o reenvio da demo; a linha sem data não vira duplicata')
        self.assertFalse(np.isnan(largo['pos'].loc[p, 'KS6']), 'a linha sem data fica no envio')
        self.assertTrue(pd.notna(envios.loc[p, 'pos']))
        self.assertIn('sem respondido_em', saida.getvalue())

    def test_so_importa_dependencias_permitidas(self):
        # Sem bibliotecas de aprendizado de máquina: só a biblioteca padrão, pandas, numpy, scipy e matplotlib.
        arvore = ast.parse((AQUI / 'analise.py').read_text(encoding='utf-8'))
        modulos = {n.name.split('.')[0] for no in ast.walk(arvore) if isinstance(no, ast.Import) for n in no.names}
        modulos |= {no.module.split('.')[0] for no in ast.walk(arvore) if isinstance(no, ast.ImportFrom)}
        self.assertLessEqual(modulos, {'json', 'os', 're', 'sys', 'tempfile', 'unicodedata', 'warnings', 'html',
                                       'pathlib', 'matplotlib', 'numpy', 'pandas', 'scipy'})
        requisitos = (AQUI / 'requirements.txt').read_text(encoding='utf-8').split()
        self.assertEqual([r.split('>=')[0] for r in requisitos], ['pandas', 'scipy', 'matplotlib'])

    def test_regressao_dos_testes_principais_contra_o_bak(self):
        bak = AQUI / 'analise.py.bak'
        if not bak.exists():
            self.skipTest('analise.py.bak não existe')
        antigo = carregar_copia(bak, 'analise_bak')
        with tempfile.TemporaryDirectory() as outra:
            for arquivo in self.dados.glob('pesquisa-*.csv'):
                shutil.copy2(arquivo, outra)  # mantém a data: vale o CSV modificado por último
            calado(antigo.main, Path(outra))
            calado(a.main, self.dados)
            # O conhecimento mudou de formato (situações KS) depois do .bak: compara só a UES. O p de Holm da
            # UES também muda, porque agora o Holm tem as 2 linhas.
            self.assertEqual((Path(outra) / 'saida' / 'ues_subescalas.csv').read_bytes(),
                             (self.dados / 'saida' / 'ues_subescalas.csv').read_bytes())
            velho, novo = (pd.read_csv(Path(d) / 'saida' / 'antes_depois.csv').set_index('medida').loc['UES']
                           .drop('p_holm') for d in (outra, self.dados))
            pd.testing.assert_series_equal(velho, novo)

    def test_atividade_depois_do_pos_fica_fora_das_aulas(self):
        largo, _, _, envios, _ = calado(a.ler_questionario, self.dados)
        resp = pd.read_csv(self.dados / 'pesquisa-respostas.csv')
        final = 'Missão Final: Primeira Linha de Defesa'
        sem_15 = resp.groupby('participante').contexto.agg(lambda c: final not in set(c))
        p = sem_15[sem_15 & sem_15.index.isin(envios.pos.dropna().index)].index[0]
        tarde = (envios.loc[p, 'pos'] + pd.Timedelta(days=1)).isoformat()
        extra = resp[resp.participante == p].head(1).assign(contexto=final,
                                                            questao_id=150, respondido_em=tarde)
        pd.concat([resp, extra]).to_csv(self.dados / 'pesquisa-respostas.csv', index=False)
        _, aulas, _ = a.features(self.dados, envios)
        self.assertNotIn('15', aulas.get(p, set()))
        self.assertIn('15', a.features(self.dados)[1][p], 'sem limite, conta tudo')

    def test_todo_pos_erra_o_atn(self):
        q = self.q.copy()
        q.loc[(q.item == 'ATN') & (q.momento == 'pos'), 'valor'] = '4'
        self.gravar(q)
        r = self.rodar()
        self.assertIn('excluídas pelo ATN', r['aviso'])
        self.assertNotIn('antes_depois', r)

    def test_nenhum_par_pre_pos(self):
        q = self.q.copy()
        q.loc[q.momento == 'pos', 'participante'] = 'outro-' + q.loc[q.momento == 'pos', 'participante']
        self.gravar(q)
        r = self.rodar()
        self.assertIn('Nenhum participante com pré e pós', r['aviso'])
        self.assertTrue((self.dados / 'saida' / 'resumo-tcc.md').exists())

    def test_pos_ausente_roda_so_o_pre(self):
        p = self.g['ids'][10]
        q = self.q[self.q.momento == 'pre'].copy()
        q.loc[(q.participante == p) & q.item.isin(sum(a.HEXAD.values(), [])), 'valor'] = '7'
        self.gravar(q)
        for nome in APP:
            (self.dados / nome).unlink()
        r = self.rodar()
        self.assertNotIn('antes_depois', r)
        self.assertEqual(set(r['confiabilidade'].momento), {'pre'})
        saida = self.dados / 'saida'
        for nome in ['descritiva_anamnese.csv', 'descritiva_a6_qtd.csv', 'confiabilidade.csv', 'resumo-tcc.md',
                     'apendice.md', 'marcados.csv']:
            self.assertTrue((saida / nome).exists(), nome)
        marcados = pd.read_csv(saida / 'marcados.csv')
        self.assertEqual(list(marcados.columns), ['participante', 'momento', 'bloco'])
        self.assertEqual(marcados.values.tolist(), [[p, 'pre', 'Hexad']], 'só pré também marca')
        resumo = (saida / 'resumo-tcc.md').read_text(encoding='utf-8')
        self.assertIn('Resposta uniforme', resumo)
        self.assertIn('Sem nenhuma resposta do pós', resumo)
        self.assertIn(a.BLOCOS[0], resumo)
        self.assertNotIn(a.BLOCOS[1], resumo, 'sem pós, só o bloco da amostra')


if __name__ == '__main__':
    unittest.main()
