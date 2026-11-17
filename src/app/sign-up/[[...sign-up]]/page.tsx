import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="page-shell auth-page-shell">
      <SignUp />
    </div>
  );
}
