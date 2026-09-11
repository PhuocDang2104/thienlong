import { WelcomeDisplay } from "@/components/welcome/welcome-display";

export default async function Page({ params }: { params: Promise<{ screenToken: string }> }) {
  const { screenToken } = await params;
  return <WelcomeDisplay key={screenToken} screenToken={screenToken} />;
}
