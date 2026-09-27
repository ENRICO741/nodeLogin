import { useState } from 'react';
import { Campo } from '../../componentes/Campo';
import { Aviso } from '../../componentes/Estado';

const LETRAS = ['a', 'b', 'c', 'd'];

// Formulário de questão compartilhado por aulas e trivia. `extras` recebe campos próprios (ex.: dificuldade).
export function FormQuestao({ questao = {}, extras, aoEnviar, aoCancelar, textoEnviar = 'Salvar questão' }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const porCampo = erro?.errosPorCampo ?? {};

  async function enviar(evento) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));
    setEnviando(true);
    setErro(null);
    try {
      await aoEnviar({
        ...dados,
        pontos: Number(dados.pontos),
        imagem_url: dados.imagem_url || null,
        explicacao: dados.explicacao || null,
      });
      if (!questao.id) evento.target.reset();
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="pilha" onSubmit={enviar} noValidate>
      <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
      {extras?.(porCampo)}
      <Campo
        label="Enunciado"
        name="enunciado"
        multilinha
        defaultValue={questao.enunciado}
        erro={porCampo.enunciado}
      />
      {LETRAS.map((l) => (
        <Campo
          key={l}
          label={`Alternativa ${l.toUpperCase()}`}
          name={`alternativa_${l}`}
          defaultValue={questao[`alternativa_${l}`]}
          erro={porCampo[`alternativa_${l}`]}
        />
      ))}
      <Campo label="Resposta correta" name="resposta_correta" defaultValue={questao.resposta_correta ?? 'a'}>
        {LETRAS.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </Campo>
      <Campo
        label="Explicação"
        name="explicacao"
        multilinha
        ajuda="Mostrada depois da resposta. Explique o porquê."
        defaultValue={questao.explicacao ?? ''}
        erro={porCampo.explicacao}
      />
      <Campo
        label="Pontos"
        name="pontos"
        type="number"
        min={0}
        max={100}
        defaultValue={questao.pontos ?? 10}
        erro={porCampo.pontos}
      />
      <Campo
        label="Imagem (opcional)"
        name="imagem_url"
        type="url"
        placeholder="https://…"
        ajuda="Somente endereços https://"
        defaultValue={questao.imagem_url ?? ''}
        erro={porCampo.imagem_url}
      />
      <div className="linha">
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : textoEnviar}
        </button>
        {aoCancelar && (
          <button type="button" className="botao botao--secundario" onClick={aoCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
