import { Component } from 'react';
import { ErroCarregamento } from './Estado';

// Evita tela branca: um erro de renderização mostra uma mensagem com opção de recarregar.
export class ErrorBoundary extends Component {
  state = { erro: null };

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error(erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <ErroCarregamento
        erro={{ message: 'Algo deu errado nesta tela.' }}
        onTentarDeNovo={() => window.location.reload()}
      />
    );
  }
}
