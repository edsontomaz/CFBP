export function BikeLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M5 15.5h1.5l2-4.5 2.5 3 2.5-3 2 4.5h1.5" />
      <path d="M12 8.5V11" />
      <path d="m8 6 4-2 4 2" />
    </svg>
  );
}
