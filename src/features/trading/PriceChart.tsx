import type { Lesson } from "@/api/market-types";
export default function PriceChart({
  quote,
}: {
  quote: Lesson["quotes"][number];
}) {
  const path = quote.history
    .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
    .join(" ");
  return (
    <figure className="price-chart">
      <figcaption>
        <span>{quote.symbol} / Demo USD</span>
        <strong>${quote.price}</strong>
      </figcaption>
      <svg
        viewBox="-8 0 316 130"
        role="img"
        aria-label={`${quote.symbol} scripted price history. Current price ${quote.price} Demo USD.`}
      >
        <path d="M0 30H300 M0 70H300 M0 110H300" stroke="#d8e4dc" fill="none" />
        <path
          d={path}
          fill="none"
          stroke="#17674c"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {quote.history.map((p) => (
          <circle key={p.second} cx={p.x} cy={p.y} r="3.5" fill="#17674c" />
        ))}
      </svg>
      <div className="chart-axis">
        <span>0:00</span>
        <span>3:00</span>
      </div>
      <p className="field-help">
        Scripted market · new quote every 30 seconds · past prices only
      </p>
    </figure>
  );
}
