import { InvitationPage } from "@/components/invite/invitation-page";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationPage key={token} token={token} />;
}
