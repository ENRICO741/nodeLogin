import { useState } from 'react';
import api from '../lib/api';

const initialCredentials = { username: '', password: '' };
const initialStatus = { message: '', error: '' };

function AuthPage({ onLoginSuccess }) {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  const clearCredentials = () => setCredentials(initialCredentials);
  const resetStatus = () => setStatus(initialStatus);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const showError = (message) => setStatus({ message: '', error: message });
  const showMessage = (message) => setStatus({ message, error: '' });

  const handleAuth = async (event) => {
    event.preventDefault();
    resetStatus();
    setLoading(true);

    if (isRegister && credentials.password.length < 6) {
      showError('A senha precisa ter pelo menos 6 caracteres');
      setLoading(false);
      return;
    }

    const url = isRegister ? '/register' : '/login';
    const payload = { username: credentials.username, password: credentials.password };

    try {
      const response = await api.post(url, payload);

      if (isRegister) {
        showMessage('Conta criada com sucesso');
        setIsRegister(false);
      } else {
        showMessage(response.data.message || 'Login bem-sucedido');
        onLoginSuccess(response.data.user);
      }

      clearCredentials();
    } catch (err) {
      const apiError = err.response?.data?.error || 'Erro ao conectar com o servidor';
      showError(apiError);
    } finally {
      setLoading(false);
    }
  };

  const authTitle = isRegister ? 'Criar conta' : 'Entrar';
  const authDescription = isRegister
    ? 'Preencha os dados para criar sua conta'
    : 'Faça login na sua conta';

  return (
    <div className="App">
      <main className="login-page">
        <section className="login-card">
          <h1>{authTitle}</h1>
          <p>{authDescription}</p>

          <form onSubmit={handleAuth}>
            <label htmlFor="username">Usuário</label>
            <input
              type="text"
              id="username"
              name="username"
              value={credentials.username}
              onChange={handleChange}
              placeholder="Seu usuário"
              required
            />

            <label htmlFor="password">Senha</label>
            <input
              type="password"
              id="password"
              name="password"
              value={credentials.password}
              onChange={handleChange}
              placeholder="Sua senha"
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? (isRegister ? 'Cadastrando...' : 'Entrando...') : authTitle}
            </button>
          </form>

          <p className="auth-footer">
            Não tem conta?{' '}
            <button type="button" onClick={() => setIsRegister((prev) => !prev)} className="link-button">
              {isRegister ? 'Voltar para login' : 'Criar conta'}
            </button>
          </p>

          {status.message && <div className="status-message success">{status.message}</div>}
          {status.error && <div className="status-message error">{status.error}</div>}
        </section>
      </main>
    </div>
  );
}

export default AuthPage;
