import { Skeleton } from "@/components/ui/display";

export default function RootLoading() {
  return (
    <div className="flex flex-col gap-6 py-6 sm:py-10" aria-label="Loading page" aria-busy="true">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-11 w-[min(65%,420px)]" />
        <Skeleton className="h-4 w-[min(85%,620px)]" />
      </div>
      <Skeleton className="h-[120px] rounded-lg" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-[180px] rounded-lg" />)}
      </div>
    </div>
  );
}
