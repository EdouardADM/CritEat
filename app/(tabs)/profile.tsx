import { useAuth } from "../../context/AuthContext";
import ProfileView from "../../components/ProfileView";

export default function ProfileTab() {
  const { user } = useAuth();
  if (!user) return null; // le layout global redirige vers /login si non authentifié
  return <ProfileView userId={user.id} />;
}
