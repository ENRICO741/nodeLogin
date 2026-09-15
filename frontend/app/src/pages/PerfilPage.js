import { useState } from 'react';
import ProfileView from '../components/ProfileView';
import ProfileEdit from '../components/ProfileEdit';

function PerfilPage({ userId }) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  return isEditingProfile ? (
    <ProfileEdit
      userId={userId}
      onCancel={() => setIsEditingProfile(false)}
      onSave={() => setIsEditingProfile(false)}
    />
  ) : (
    <ProfileView userId={userId} onEdit={() => setIsEditingProfile(true)} />
  );
}

export default PerfilPage;
