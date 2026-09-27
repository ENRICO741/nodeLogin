import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import '../styles/Profile.css';

function ProfileEdit({ userId, onCancel, onSave }) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    bio: '',
    avatar: 'https://via.placeholder.com/150',
    nivel: 'iniciante',
    ritmo: 'moderado',
    areaInteresse: '',
    badges: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // usa `api` compartilhado para todas as requisições
  const nivelOptions = ['iniciante', 'intermediário', 'avançado'];
  const ritmoOptions = ['lento', 'moderado', 'rápido'];
  const areasOptions = ['Conformidade', 'Privacidade', 'Segurança', 'Governança', 'Geral'];

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/profile/${userId}`);
      setFormData(response.data);
      setError('');
    } catch (err) {
      console.error('Erro ao buscar perfil:', err);
      setError('Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, avatar: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      setError('Nome completo é obrigatório');
      return false;
    }
    if (!formData.email.trim()) {
      setError('Email é obrigatório');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Email inválido');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) return;

    try {
      setSaving(true);
      const response = await api.put(`/profile/${userId}`, formData);
      setSuccess('Perfil atualizado com sucesso!');
      if (onSave) onSave(response.data.profile);
      setTimeout(() => onCancel(), 1200);
    } catch (err) {
      console.error('Erro ao salvar perfil:', err);
      setError(err.response?.data?.error || 'Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="profile-container"><p>Carregando perfil...</p></div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Editar Perfil</h1>
      </div>

      <form className="profile-form" onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="form-section">
          <h3>Foto do Perfil</h3>
          <div className="avatar-preview">
            <img src={formData.avatar} alt="Avatar preview" />
          </div>
          <input type="file" accept="image/*" onChange={handleAvatarChange} className="file-input" />
        </div>

        <div className="form-section">
          <h3>Informações Pessoais</h3>
          <div className="form-group">
            <label>Nome Completo *</label>
            <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Seu nome completo" required />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="seu@email.com" required />
          </div>
          <div className="form-group">
            <label>Bio</label>
            <textarea name="bio" value={formData.bio} onChange={handleChange} placeholder="Conte um pouco sobre você..." rows="4" />
          </div>
        </div>

        <div className="form-section">
          <h3>Preferências de Aprendizado</h3>
          <div className="form-group">
            <label>Nível</label>
            <select name="nivel" value={formData.nivel} onChange={handleChange}>
              {nivelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Ritmo de Estudo</label>
            <select name="ritmo" value={formData.ritmo} onChange={handleChange}>
              {ritmoOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Área de Interesse</label>
            <select name="areaInteresse" value={formData.areaInteresse} onChange={handleChange}>
              <option value="">Selecione uma área</option>
              {areasOptions.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Salvando...' : 'Salvar Alterações'}</button>
        </div>
      </form>
    </div>
  );
}

export default ProfileEdit;
