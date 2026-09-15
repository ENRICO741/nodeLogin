import '../styles/Question.css';

const LETRAS = ['a', 'b', 'c', 'd'];

function QuestionCard({ question, selected, feedback, onSelect, onNext, isLast }) {
  return (
    <div className="question-card">
      {question.imagem_url && (
        <img className="question-image" src={question.imagem_url} alt="" />
      )}
      <h2 className="question-enunciado">{question.enunciado}</h2>

      <div className="question-alternativas">
        {LETRAS.map((letra) => {
          const texto = question[`alternativa_${letra}`];
          if (!texto) return null;

          const isSelected = selected === letra;
          const isCorrectAnswer = feedback && letra === feedback.alternativaCorreta;
          const isWrongSelected = feedback && isSelected && !feedback.correta;

          const classNames = ['alternativa-btn'];
          if (isSelected) classNames.push('selected');
          if (feedback && isCorrectAnswer) classNames.push('correct');
          if (isWrongSelected) classNames.push('incorrect');

          return (
            <button
              key={letra}
              type="button"
              className={classNames.join(' ')}
              disabled={!!feedback}
              onClick={() => onSelect(letra)}
            >
              <span className="alternativa-letra">{letra.toUpperCase()}</span>
              {texto}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={`question-feedback ${feedback.correta ? 'correta' : 'incorreta'}`}>
          <p className="feedback-titulo">{feedback.correta ? '✔ Resposta correta!' : '✘ Resposta incorreta'}</p>
          {feedback.explicacao && <p className="feedback-explicacao">{feedback.explicacao}</p>}
          <button type="button" className="btn-proxima" onClick={onNext}>
            {isLast ? 'Ver resultado' : 'Próxima pergunta'}
          </button>
        </div>
      )}
    </div>
  );
}

export default QuestionCard;
