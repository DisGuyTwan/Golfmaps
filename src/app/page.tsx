import GolfCourseCalculator from "@/components/GolfCourseCalculator";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Set by /api/kress/callback after a Kress sign-in attempt.
  const kress = (await searchParams).kress;
  return (
    <main className="h-[100dvh] w-full overflow-hidden">
      <GolfCourseCalculator kressReturn={typeof kress === "string" ? kress : null} />
    </main>
  );
}
