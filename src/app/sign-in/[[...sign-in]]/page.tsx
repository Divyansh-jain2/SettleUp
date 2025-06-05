import { SignIn } from '@clerk/nextjs'

export default function Page() {
  return (
    <div className="flex px-12 pt-14 pb-12 justify-center items-center">
      <SignIn />
    </div>
  );
}