import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import '../styles/Profile.css';

function ProfileView({ userId, onEdit }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/profile/${userId}`);
      setProfile(response.data);
      setError('');
    } catch (err) {
      console.error('Erro ao buscar perfil:', err);
      setError('Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="profile-container"><p>Carregando perfil...</p></div>;
  }

  if (error) {
    return <div className="profile-container"><p className="error">{error}</p></div>;
  }

  if (!profile) {
    return <div className="profile-container"><p>Perfil não encontrado</p></div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Meu Perfil</h1>
        <button className="btn-edit" onClick={onEdit}>✎ Editar</button>
      </div>

      <div className="profile-card">
        <div className="profile-avatar">
          <img src={profile.avatar} alt={profile.fullName || profile.username} />
        </div>

        <div className="profile-info">
          <div className="info-section">
            <h2>{profile.fullName || profile.username}</h2>
            <p className="username">@{profile.username}</p>
          </div>

          <div className="info-row">
            <div className="info-item">
              <label>Email</label>
              <p>{profile.email || 'Não informado'}</p>
            </div>
            <div className="info-item">
              <label>Bio</label>
              <p>{profile.bio || 'Sem bio'}</p>
            </div>
          </div>

          <div className="preferences-section">
            <h3>Preferências de Aprendizado</h3>
            <div className="prefs-grid">
              <div className="pref-item">
                <label>Nível</label>
                <span className="badge badge-nivel">{profile.nivel}</span>
              </div>
              <div className="pref-item">
                <label>Ritmo</label>
                <span className="badge badge-ritmo">{profile.ritmo}</span>
              </div>
              <div className="pref-item">
                <label>Área de Interesse</label>
                <span>{profile.areaInteresse || 'Não informada'}</span>
              </div>
            </div>
          </div>

          <div className="badges-section">
            <Link to="/badges" className="link-conquistas">Ver todas as conquistas →</Link>
          </div>

          <div className="profile-footer">
            <p className="created-at">Membro desde {new Date(profile.createdAt).toLocaleDateString('pt-BR')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileView;
