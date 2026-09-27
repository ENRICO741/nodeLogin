import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import AuthPage from './components/AuthPage';
import AppLayout from './components/AppLayout';
import AulasList from './pages/AulasList';
import AulaDetail from './pages/AulaDetail';
import TriviaDificuldade from './pages/TriviaDificuldade';
import TriviaRodada from './pages/TriviaRodada';
import Badges from './pages/Badges';
import PerfilPage from './pages/PerfilPage';
import Estatisticas from './pages/Estatisticas';
import GerenciarQuestoes from './pages/GerenciarQuestoes';
import * as telemetry from './lib/telemetry';

function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    telemetry.iniciarSessao(user.id);
  };

  const handleLogout = () => {
    telemetry.finalizarSessaoAtual();
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <BrowserRouter>
      <AppLayout onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Navigate to="/aulas" replace />} />
          <Route path="/aulas" element={<AulasList userId={currentUser.id} />} />
          <Route path="/aulas/:aulaId" element={<AulaDetail userId={currentUser.id} />} />
          <Route path="/trivia" element={<TriviaDificuldade userId={currentUser.id} />} />
          <Route path="/trivia/:rodadaId" element={<TriviaRodada />} />
          <Route path="/badges" element={<Badges userId={currentUser.id} />} />
          <Route path="/perfil" element={<PerfilPage userId={currentUser.id} />} />
          <Route path="/estatisticas" element={<Estatisticas />} />
          <Route path="/questoes" element={<GerenciarQuestoes />} />
          <Route path="*" element={<Navigate to="/aulas" replace />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

export default App;
