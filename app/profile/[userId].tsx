import { useLocalSearchParams } from "expo-router";
import ProfileView from "../../components/ProfileView";

export default function ProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <ProfileView userId={userId ?? ""} />;
}
