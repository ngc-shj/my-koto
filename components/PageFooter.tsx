import type { ReactNode } from "react";
import Attribution from "@/components/Attribution";

type Props = {
  // Dataset key for the page's primary data source. Resolves to the
  // canonical Attribution line (出典: 「name」、holder、license).
  dataset?: string;
  // Free slot for extra bottom content tied to this page's data — most
  // commonly a feed/version stamp on bus/event pages.
  children?: ReactNode;
};

export default function PageFooter({ dataset, children }: Props) {
  return (
    <footer className="mt-8 pt-4 border-t border-gray-100 space-y-1">
      {dataset && <Attribution dataset={dataset} />}
      {children}
    </footer>
  );
}
