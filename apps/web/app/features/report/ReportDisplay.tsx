import type { ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { CardPaper } from "./CardPaper";
import { ReportPaper } from "./ReportPaper";

/** Daily reports use the animated card edition; period reports keep the newspaper layout. */
export function ReportDisplay({ report, index }: { report: ReportDetail; index: ReportNavigationEntry[] }) {
  return report.kind === "daily"
    ? <CardPaper report={report} index={index} />
    : <ReportPaper report={report} index={index} />;
}
