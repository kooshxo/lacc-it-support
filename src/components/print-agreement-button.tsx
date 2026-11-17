"use client";

export function PrintAgreementButton() {
  return <button type="button" className="no-print min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => window.print()}>Print agreement</button>;
}
