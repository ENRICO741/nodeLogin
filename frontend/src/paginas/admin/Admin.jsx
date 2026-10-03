import { Link } from 'react-router';
import { ArrowLeft, BarChart3, BookOpen, ChevronRight, Users, Zap } from 'lucide-react';
import styles from './Admin.module.css';

const SECOES = [
  {
    para: '/admin/estatisticas',
    titulo: 'Estatísticas',
    descricao: 'Desempenho por aula, trivia e usuário',
    Icone: BarChart3,
  },
  {
    para: '/admin/aulas',
    titulo: 'Aulas',
    descricao: 'Criar e editar aulas e suas perguntas',
    Icone: BookOpen,
  },
  {
    para: '/admin/trivia',
    titulo: 'Questões de trivia',
    descricao: 'Criar e editar perguntas por dificuldade',
    Icone: Zap,
  },
  {
    para: '/admin/usuarios',
    titulo: 'Usuários',
    descricao: 'Acesso de administrador e redefinição de senha',
    Icone: Users,
  },
];

export function VoltarAdmin({ para = '/admin', rotulo = 'Administração' }) {
  return (
    <Link to={para} className={styles.voltar}>
      <ArrowLeft aria-hidden="true" size={18} /> {rotulo}
    </Link>
  );
}

export function PainelAdmin() {
  return (
    <div className="pagina">
      <VoltarAdmin para="/perfil" rotulo="Perfil" />
      <header className="cabecalho-pagina">
        <h1>Administração</h1>
        <p>Conteúdo e indicadores do programa de conscientização.</p>
      </header>
      <ul className="pilha" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {SECOES.map(({ para, titulo, descricao, Icone }) => (
          <li key={para}>
            <Link to={para} className={`cartao ${styles.secao}`}>
              <Icone aria-hidden="true" size={24} className={styles.icone} />
              <span className={styles.textos}>
                <strong>{titulo}</strong>
                <span>{descricao}</span>
              </span>
              <ChevronRight aria-hidden="true" size={20} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
