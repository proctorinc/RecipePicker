"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function GlobalError() {
  return (
    <html lang="en">
      <body className="m-0 bg-[#f8f4ef] text-[#33291f]">
        <ErrorScreen />
      </body>
    </html>
  );
}
