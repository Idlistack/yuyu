import { DotLoader } from "@/components/brand/DotLoader";
import { OrgDashboardSkeleton } from "@/components/dashboard/OrgDashboardSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <DotLoader size={40} label="Loading organisation" className="self-center" />
      <OrgDashboardSkeleton />
    </div>
  );
}
