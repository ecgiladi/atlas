import { Compass } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <Compass size={48} aria-hidden />
      <h1 className="text-2xl font-bold">Atlas</h1>
      <p className="text-gray-600">
        גילוי והשוואת יעדי טיול. המפה תגיע בקרוב.
      </p>
    </main>
  );
}
